import type { AspectRatioValue, TimelineAspectRatioValue } from "@/lib/aspect-ratios";

export type TimelineElement = {
  id: string;
  project_id: string;
  type: string;
  source_url: string | null;
  props: Record<string, unknown> | null;
  beat_id: string | null;
  voice_clip_id?: string | null;
  character_id: string | null;
  timeline_start: number;
  duration: number;
  lane_key: string;
  lane_index: number;
  trim_start: number;
  trim_end: number | null;
  volume: number;
  fade_in: number;
  fade_out: number;
  playback_rate: number;
  position_locked: boolean;
  removed_at: string | null;
  removed_reason: string | null;
  created_at: string;
  updated_at: string;
  /** Transient: pre-computed waveform peaks (0..1), joined from audio_peaks table */
  _peaks?: number[];
  /** Transient: source audio duration in seconds, from audio_peaks table */
  _source_duration?: number;
  /** Transient: derived start used by timeline preview/render consumers; currently matches persisted start */
  rendered_timeline_start?: number;
  /** Transient: derived duration used by timeline preview/render consumers; currently matches persisted duration */
  rendered_duration?: number;
  /** Transient: derived end used by preview/render consumers */
  rendered_end?: number;
  /** Transient: incoming transition metadata for this rendered element */
  transition_in?: TimelineTransition | null;
  /** Transient: outgoing transition metadata for this rendered element */
  transition_out?: TimelineTransition | null;
  /** Transient: reserved for render-only transition metadata; currently zero in the fixed-bounds model */
  transition_in_offset_seconds?: number;
};

export type TimelineTransitionType = "fade" | "slide" | "wipe" | "whip" | "cube" | "page_turn" | "film_burn" | "camera_flash" | "blackout";

export type TimelineTransitionDirection =
  | "from-left"
  | "from-right"
  | "from-top"
  | "from-bottom";

export type PageTurnOrigin = "right-edge" | "bottom-right";

export type TimelineTransitionParams = {
  direction?: TimelineTransitionDirection;
  motion?: "travel" | "in-place" | "smear";
  bezier?: [number, number, number, number];
  motion_start_progress?: number;
  audio_fade_start_progress?: number;
  audio_fade_duration_seconds?: number;
  whip_blur_strength?: number;
  whip_zoom_percent?: number;
  smear_zoom_percent?: number;
  smear_travel_percent?: number;
  accent_strength?: number;
  accent_hold?: number;
  page_curl?: number;
  page_turn_origin?: PageTurnOrigin;
};

export type TimelineTransitionRemovedReason =
  | "user"
  | "element_removed"
  | "invalidated";

export type TimelineTransition = {
  id: string;
  project_id: string;
  from_element_id: string;
  to_element_id: string;
  type: TimelineTransitionType;
  duration_seconds: number;
  params: TimelineTransitionParams | null;
  removed_at: string | null;
  removed_reason: TimelineTransitionRemovedReason | null;
  created_at: string;
  updated_at: string;
};

export type TimelineTransitionChip = {
  id: string;
  from_element_id: string;
  to_element_id: string;
  lane_key: string;
  timeline_start: number;
  duration: number;
  start_frame: number;
  duration_frames: number;
  end_frame: number;
  type: TimelineTransitionType;
};

export type BeatMarker = {
  id: string;
  sort_order: number;
  beat_label: string;
  duration_seconds: number | null;
};

export type TimelineAspectRatio = AspectRatioValue;

export type PreviewAspectRatio = TimelineAspectRatioValue;

export type LaneDefaultsMap = Record<string, Record<string, unknown>>;
export type LaneOrderKeys = string[];

export type LaneDef = {
  key: string;
  label: string;
  color: string;
  type: "visual" | "audio" | "music" | "captions";
  /** A visual lane holding only cameras: it shows a camera, not picture or sound toggles. */
  role?: "camera";
  height: number;
  minHeight: number;
  maxHeight: number;
};

export type Toast = {
  id: string;
  message: string;
  type: "success" | "error" | "warning";
};

export type TimelineBeatBand = BeatMarker & {
  startSec: number;
  endSec: number;
};

export type TimelineSpan = {
  start: number;
  end: number;
};
