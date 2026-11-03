import type { TimelineElement } from "@/components/studio/timeline/types";

import type { TimelineFile } from "@/lib/local-store/store";

/**
 * Browser-only preview data must never become part of timeline.json. These
 * values can be multi-megabyte data URLs and are rebuilt by the mounted editor.
 */
export const RUNTIME_PREVIEW_PROP_KEYS = [
  "runtime_cutout_effect_preview",
  "runtime_media_fill_preview",
  "runtime_source_has_audio",
  "runtime_preview_source_url",
  "runtime_still_preview",
  "runtime_preview_audio_source_url",
  "runtime_preview_audio_reverse_source_url",
  "runtime_preview_audio_reverse_duration",
  "runtime_preview_preparation",
  "preview_proxy_validation",
  "compound_proxy_validation",
  "runtime_compound_clip_id",
  "runtime_compound_preview",
  "overflow_hold_start_frame_url",
  "overflow_hold_frame_url",
] as const;

export function stripRuntimePreviewProps(
  props: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!props) return {};
  if (!RUNTIME_PREVIEW_PROP_KEYS.some((key) => key in props)) return props;
  const durable = { ...props };
  for (const key of RUNTIME_PREVIEW_PROP_KEYS) delete durable[key];
  return durable;
}

export function stripRuntimePreviewPropsFromTimeline(timeline: TimelineFile): TimelineFile {
  let changed = false;
  const elements = timeline.elements.map((element) => {
    const props = stripRuntimePreviewProps(element.props as Record<string, unknown> | null | undefined);
    if (props === element.props) return element;
    changed = true;
    return { ...element, props } as TimelineElement;
  });
  return changed ? { ...timeline, elements } : timeline;
}

/** Preparation completion refreshes only cache metadata, never in-flight edits. */
export function mergeRuntimePreviewProps(current: TimelineElement[], incoming: TimelineElement[]): TimelineElement[] {
  const byId = new Map(incoming.map(element => [element.id, element]));
  const keys = RUNTIME_PREVIEW_PROP_KEYS.filter(key => !key.startsWith("overflow_"));
  return current.map(element => {
    const fresh = byId.get(element.id);
    if (!fresh || fresh.props?.mediaFillVideoUrl !== element.props?.mediaFillVideoUrl
      || fresh.props?.mediaFillVideoPreviewUrl !== element.props?.mediaFillVideoPreviewUrl
      || fresh.source_url !== element.source_url
      || fresh.props?.preview_source_url !== element.props?.preview_source_url
      || fresh.props?.archival_source_url !== element.props?.archival_source_url) return element;
    if (keys.every(key => JSON.stringify(fresh.props?.[key]) === JSON.stringify(element.props?.[key]))) return element;
    const props = { ...element.props };
    for (const key of keys) {
      delete props[key];
      if (fresh.props?.[key] !== undefined) props[key] = fresh.props[key];
    }
    return { ...element, props };
  });
}

/**
 * Timeline mutation routes return durable element rows. Preserve the mounted
 * editor's disposable proxy bindings when that durable row still names the
 * same media authority. A shallow `{ ...current, ...incoming }` merge replaces
 * the complete props object and otherwise makes a prepared video look
 * unprepared immediately after an ordinary position or appearance edit.
 */
export function mergeElementPreservingRuntimePreview(
  current: TimelineElement,
  incoming: TimelineElement,
): TimelineElement {
  const merged = { ...current, ...incoming };
  const samePreviewIdentity = current.props?.mediaFillVideoUrl === incoming.props?.mediaFillVideoUrl
    && current.props?.mediaFillVideoPreviewUrl === incoming.props?.mediaFillVideoPreviewUrl
    && current.source_url === incoming.source_url
    && current.props?.preview_source_url === incoming.props?.preview_source_url
    && current.props?.archival_source_url === incoming.props?.archival_source_url;
  if (!samePreviewIdentity) return merged;

  const props = { ...(incoming.props ?? {}) };
  for (const key of RUNTIME_PREVIEW_PROP_KEYS) {
    if (props[key] === undefined && current.props?.[key] !== undefined) {
      props[key] = current.props[key];
    }
  }
  return { ...merged, props };
}

/** Replace a server-returned element list while retaining valid runtime-only
 * media state for rows that still refer to the same source and proxy identity. */
export function mergeElementListPreservingRuntimePreview(
  current: TimelineElement[],
  incoming: TimelineElement[],
): TimelineElement[] {
  const currentById = new Map(current.map((element) => [element.id, element]));
  return incoming.map((element) => {
    const mounted = currentById.get(element.id);
    return mounted ? mergeElementPreservingRuntimePreview(mounted, element) : element;
  });
}
