import { resolveMediaTransformAtTime } from "@/lib/timeline/media-transform";
import {
  projectNormalizedSourceBox,
  projectSourceToComposition,
  type ProjectionRect,
} from "@/lib/timeline/source-projection";

type ElementLike = {
  id: string;
  type: string;
  source_url?: string | null;
  timeline_start: number;
  duration: number;
  removed_at?: string | null;
  props?: Record<string, unknown> | null;
};

export type InteractionTargetContract = {
  id: string;
  label: string;
  click_local_seconds: number;
  target_element_id: string;
  target_bounds_normalized_source: ProjectionRect;
  cursor_hotspot_normalized: { x: number; y: number };
  evidence?: Record<string, unknown>;
};

export type InteractionTargetFinding = {
  cursor_element_id: string;
  contract_id?: string;
  label?: string;
  status: "pass" | "fail";
  message: string;
  click_timeline_seconds?: number;
  hotspot?: { x: number; y: number };
  target_bounds?: ProjectionRect;
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const rect = (value: unknown): value is ProjectionRect => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return finite(candidate.x)
    && finite(candidate.y)
    && finite(candidate.width)
    && finite(candidate.height)
    && candidate.width > 0
    && candidate.height > 0;
};

function parseContracts(value: unknown): InteractionTargetContract[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const item = candidate as Record<string, unknown>;
    const hotspot = item.cursor_hotspot_normalized;
    if (
      typeof item.id !== "string"
      || typeof item.label !== "string"
      || !finite(item.click_local_seconds)
      || typeof item.target_element_id !== "string"
      || !rect(item.target_bounds_normalized_source)
      || !hotspot
      || typeof hotspot !== "object"
      || !finite((hotspot as Record<string, unknown>).x)
      || !finite((hotspot as Record<string, unknown>).y)
    ) return [];
    return [{
      id: item.id,
      label: item.label,
      click_local_seconds: item.click_local_seconds,
      target_element_id: item.target_element_id,
      target_bounds_normalized_source: item.target_bounds_normalized_source,
      cursor_hotspot_normalized: {
        x: (hotspot as Record<string, number>).x,
        y: (hotspot as Record<string, number>).y,
      },
      evidence: item.evidence && typeof item.evidence === "object"
        ? item.evidence as Record<string, unknown>
        : undefined,
    }];
  });
}

function dimensions(element: ElementLike) {
  const width = element.props?.source_width;
  const height = element.props?.source_height;
  return finite(width) && width > 0 && finite(height) && height > 0 ? { width, height } : null;
}

function projectionFor(
  element: ElementLike,
  globalSeconds: number,
  composition: { width: number; height: number },
) {
  const source = dimensions(element);
  if (!source) return null;
  const localSeconds = globalSeconds - element.timeline_start;
  const transform = resolveMediaTransformAtTime(element.props, localSeconds);
  return projectSourceToComposition({
    source_width: source.width,
    source_height: source.height,
    composition_width: composition.width,
    composition_height: composition.height,
    fit: "contain",
    media_scale: transform.scale,
    media_offset_x: transform.offsetX,
    media_offset_y: transform.offsetY,
    timeline_time_seconds: globalSeconds,
    timeline_start_seconds: element.timeline_start,
    source_trim_start_seconds: 0,
    playback_rate: 1,
  });
}

const cursorCandidate = (element: ElementLike) => {
  const role = typeof element.props?.editorial_role === "string" ? element.props.editorial_role : "";
  return element.removed_at == null
    && element.type === "still"
    && ((element.source_url ?? "").toLowerCase().includes("cursor") || role.includes("click-emphasis"));
};

export function auditInteractionTargets(
  elements: ElementLike[],
  composition: { width: number; height: number },
): InteractionTargetFinding[] {
  const active = elements.filter((element) => element.removed_at == null);
  const byId = new Map(active.map((element) => [element.id, element]));
  const findings: InteractionTargetFinding[] = [];

  for (const cursor of active.filter(cursorCandidate)) {
    const contracts = parseContracts(cursor.props?.interaction_target_contracts);
    if (contracts.length === 0) {
      findings.push({
        cursor_element_id: cursor.id,
        status: "fail",
        message: "Cursor/click-emphasis element is not enrolled with measured interaction target contracts.",
      });
      continue;
    }

    for (const contract of contracts) {
      const target = byId.get(contract.target_element_id);
      const globalSeconds = cursor.timeline_start + contract.click_local_seconds;
      if (!target) {
        findings.push({
          cursor_element_id: cursor.id,
          contract_id: contract.id,
          label: contract.label,
          status: "fail",
          message: `Target element is missing: ${contract.target_element_id}`,
          click_timeline_seconds: globalSeconds,
        });
        continue;
      }
      if (
        globalSeconds < cursor.timeline_start
        || globalSeconds > cursor.timeline_start + cursor.duration
        || globalSeconds < target.timeline_start
        || globalSeconds > target.timeline_start + target.duration
      ) {
        findings.push({
          cursor_element_id: cursor.id,
          contract_id: contract.id,
          label: contract.label,
          status: "fail",
          message: "Click time is outside the cursor or target element interval.",
          click_timeline_seconds: globalSeconds,
        });
        continue;
      }

      const cursorProjection = projectionFor(cursor, globalSeconds, composition);
      const targetProjection = projectionFor(target, globalSeconds, composition);
      if (!cursorProjection || !targetProjection) {
        findings.push({
          cursor_element_id: cursor.id,
          contract_id: contract.id,
          label: contract.label,
          status: "fail",
          message: "Cursor or target source dimensions are missing.",
          click_timeline_seconds: globalSeconds,
        });
        continue;
      }

      const targetBounds = projectNormalizedSourceBox(
        contract.target_bounds_normalized_source,
        targetProjection,
      );
      const hotspotRect = projectNormalizedSourceBox({
        x: contract.cursor_hotspot_normalized.x,
        y: contract.cursor_hotspot_normalized.y,
        width: 0,
        height: 0,
      }, cursorProjection);
      const hotspot = { x: hotspotRect.x, y: hotspotRect.y };
      const inside = hotspot.x >= targetBounds.x
        && hotspot.x <= targetBounds.x + targetBounds.width
        && hotspot.y >= targetBounds.y
        && hotspot.y <= targetBounds.y + targetBounds.height;
      findings.push({
        cursor_element_id: cursor.id,
        contract_id: contract.id,
        label: contract.label,
        status: inside ? "pass" : "fail",
        message: inside
          ? "Cursor hotspot intersects the measured target at contact."
          : "Cursor hotspot is outside the measured target at contact.",
        click_timeline_seconds: globalSeconds,
        hotspot,
        target_bounds: targetBounds,
      });
    }
  }

  return findings;
}
