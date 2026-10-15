import { recordEditingFeedback } from "./editing-feedback";
import { currentEditAttribution } from "./edit-attribution";
import { memoryHash } from "./editing-memory";
import { randomUUID } from "node:crypto";
import fs from "node:fs";

import { projectFrameTagsPath, projectReviewDir } from "@/lib/local-store/paths";
import {
  activeElements,
  assertProject,
  captureProjectHistorySnapshot,
  getRevision,
  type ProjectMutationHistory,
  readJsonFile,
  readTimeline,
  recordProjectStateWrite,
  writeJsonFileAtomic,
  readProjectFrameRate,
} from "@/lib/local-store/store";
import {
  frameTagPoints,
  type FrameTag,
  type FrameTagPoint,
  type FrameTagsFile,
} from "@/lib/review/frame-tag-types";

const EMPTY_FRAME_TAGS: FrameTagsFile = {
  schema_version: 1,
  next_number: 1,
  tags: [],
};

function sanitizeFile(value: Partial<FrameTagsFile>): FrameTagsFile {
  return {
    schema_version: 1,
    next_number: Number.isInteger(value.next_number) && (value.next_number ?? 0) > 0
      ? value.next_number!
      : 1,
    tags: Array.isArray(value.tags)
      ? value.tags
        .filter((tag): tag is FrameTag => Boolean(
          tag
          && typeof tag.id === "string"
          && typeof tag.label === "string"
          && Number.isFinite(tag.timeline_seconds),
        ))
        .map((tag) => {
          const points = frameTagPoints(tag)
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
            .map((point) => ({
              x: Math.max(0, Math.min(1, point.x)),
              y: Math.max(0, Math.min(1, point.y)),
            }));
          const { point: _legacyPoint, points: _rawPoints, status: _legacyStatus, ...baseTag } = tag as FrameTag & { status?: unknown };
          return {
            ...baseTag,
            ...(points.length > 0 ? { points } : {}),
          } as FrameTag;
        })
        .sort((a, b) => a.timeline_seconds - b.timeline_seconds || a.created_at.localeCompare(b.created_at))
      : [],
  };
}

export function readFrameTags(projectId: string): FrameTagsFile {
  assertProject(projectId);
  return sanitizeFile(readJsonFile<Partial<FrameTagsFile>>(
    projectFrameTagsPath(projectId),
    EMPTY_FRAME_TAGS,
  ));
}

function writeFrameTags(
  projectId: string,
  value: FrameTagsFile,
  op: string,
): { file: FrameTagsFile; history: ProjectMutationHistory } {
  assertProject(projectId);
  const before = captureProjectHistorySnapshot(projectId, `${op}_before`);
  fs.mkdirSync(projectReviewDir(projectId), { recursive: true });
  const next = sanitizeFile(value);
  writeJsonFileAtomic(projectFrameTagsPath(projectId), next);
  recordProjectStateWrite(projectId);
  const after = captureProjectHistorySnapshot(projectId, op);
  return { file: next, history: { before, after } };
}

export function addFrameTag(
  projectId: string,
  timelineSeconds: number,
  selectedElementIds: string[] = [],
  point?: FrameTagPoint,
): {
  file: FrameTagsFile;
  tag: FrameTag;
  created: boolean;
  updated: boolean;
  history: ProjectMutationHistory | null;
} {
  const fps = readProjectFrameRate(projectId);
  const frameNumber = Math.round(Math.max(0, timelineSeconds) * fps);
  const seconds = frameNumber / fps;
  const file = readFrameTags(projectId);
  const duplicate = file.tags.find(
    (tag) => Math.round(tag.timeline_seconds * fps) === frameNumber,
  );
  const normalizedPoint = point
    ? {
        x: Math.max(0, Math.min(1, point.x)),
        y: Math.max(0, Math.min(1, point.y)),
      }
    : undefined;
  if (duplicate) {
    if (!normalizedPoint) {
      return { file, tag: duplicate, created: false, updated: false, history: null };
    }
    const existingPoints = frameTagPoints(duplicate);
    const alreadyMarked = existingPoints.some(
      (existing) => Math.hypot(
        existing.x - normalizedPoint.x,
        existing.y - normalizedPoint.y,
      ) < 0.002,
    );
    if (alreadyMarked) {
      return { file, tag: duplicate, created: false, updated: false, history: null };
    }
    const { point: _legacyPoint, ...duplicateWithoutLegacyPoint } = duplicate;
    const updatedTag = {
      ...duplicateWithoutLegacyPoint,
      points: [...existingPoints, normalizedPoint],
    };
    const next = writeFrameTags(projectId, {
      ...file,
      tags: file.tags.map((tag) => tag.id === duplicate.id ? updatedTag : tag),
    }, "frame_tag_point_set");
    return {
      file: next.file,
      tag: updatedTag,
      created: false,
      updated: true,
      history: next.history,
    };
  }

  const timeline = readTimeline(projectId);
  const active = activeElements(timeline).filter(
    (element) => seconds >= element.timeline_start
      && seconds < element.timeline_start + element.duration,
  );
  const selected = new Set(selectedElementIds);
  const anchorElement = active.find((element) => selected.has(element.id)) ?? active[0] ?? null;
  const localSeconds = anchorElement ? seconds - anchorElement.timeline_start : null;
  const tag: FrameTag = {
    id: randomUUID(),
    label: `M${file.next_number}`,
    timeline_seconds: seconds,
    frame_number: frameNumber,
    timeline_revision: getRevision(projectId).rev,
    active_element_ids: active.map((element) => element.id),
    anchor: {
      element_id: anchorElement?.id ?? null,
      element_local_seconds: localSeconds,
      source_seconds: anchorElement && localSeconds !== null
        ? anchorElement.trim_start + localSeconds * (anchorElement.playback_rate || 1)
        : null,
    },
    ...(normalizedPoint ? { points: [normalizedPoint] } : {}),
    created_at: new Date().toISOString(),
  };
  const next = writeFrameTags(projectId, {
    schema_version: 1,
    next_number: file.next_number + 1,
    tags: [...file.tags, tag],
  }, "frame_tag_add");
  return { file: next.file, tag, created: true, updated: false, history: next.history };
}

export function removeFrameTag(projectId: string, tagId: string) {
  const file = readFrameTags(projectId);
  const remaining = file.tags.filter((tag) => tag.id !== tagId);
  if (remaining.length === file.tags.length) return { file, history: null };
  return writeFrameTags(projectId, {
    schema_version: 1,
    next_number: remaining.length + 1,
    tags: remaining.map((tag, index) => ({
      ...tag,
      label: `M${index + 1}`,
    })),
  }, "frame_tag_remove");
}

export function updateFrameTag(projectId: string, tagId: string, patch: { note?: string }) {
  const file = readFrameTags(projectId);
  const previous = file.tags.find(tag => tag.id === tagId);
  if (!previous) throw Object.assign(new Error("Mark not found"), { status: 404 });
  if (patch.note?.trim() && patch.note !== previous.note && currentEditAttribution("frame_tag_update").actor === "human") {
    recordEditingFeedback({ project_id: projectId, session_id: "review-marks",
      turn_id: memoryHash({ tagId, revision: getRevision(projectId).rev, note: patch.note }),
      direction: patch.note, provenance: "user_words", targets: { review_mark_ids: [tagId],
        element_ids: previous.active_element_ids, timeline_range: { start: previous.timeline_seconds, end: previous.timeline_seconds } },
    }, "human");
  }
  return writeFrameTags(projectId, { ...file, tags: file.tags.map(tag => tag.id === tagId ? { ...tag, ...patch } : tag) }, "frame_tag_update");
}

export function clearFrameTags(projectId: string) {
  const file = readFrameTags(projectId);
  if (file.tags.length === 0) return { file, history: null };
  return writeFrameTags(projectId, EMPTY_FRAME_TAGS, "frame_tags_clear");
}
