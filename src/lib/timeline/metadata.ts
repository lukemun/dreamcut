import { sanitizeCaptionStyleProps } from "@/lib/timeline/captions";
import { isCaptionsLane } from "@/lib/timeline/lanes";
import { isTimelineAspectRatioValue, type TimelineAspectRatioValue } from "@/lib/aspect-ratios";

export type TimelineLaneDefaultsMap = Record<string, Record<string, unknown>>;
export type TimelineOutputAspectRatio = TimelineAspectRatioValue;
export type UploadedVisualAssetType = "still" | "video_clip";
export type UploadedVisualAsset = {
  id: string;
  asset_type: UploadedVisualAssetType;
  url: string;
  storage_path: string;
  content_type: string;
  original_filename: string | null;
  duration_seconds: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
};

export type TimelineMetadata = {
  lane_order_keys: string[];
  lane_defaults: TimelineLaneDefaultsMap;
  muted_lane_keys: string[];
  hidden_lane_keys: string[];
  output_aspect_ratio: TimelineOutputAspectRatio;
  media_preprocessing_enabled: boolean;
};

const LANE_KEY_PATTERN = /^[a-z0-9_:-]+$/;

export function isTimelineLaneKey(value: unknown): value is string {
  return typeof value === "string" && LANE_KEY_PATTERN.test(value);
}

export function sanitizeLaneOrderKeys(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter(isTimelineLaneKey))];
}

const SOUND_ONLY_ELEMENT_TYPES = new Set(["music", "vo_segment", "vo_full", "sound_effect"]);

/**
 * Lane visibility split (decided 2026-10-10): `muted_lane_keys` silences a lane's
 * sound only; `hidden_lane_keys` removes its pictures and text. Before the split a
 * muted lane removed everything, so metadata written without `hidden_lane_keys`
 * reads as legacy: each muted lane that holds a visual element is also hidden.
 * The lane stays muted, so the old silent-and-invisible result is preserved.
 * Pure and idempotent; disk is only stamped by the next metadata write.
 */
export function resolveHiddenLaneKeys(
  rawHidden: unknown,
  mutedLaneKeys: readonly string[],
  elements: ReadonlyArray<{ lane_key: string; type: string }> | (() => ReadonlyArray<{ lane_key: string; type: string }>),
): string[] {
  if (Array.isArray(rawHidden)) return sanitizeLaneOrderKeys(rawHidden);
  if (mutedLaneKeys.length === 0) return [];
  const list = typeof elements === "function" ? elements() : elements;
  const visualLanes = new Set(
    list.filter((element) => !SOUND_ONLY_ELEMENT_TYPES.has(element.type)).map((element) => element.lane_key),
  );
  return sanitizeLaneOrderKeys(mutedLaneKeys.filter((key) => visualLanes.has(key)));
}

export function sanitizeLaneDefaults(raw: unknown): TimelineLaneDefaultsMap {
  if (!raw || typeof raw !== "object") return {};
  const next: TimelineLaneDefaultsMap = {};
  for (const [laneKey, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isTimelineLaneKey(laneKey) || !value || typeof value !== "object") continue;
    next[laneKey] = isCaptionsLane(laneKey)
      ? sanitizeCaptionStyleProps(value as Record<string, unknown>)
      : { ...(value as Record<string, unknown>) };
  }
  return next;
}

export function sanitizeTimelineOutputAspectRatio(raw: unknown): TimelineOutputAspectRatio {
  return isTimelineAspectRatioValue(raw) ? raw : "9:16";
}

function isUploadedVisualAssetType(value: unknown): value is UploadedVisualAssetType {
  return value === "still" || value === "video_clip";
}

export function sanitizeUploadedVisuals(raw: unknown): UploadedVisualAsset[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Record<string, unknown>;
    if (
      typeof candidate.id !== "string"
      || !isUploadedVisualAssetType(candidate.asset_type)
      || typeof candidate.url !== "string"
      || typeof candidate.storage_path !== "string"
      || typeof candidate.content_type !== "string"
      || typeof candidate.created_at !== "string"
    ) {
      return [];
    }

    return [{
      id: candidate.id,
      asset_type: candidate.asset_type,
      url: candidate.url,
      storage_path: candidate.storage_path,
      content_type: candidate.content_type,
      original_filename: typeof candidate.original_filename === "string" ? candidate.original_filename : null,
      duration_seconds:
        typeof candidate.duration_seconds === "number" && Number.isFinite(candidate.duration_seconds)
          ? candidate.duration_seconds
          : null,
      metadata:
        candidate.metadata && typeof candidate.metadata === "object"
          ? { ...(candidate.metadata as Record<string, unknown>) }
          : {},
      created_at: candidate.created_at,
    }];
  });
}

export function readTimelineMetadata(raw: unknown): TimelineMetadata {
  const metadata = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return {
    lane_order_keys: sanitizeLaneOrderKeys(metadata.lane_order_keys),
    lane_defaults: sanitizeLaneDefaults(metadata.lane_defaults),
    muted_lane_keys: sanitizeLaneOrderKeys(metadata.muted_lane_keys),
    hidden_lane_keys: sanitizeLaneOrderKeys(metadata.hidden_lane_keys),
    output_aspect_ratio: sanitizeTimelineOutputAspectRatio(metadata.output_aspect_ratio),
    media_preprocessing_enabled: metadata.media_preprocessing_enabled === true,
  };
}

export function readUploadedVisuals(raw: unknown): UploadedVisualAsset[] {
  const metadata = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
  return sanitizeUploadedVisuals(metadata.uploaded_visuals);
}

export function buildTimelineMetadataPatch(
  existing: unknown,
  patch: Partial<TimelineMetadata>,
): Record<string, unknown> {
  const current = readTimelineMetadata(existing);
  return {
    ...((existing && typeof existing === "object") ? existing as Record<string, unknown> : {}),
    ...(patch.lane_order_keys ? { lane_order_keys: sanitizeLaneOrderKeys(patch.lane_order_keys) } : { lane_order_keys: current.lane_order_keys }),
    ...(patch.lane_defaults ? { lane_defaults: sanitizeLaneDefaults(patch.lane_defaults) } : { lane_defaults: current.lane_defaults }),
    ...(patch.muted_lane_keys ? { muted_lane_keys: sanitizeLaneOrderKeys(patch.muted_lane_keys) } : { muted_lane_keys: current.muted_lane_keys }),
    ...(patch.hidden_lane_keys ? { hidden_lane_keys: sanitizeLaneOrderKeys(patch.hidden_lane_keys) } : { hidden_lane_keys: current.hidden_lane_keys }),
    ...(patch.output_aspect_ratio ? { output_aspect_ratio: sanitizeTimelineOutputAspectRatio(patch.output_aspect_ratio) } : { output_aspect_ratio: current.output_aspect_ratio }),
    ...(patch.media_preprocessing_enabled !== undefined
      ? { media_preprocessing_enabled: patch.media_preprocessing_enabled === true }
      : { media_preprocessing_enabled: current.media_preprocessing_enabled }),
  };
}

export function buildTimelineMetadataWithUploadedVisuals(
  existing: unknown,
  uploadedVisuals: UploadedVisualAsset[],
): Record<string, unknown> {
  const current = existing && typeof existing === "object" ? existing as Record<string, unknown> : {};
  return {
    ...current,
    uploaded_visuals: sanitizeUploadedVisuals(uploadedVisuals),
  };
}
