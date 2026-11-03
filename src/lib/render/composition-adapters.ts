import type {
  TimelineAspectRatio,
  TimelineElement,
  TimelineTransition,
} from "@/components/studio/timeline/types";

import { resolveOutlineLayers } from "@/lib/timeline/outline-layer";
import { resolveCutoutEffects } from "@/lib/timeline/cutout-effects";
import { resolveSubjectWindowBindings } from "@/lib/timeline/subject-window";

export type CompositionElement = {
  id: string;
  type: string;
  source_url: string | null;
  props?: Record<string, unknown> | null;
  timeline_start: number;
  duration: number;
  lane_key: string;
  lane_index: number;
  volume: number;
  playback_rate: number;
  trim_start: number;
  trim_end: number | null;
  fade_in: number;
  fade_out: number;
  transition_in?: TimelineTransition | null;
  transition_out?: TimelineTransition | null;
  /**
   * Set only for a video clip on a hidden, unmuted lane: its sound still plays but
   * no renderer draws its picture or lets it anchor captions/compositing.
   */
  picture_hidden?: true;
};

const SOUND_ONLY_TYPES = new Set(["music", "vo_segment", "vo_full", "sound_effect"]);

/** Mute silences a lane's sound; hide removes its pictures and text. Both together remove the actor. */
export function applyLaneVisibility<T extends { type: string; lane_key: string; volume: number; props?: Record<string, unknown> | null }>(
  element: T,
  mutedLanes: ReadonlySet<string>,
  hiddenLanes: ReadonlySet<string>,
): (T & { picture_hidden?: true }) | null {
  const muted = mutedLanes.has(element.lane_key);
  const hidden = hiddenLanes.has(element.lane_key);
  if (!muted && !hidden) return element;
  const soundOnly = SOUND_ONLY_TYPES.has(element.type);
  if (soundOnly) return muted ? null : element;
  if (element.type !== "video_clip") return hidden ? null : element;
  if (muted && hidden) return null;
  if (hidden) return { ...element, picture_hidden: true };
  // Muted picture: the same silent-picture form prepared export uses (zero gain, no envelope).
  const props = element.props ? { ...element.props } : element.props;
  if (props) delete props.volume_envelope;
  return { ...element, volume: 0, props };
}

export function isPictureHidden(element: { picture_hidden?: boolean }): boolean {
  return element.picture_hidden === true;
}

export function getCompositionDimensions(aspectRatio: TimelineAspectRatio) {
  switch (aspectRatio) {
    case "16:9":
      return { width: 1920, height: 1080 };
    case "9:16":
      return { width: 1080, height: 1920 };
    case "4:5":
      return { width: 1080, height: 1350 };
    case "2:3":
      return { width: 1080, height: 1620 };
    case "3:4":
      return { width: 1080, height: 1440 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "4:3":
      return { width: 1440, height: 1080 };
    default:
      return { width: 1080, height: 1920 };
  }
}

export function buildCompositionElements(
  elements: TimelineElement[],
  mutedLanes: ReadonlySet<string>,
  hiddenLanes: ReadonlySet<string> = new Set(),
): CompositionElement[] {
  const composed = resolveOutlineLayers(elements)
    .filter((el) => !el.props?.disabled)
    .map((el) => ({
      id: el.id,
      type: el.type,
      source_url: el.source_url,
      props: el.props,
      timeline_start: el.rendered_timeline_start ?? el.timeline_start,
      duration: el.rendered_duration ?? el.duration,
      lane_key: el.lane_key,
      lane_index: el.lane_index,
      volume: el.volume,
      playback_rate: el.playback_rate ?? 1,
      trim_start: el.trim_start,
      trim_end: el.trim_end,
      fade_in: el.fade_in,
      fade_out: el.fade_out,
      transition_in: el.transition_in ?? null,
      transition_out: el.transition_out ?? null,
    }) as CompositionElement);
  // A subject window follows its subject's clock even when the subject's lane is hidden or muted.
  return resolveSubjectWindowBindings(composed)
    .flatMap((el) => {
      const visible = applyLaneVisibility(el, mutedLanes, hiddenLanes);
      return visible ? [visible] : [];
    })
    .map(resolveCutoutEffects);
}
