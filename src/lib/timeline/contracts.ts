import { z } from "zod";
import { transitionNumberSchema } from "./transition-controls";

export const TIMELINE_ELEMENT_TYPES = [
  "video_clip",
  "still",
  "vo_segment",
  "vo_full",
  "music",
  "sound_effect",
  "caption_text",
] as const;

export const TIMELINE_TRANSITION_TYPES = ["fade", "slide", "wipe", "whip", "cube", "page_turn", "film_burn", "camera_flash", "blackout"] as const;

export type TimelineElementType = (typeof TIMELINE_ELEMENT_TYPES)[number];
export type TimelineTransitionType = (typeof TIMELINE_TRANSITION_TYPES)[number];

const laneKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[a-z0-9_:-]+$/, "lane_key must contain only lowercase letters, numbers, underscores, colons, or hyphens");

export const timelineElementPatchSchema = z
  .object({
    type: z.enum(TIMELINE_ELEMENT_TYPES).optional(),
    source_url: z.union([
      z.string().url(),
      z.string().trim().regex(/^\/api\/(?:projects\/.+\/media|music-catalog\/media|sfx-catalog\/media|image-catalog\/media|visual-catalog\/media)\/.+/),
    ]).nullable().optional(),
    timeline_start: z.number().finite().min(0).optional(),
    duration: z.number().finite().gt(0).optional(),
    trim_start: z.number().finite().min(0).optional(),
    trim_end: z.number().finite().min(0).nullable().optional(),
    lane_key: laneKeySchema.optional(),
    lane_index: z.number().int().min(0).optional(),
    volume: z.number().finite().min(0).max(4).optional(),
    fade_in: z.number().finite().min(0).optional(),
    fade_out: z.number().finite().min(0).optional(),
    playback_rate: z.number().finite().gt(0).max(4).optional(),
    position_locked: z.boolean().optional(),
    voice_clip_id: z.string().uuid().nullable().optional(),
    props: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export const transitionParamsSchema = z
  .object({
    direction: z.enum(["from-left", "from-right", "from-top", "from-bottom"]).optional(),
    motion: z.enum(["travel", "in-place", "smear"]).optional(),
    bezier: z.tuple([
      z.number().finite().min(0).max(1),
      z.number().finite().min(0).max(1),
      z.number().finite().min(0).max(1),
      z.number().finite().min(0).max(1),
    ]).optional(),
    motion_start_progress: transitionNumberSchema("params.motion_start_progress").optional(),
    audio_fade_start_progress: transitionNumberSchema("params.audio_fade_start_progress").optional(),
    audio_fade_duration_seconds: transitionNumberSchema("params.audio_fade_duration_seconds").optional(),
    whip_zoom_percent: transitionNumberSchema("params.whip_zoom_percent").optional(),
    whip_blur_strength: transitionNumberSchema("params.whip_blur_strength").optional(),
    smear_zoom_percent: transitionNumberSchema("params.smear_zoom_percent").optional(),
    smear_travel_percent: transitionNumberSchema("params.smear_travel_percent").optional(),
    accent_strength: transitionNumberSchema("params.accent_strength").optional(),
    accent_hold: transitionNumberSchema("params.accent_hold").optional(),
    page_curl: transitionNumberSchema("params.page_curl").optional(),
    page_turn_origin: z.enum(["right-edge", "bottom-right"]).optional(),
  })
  .strict();

export const timelineTransitionCreateSchema = z
  .object({
    from_element_id: z.string().uuid(),
    to_element_id: z.string().uuid(),
    type: z.enum(TIMELINE_TRANSITION_TYPES),
    duration_seconds: transitionNumberSchema("duration_seconds").optional(),
    params: transitionParamsSchema.optional(),
  })
  .strict();

export const timelineTransitionPatchSchema = z
  .object({
    type: z.enum(TIMELINE_TRANSITION_TYPES).optional(),
    duration_seconds: transitionNumberSchema("duration_seconds").optional(),
    params: transitionParamsSchema.optional(),
  })
  .strict();

export type TimelineElementPatch = z.infer<typeof timelineElementPatchSchema>;
export type TimelineTransitionCreate = z.infer<typeof timelineTransitionCreateSchema>;
export type TimelineTransitionPatch = z.infer<typeof timelineTransitionPatchSchema>;

export { zodIssuesToMessage } from "@/lib/api-helpers";
