import type { TimelineElement } from "@/components/studio/timeline/types";

export type OutlineMask = { source_url: string; frame_count: number; fps: number; width: number; height: number; source_sha256: string; timestamps?: number[] };

/** An outline owns appearance and lane identity; its subject owns the clock and geometry. */
export function resolveOutlineLayers<T extends TimelineElement>(elements: T[]): T[] {
  const byId = new Map(elements.map((element) => [element.id, element]));
  return elements.map((element) => {
    const parentId = element.props?.outline_parent_id;
    if (typeof parentId !== "string") return element;
    const parent = byId.get(parentId);
    if (!parent || parent.removed_at || parent.props?.outline_parent_id) {
      return { ...element, props: { ...element.props, disabled: true } };
    }
    return {
      ...parent, id: element.id, lane_key: element.lane_key, lane_index: element.lane_index,
      created_at: element.created_at, updated_at: element.updated_at,
      removed_at: element.removed_at, removed_reason: element.removed_reason,
      volume: 0,
      props: {
        ...parent.props, title: element.props?.title ?? "Outline",
        outline_parent_id: parentId, outline_mask: element.props?.outline_mask,
        outline_source_url: element.props?.outline_source_url ?? element.source_url,
        outline_width: element.props?.outline_width ?? 8,
        outline_color: element.props?.outline_color ?? "#ffffff",
        disabled: parent.props?.disabled === true || (element.props?.outline_source_url ?? element.source_url) !== parent.source_url,
        sticker_outline: false, media_shadow: false, volume_envelope: undefined,
        preview_audio_source_url: undefined, speech_sync_binding: undefined,
      },
    } as T;
  });
}

export function outlineFrameUrl(mask: OutlineMask, sourceSeconds: number): string {
  let index = Math.max(0, Math.min(mask.frame_count - 1, Math.floor(sourceSeconds * mask.fps + 1e-6)));
  if (mask.timestamps?.length) {
    let low = 0;
    let high = mask.timestamps.length;
    while (low < high) {
      const middle = (low + high) >>> 1;
      if (mask.timestamps[middle]! <= sourceSeconds + 1e-6) low = middle + 1;
      else high = middle;
    }
    index = Math.max(0, low - 1);
  }
  return `${mask.source_url}/${String(index + 1).padStart(5, "0")}.png`;
}
