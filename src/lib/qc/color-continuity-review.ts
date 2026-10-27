import { createHash } from "node:crypto";
import path from "node:path";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { readJsonFile, writeJsonFileAtomic } from "@/lib/local-store/atomic-json";
import { projectReviewDir } from "@/lib/local-store/paths";
import {
  COLOR_GRADE_KEYFRAME_FIELDS,
  hasColorGradeData,
  resolveColorGradeAtTime,
} from "@/lib/timeline/color-grade";

const FPS = 30;
const FRAME_SECONDS = 1 / FPS;
const ADJACENCY_TOLERANCE_SECONDS = 1.5 / FPS;

export type ColorContinuityDecision = "approved_as_is" | "change_requested";

export type ColorContinuityBoundary = {
  id: string;
  atSeconds: number;
  kind: "source_rgb_overlay" | "color_treatment_change" | "color_grade_keyframe";
  elementIds: string[];
  label: string;
  observation: string;
  suggestions: string[];
  sampleTimes: number[];
};

export type ColorContinuityReviewReceipt = {
  schema_version: 1;
  timeline_revision: number;
  reviewed_at: string;
  decisions: Array<{
    boundary_id: string;
    decision: ColorContinuityDecision;
    note?: string;
  }>;
};

export type ColorContinuityReviewReport = {
  schemaVersion: 1;
  timelineRevision: number;
  status: "clear" | "review_required" | "approved" | "changes_requested";
  boundaries: ColorContinuityBoundary[];
  staleReceipt: boolean;
  reviewedBoundaryIds: string[];
  levelMap: {
    observations: "L1";
    boundaries: "L2";
    suggestions: "L4";
  };
  policy: {
    advisoryOnly: true;
    automaticTimelineChanges: false;
  };
};

function receiptPath(projectId: string) {
  return path.join(projectReviewDir(projectId), "color-continuity-review.json");
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  }
  return value;
}

function boundaryId(parts: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(stableValue(parts)))
    .digest("hex")
    .slice(0, 16);
}

function activeVisualElements(elements: TimelineElement[]) {
  return elements.filter((element) =>
    !element.removed_at
    && element.props?.disabled !== true
    && element.lane_key.startsWith("visual_")
    && (element.type === "video_clip" || element.type === "still"));
}

function isSourceDerivedRgbAlpha(element: TimelineElement) {
  if (element.type !== "video_clip" || element.props?.has_alpha !== true) return false;
  return [
    "mask_recipe",
    "tracking_receipt",
    "source_render_authority",
    "rgb_parent_authority_source_url",
    "selection",
  ].some((key) => {
    const value = element.props?.[key];
    return typeof value === "string" && value.trim().length > 0;
  }) || element.props?.rgb_parent_authority_required === true;
}

function mediaIdentity(element: TimelineElement) {
  const sourceId = element.props?.source_id;
  if (typeof sourceId === "string" && sourceId.trim()) return `source:${sourceId.trim()}`;
  return `url:${(element.source_url ?? "").split(/[?#]/, 1)[0]}`;
}

function treatmentFingerprint(element: TimelineElement, localSeconds: number) {
  const props = element.props ?? {};
  const grade = resolveColorGradeAtTime(props, Math.max(0, localSeconds));
  return JSON.stringify(stableValue({
    color_grade_model: props.color_grade_model ?? null,
    grade,
    lut_asset_id: props.lut_asset_id ?? null,
    lut_source_url: props.lut_source_url ?? null,
    lut_intensity: props.lut_intensity ?? null,
  }));
}

function sampleTimes(atSeconds: number, durationSeconds: number) {
  return [-2, 0, 2]
    .map((offsetFrames) => Math.min(
      Math.max(0, durationSeconds - FRAME_SECONDS),
      Math.max(0, atSeconds + offsetFrames * FRAME_SECONDS),
    ))
    .filter((value, index, values) =>
      values.findIndex((candidate) => Math.abs(candidate - value) < 0.0005) === index)
    .map((value) => Number(value.toFixed(3)));
}

function makeBoundary(
  input: Omit<ColorContinuityBoundary, "id" | "sampleTimes">,
  durationSeconds: number,
): ColorContinuityBoundary {
  return {
    ...input,
    id: boundaryId({
      kind: input.kind,
      atSeconds: Number(input.atSeconds.toFixed(3)),
      elementIds: [...input.elementIds].sort(),
    }),
    sampleTimes: sampleTimes(input.atSeconds, durationSeconds),
  };
}

/**
 * L1: read descriptive treatment fields from each active timeline element.
 * L2: compare those observations at joins and effect boundaries.
 * L4: attach goal-bearing review suggestions without mutating the L1/L2 record.
 */
export function deriveColorContinuityBoundaries(
  elements: TimelineElement[],
  durationSeconds: number,
): ColorContinuityBoundary[] {
  const visual = activeVisualElements(elements);
  const boundaries: ColorContinuityBoundary[] = [];

  for (const element of visual) {
    if (isSourceDerivedRgbAlpha(element)) {
      const label = typeof element.props?.timeline_label === "string"
        ? element.props.timeline_label
        : "Source-derived cutout";
      for (const [edge, atSeconds] of [
        ["starts", element.timeline_start],
        ["ends", element.timeline_start + element.duration],
      ] as const) {
        if (atSeconds <= FRAME_SECONDS || atSeconds >= durationSeconds - FRAME_SECONDS) continue;
        boundaries.push(makeBoundary({
          atSeconds,
          kind: "source_rgb_overlay",
          elementIds: [element.id],
          label: `${label} ${edge}`,
          observation: `An RGB-bearing cutout ${edge} here. Check the subject's skin tone, contrast, and exposure immediately before and after the boundary.`,
          suggestions: [
            "Open this boundary",
            "Keep it as intentional",
            "Match the surrounding shot",
            "Remove the effect",
          ],
        }, durationSeconds));
      }
    }

    const keyframes = element.props?.keyframes;
    if (!keyframes || typeof keyframes !== "object" || Array.isArray(keyframes)) continue;
    const keyframeMap = keyframes as Record<string, unknown>;
    const localTimes = new Set<number>();
    for (const field of COLOR_GRADE_KEYFRAME_FIELDS) {
      const points = keyframeMap[field];
      if (!Array.isArray(points)) continue;
      for (const point of points) {
        if (!point || typeof point !== "object") continue;
        const localTime = (point as Record<string, unknown>).t;
        if (typeof localTime === "number" && Number.isFinite(localTime) && localTime > 0 && localTime < element.duration) {
          localTimes.add(localTime);
        }
      }
    }
    for (const localTime of localTimes) {
      const atSeconds = element.timeline_start + localTime;
      boundaries.push(makeBoundary({
        atSeconds,
        kind: "color_grade_keyframe",
        elementIds: [element.id],
        label: "Color treatment changes",
        observation: "A color-grade keyframe changes the treatment here. Check that the change is smooth or deliberately motivated.",
        suggestions: [
          "Open this boundary",
          "Keep it as intentional",
          "Smooth the grade change",
          "Match the surrounding shot",
        ],
      }, durationSeconds));
    }
  }

  const byLane = new Map<string, TimelineElement[]>();
  for (const element of visual) {
    const lane = byLane.get(element.lane_key) ?? [];
    lane.push(element);
    byLane.set(element.lane_key, lane);
  }
  for (const laneElements of byLane.values()) {
    laneElements.sort((left, right) => left.timeline_start - right.timeline_start);
    for (let index = 0; index < laneElements.length - 1; index += 1) {
      const outgoing = laneElements[index]!;
      const incoming = laneElements[index + 1]!;
      const outgoingEnd = outgoing.timeline_start + outgoing.duration;
      if (Math.abs(incoming.timeline_start - outgoingEnd) > ADJACENCY_TOLERANCE_SECONDS) continue;
      if (mediaIdentity(outgoing) !== mediaIdentity(incoming)) continue;
      if (!hasColorGradeData(outgoing.props) && !hasColorGradeData(incoming.props)) continue;
      const before = treatmentFingerprint(outgoing, Math.max(0, outgoing.duration - FRAME_SECONDS));
      const after = treatmentFingerprint(incoming, Math.min(incoming.duration, FRAME_SECONDS));
      if (before === after) continue;
      boundaries.push(makeBoundary({
        atSeconds: incoming.timeline_start,
        kind: "color_treatment_change",
        elementIds: [outgoing.id, incoming.id],
        label: "Adjacent treatment mismatch",
        observation: "Two adjacent pieces of the same source use different color treatments at this join.",
        suggestions: [
          "Open this boundary",
          "Keep it as intentional",
          "Match the incoming shot to the previous shot",
          "Remove the unintended grade",
        ],
      }, durationSeconds));
    }
  }

  return [...new Map(
    boundaries
      .sort((left, right) => left.atSeconds - right.atSeconds || left.id.localeCompare(right.id))
      .map((boundary) => [boundary.id, boundary]),
  ).values()];
}

export function readColorContinuityReceipt(projectId: string): ColorContinuityReviewReceipt | null {
  const receipt = readJsonFile<Partial<ColorContinuityReviewReceipt> | null>(receiptPath(projectId), null);
  if (
    !receipt
    || receipt.schema_version !== 1
    || typeof receipt.timeline_revision !== "number"
    || !Array.isArray(receipt.decisions)
  ) return null;
  return receipt as ColorContinuityReviewReceipt;
}

export function assessColorContinuityReview(input: {
  projectId: string;
  timelineRevision: number;
  elements: TimelineElement[];
  durationSeconds: number;
}): ColorContinuityReviewReport {
  const boundaries = deriveColorContinuityBoundaries(input.elements, input.durationSeconds);
  const receipt = readColorContinuityReceipt(input.projectId);
  const currentReceipt = receipt?.timeline_revision === input.timelineRevision ? receipt : null;
  const decisions = new Map(currentReceipt?.decisions.map((decision) => [decision.boundary_id, decision]));
  const reviewedBoundaryIds = boundaries
    .filter((boundary) => decisions.has(boundary.id))
    .map((boundary) => boundary.id);
  const hasRequestedChanges = boundaries.some((boundary) =>
    decisions.get(boundary.id)?.decision === "change_requested");
  const allReviewed = boundaries.every((boundary) =>
    decisions.get(boundary.id)?.decision === "approved_as_is");
  const status = boundaries.length === 0
    ? "clear"
    : hasRequestedChanges
      ? "changes_requested"
      : allReviewed
        ? "approved"
        : "review_required";

  return {
    schemaVersion: 1,
    timelineRevision: input.timelineRevision,
    status,
    boundaries,
    staleReceipt: receipt != null && currentReceipt == null,
    reviewedBoundaryIds,
    levelMap: {
      observations: "L1",
      boundaries: "L2",
      suggestions: "L4",
    },
    policy: {
      advisoryOnly: true,
      automaticTimelineChanges: false,
    },
  };
}

export function recordColorContinuityDecision(input: {
  projectId: string;
  timelineRevision: number;
  boundaryIds: string[];
  decision: ColorContinuityDecision;
  note?: string;
}) {
  const existing = readColorContinuityReceipt(input.projectId);
  const decisions = new Map(
    existing?.timeline_revision === input.timelineRevision
      ? existing.decisions.map((entry) => [entry.boundary_id, entry])
      : [],
  );
  for (const boundaryIdValue of input.boundaryIds) {
    decisions.set(boundaryIdValue, {
      boundary_id: boundaryIdValue,
      decision: input.decision,
      ...(input.note?.trim() ? { note: input.note.trim() } : {}),
    });
  }
  const receipt: ColorContinuityReviewReceipt = {
    schema_version: 1,
    timeline_revision: input.timelineRevision,
    reviewed_at: new Date().toISOString(),
    decisions: [...decisions.values()].sort((left, right) =>
      left.boundary_id.localeCompare(right.boundary_id)),
  };
  writeJsonFileAtomic(receiptPath(input.projectId), receipt);
  return receipt;
}
