import type { TimelineElement, TimelineTransition } from "@/components/studio/timeline/types";
import type { TimelineFile } from "@/lib/local-store/store";
import { stripRuntimePreviewPropsFromTimeline } from "@/lib/timeline/runtime-preview-props";

/**
 * Versioned schema for timeline.json, with a migration chain run on every read.
 *
 * Why: the file is hand-editable by design, and the format has drifted silently
 * before — a row written without `playback_rate` threw from preview-cache code
 * the moment thumbnails loaded, presenting as an editor bug (CLAUDE.md, earned
 * 2026-07-21). A migration chain turns that class of drift into a loud, testable
 * upgrade instead of a runtime surprise.
 *
 * Contract:
 * - A file with no `schema_version` is version 0 (every file written before
 *   versioning existed).
 * - Migration is applied ON READ, pure — the file on disk is not rewritten by a
 *   read (writing back would race the editor's 2s external-change poll). The
 *   next real write stamps CURRENT_TIMELINE_SCHEMA_VERSION.
 * - A file from a NEWER schema than this build fails closed rather than being
 *   silently reinterpreted.
 */

export const CURRENT_TIMELINE_SCHEMA_VERSION = 3;

export type RawTimelineFile = Partial<TimelineFile> & { schema_version?: unknown };

/**
 * v0 → v1: guarantee every element row carries the full numeric/flag field set
 * the canvas and renderer read unconditionally. Defaults mirror what the API
 * writes for a new row of the same type.
 */
function migrateV0toV1(timeline: TimelineFile): TimelineFile {
  const now = new Date().toISOString();
  const elements = timeline.elements.map((element) => {
    const row = element as Partial<TimelineElement> & Record<string, unknown>;
    const laneKey = typeof row.lane_key === "string" && row.lane_key ? row.lane_key : "visual_0";
    const laneSuffix = Number(laneKey.match(/_(\d+)$/)?.[1]);
    return {
      ...row,
      lane_key: laneKey,
      lane_index: typeof row.lane_index === "number" ? row.lane_index : (Number.isFinite(laneSuffix) ? laneSuffix : 0),
      props: row.props && typeof row.props === "object" && !Array.isArray(row.props) ? row.props : {},
      timeline_start: typeof row.timeline_start === "number" ? row.timeline_start : 0,
      duration: typeof row.duration === "number" && row.duration > 0 ? row.duration : 0.1,
      trim_start: typeof row.trim_start === "number" ? row.trim_start : 0,
      trim_end: typeof row.trim_end === "number" ? row.trim_end : null,
      volume: typeof row.volume === "number" ? row.volume : 1,
      fade_in: typeof row.fade_in === "number" ? row.fade_in : 0,
      fade_out: typeof row.fade_out === "number" ? row.fade_out : 0,
      playback_rate: typeof row.playback_rate === "number" && row.playback_rate > 0 ? row.playback_rate : 1,
      position_locked: typeof row.position_locked === "boolean" ? row.position_locked : false,
      beat_id: row.beat_id ?? null,
      character_id: row.character_id ?? null,
      source_url: typeof row.source_url === "string" ? row.source_url : null,
      removed_at: typeof row.removed_at === "string" ? row.removed_at : null,
      removed_reason: typeof row.removed_reason === "string" ? row.removed_reason : null,
      created_at: typeof row.created_at === "string" ? row.created_at : now,
      updated_at: typeof row.updated_at === "string" ? row.updated_at : now,
    } as TimelineElement;
  });
  return { elements, transitions: timeline.transitions };
}

/**
 * v1 → v2: remove browser-only overflow-frame captures that older editor
 * builds could accidentally merge into durable props. A single PNG data URL
 * can be several megabytes and made every edit/history snapshot stall.
 */
function migrateV1toV2(timeline: TimelineFile): TimelineFile {
  return stripRuntimePreviewPropsFromTimeline(timeline);
}

/**
 * v2 → v3: complete the project-model rename (made under the OpenEdit name) in persisted timelines.
 * Old files remain readable, but every subsequent write uses `project_id` and
 * the canonical `/api/projects/` media route.
 */
function migrateV2toV3(timeline: TimelineFile): TimelineFile {
  const migrateValue = (value: unknown): unknown => {
    if (typeof value === "string") return value.replace(/^\/api\/trailers\//, "/api/projects/");
    if (Array.isArray(value)) return value.map(migrateValue);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, migrateValue(nested)]));
  };
  const migrateRow = <T extends Record<string, unknown>>(row: T): T => {
    const migrated = migrateValue(row) as T & { trailer_id?: unknown; project_id?: unknown };
    const { trailer_id: legacyProjectId, ...rest } = migrated;
    return {
      ...rest,
      project_id: typeof migrated.project_id === "string" ? migrated.project_id : legacyProjectId,
    } as T;
  };
  return {
    elements: timeline.elements.map((row) => migrateRow(row as unknown as Record<string, unknown>) as unknown as TimelineElement),
    transitions: timeline.transitions.map((row) => migrateRow(row as unknown as Record<string, unknown>) as unknown as TimelineTransition),
  };
}

/** Ordered chain: index i migrates version i → i+1. */
const MIGRATIONS: ReadonlyArray<(timeline: TimelineFile) => TimelineFile> = [
  migrateV0toV1,
  migrateV1toV2,
  migrateV2toV3,
];

export function migrateTimelineFile(raw: RawTimelineFile): { timeline: TimelineFile; fromVersion: number } {
  const declared = raw.schema_version;
  const fromVersion = typeof declared === "number" && Number.isInteger(declared) && declared >= 0 ? declared : 0;
  if (fromVersion > CURRENT_TIMELINE_SCHEMA_VERSION) {
    throw new Error(
      `timeline.json is schema_version ${fromVersion}, newer than this editor's ${CURRENT_TIMELINE_SCHEMA_VERSION} — refusing to reinterpret it. Update the editor.`,
    );
  }
  let timeline: TimelineFile = {
    elements: Array.isArray(raw.elements) ? raw.elements : [],
    transitions: Array.isArray(raw.transitions) ? (raw.transitions as TimelineTransition[]) : [],
  };
  for (let version = fromVersion; version < CURRENT_TIMELINE_SCHEMA_VERSION; version += 1) {
    timeline = MIGRATIONS[version]!(timeline);
  }
  return { timeline, fromVersion };
}
