// Platform groups used as the filter axis in the "New design" picker, ordered
// for the chip row. Each aspect ratio lists the platforms it serves in
// `platforms`; the human-facing format names it covers go in `formats` (shown
// as tags on each card). Keep these descriptive labels, not internal ids.
export const DESIGN_PLATFORMS = [
  "Amazon",
  "Meta Ads",
  "Instagram",
  "Facebook",
  "TikTok",
  "YouTube",
  "Pinterest",
  "X",
  "Other",
] as const;

export type DesignPlatform = (typeof DESIGN_PLATFORMS)[number];

export const ASPECT_RATIOS = [
  {
    value: "9:16",
    label: "Shorts / Reels",
    platforms: ["Instagram", "TikTok", "YouTube", "Facebook"],
    formats: ["Instagram Story", "Instagram Reel", "TikTok", "YouTube Shorts", "Facebook Story"],
  },
  {
    value: "4:5",
    label: "Social Feed",
    platforms: ["Instagram", "Facebook"],
    formats: ["Instagram Portrait", "Facebook Feed"],
  },
  {
    value: "1:1",
    label: "Square",
    platforms: ["Instagram", "Facebook"],
    formats: ["Instagram Feed", "Facebook Post", "Launch-day square"],
  },
  {
    value: "2:3",
    label: "Pinterest / Tall",
    platforms: ["Pinterest"],
    formats: ["Pinterest Pin"],
  },
  {
    value: "16:9",
    label: "Cinema",
    platforms: ["X"],
    formats: ["X / Twitter post", "Widescreen 16:9"],
  },
  {
    value: "3:4",
    label: "Portrait Classic",
    platforms: ["Other"],
    formats: ["Portrait photo"],
  },
  {
    value: "4:3",
    label: "Classic TV",
    platforms: ["Other"],
    formats: ["Standard photo", "Slide (4:3)"],
  },
] as const;

export type AspectRatioValue = (typeof ASPECT_RATIOS)[number]["value"];
/** The output video shapes a project can render (creator decision 2026-10-12). Order is the picker order. */
export const TIMELINE_ASPECT_RATIO_VALUES = ["9:16", "4:5", "1:1", "16:9"] as const satisfies readonly AspectRatioValue[];
export type TimelineAspectRatioValue = (typeof TIMELINE_ASPECT_RATIO_VALUES)[number];

/** `label` names the delivery use (Export); `shape` names the frame itself (Shape control, new project). */
export const TIMELINE_ASPECT_RATIOS = [
  { value: "9:16", label: "Shorts", shape: "Vertical" },
  { value: "4:5", label: "Social Feed", shape: "Portrait" },
  { value: "1:1", label: "Square", shape: "Square" },
  { value: "16:9", label: "Widescreen", shape: "Landscape" },
] as const satisfies ReadonlyArray<{ value: TimelineAspectRatioValue; label: string; shape: string }>;

export function isTimelineAspectRatioValue(value: unknown): value is TimelineAspectRatioValue {
  return typeof value === "string" && (TIMELINE_ASPECT_RATIO_VALUES as readonly string[]).includes(value);
}

export function getAspectRatioLabel(value: string): string {
  return ASPECT_RATIOS.find((r) => r.value === value)?.label ?? value;
}

export function isAspectRatioValue(value: unknown): value is AspectRatioValue {
  return typeof value === "string" && ASPECT_RATIOS.some((ratio) => ratio.value === value);
}

export function getTimelineAspectRatioLabel(value: string): string {
  return TIMELINE_ASPECT_RATIOS.find((ratio) => ratio.value === value)?.label ?? getAspectRatioLabel(value);
}
