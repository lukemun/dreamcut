import type { CompositionElement } from "@/lib/render/composition-adapters";

export const COLIN_EFFECT_PROOF_ID = "ColinEffectProof";
export const COLIN_EFFECT_PROOF_FPS = 30;
export const COLIN_EFFECT_PROOF_DURATION_FRAMES = 66;
export const COLIN_EFFECT_PROOF_WIDTH = 360;
export const COLIN_EFFECT_PROOF_HEIGHT = 640;
export const COLIN_EFFECT_PROOF_TIMES_SECONDS = [0, 1, 2] as const;

export const COLIN_EFFECT_PROOF_LANE_ORDER = [
  "visual_top",
  "visual_middle",
  "visual_bottom",
  "captions_0",
] as const;

export type ColinEffectPanelUrls = {
  top: string;
  middle: string;
  bottom: string;
};

type PanelName = keyof ColinEffectPanelUrls;

const MASKS: Record<PanelName, readonly [readonly number[], readonly number[], readonly number[]]> = {
  top: [
    [0, 0, 0.667, 0],
    [0.03, 0, 0.72, 0],
    [0.08, 0, 0.8, 0],
  ],
  middle: [
    [1 / 3, 0, 1 / 3, 0],
    [0.42, 0, 0.42, 0],
    [0.48, 0, 0.48, 0],
  ],
  bottom: [
    [0.667, 0, 0, 0],
    [0.72, 0, 0.03, 0],
    [0.8, 0, 0.08, 0],
  ],
};

const OPACITIES: Record<PanelName, readonly [number, number, number]> = {
  top: [1, 0.85, 0.7],
  middle: [1, 0.65, 0.3],
  bottom: [1, 0.85, 0.7],
};

const OFFSETS_X: Record<PanelName, readonly [number, number, number]> = {
  top: [0, -0.08, 0.12],
  middle: [0, 0.2, -0.1],
  bottom: [0, 0.1, -0.08],
};

function points(values: readonly (number | readonly number[])[]) {
  return COLIN_EFFECT_PROOF_TIMES_SECONDS.map((time, index) => ({
    t: time,
    v: values[index]!,
    ease: "linear" as const,
  }));
}

function panel(name: PanelName, sourceUrl: string, laneIndex: number): CompositionElement {
  return {
    id: `proof-${name}`,
    type: "still",
    source_url: sourceUrl,
    props: {
      media_scale: 1,
      media_offset_x: 0,
      media_offset_y: 0,
      media_opacity: 1,
      mask_inset: MASKS[name][0],
      mask_feather: 0,
      keyframes: {
        media_scale: points([1, 1.1, 1.2]),
        media_offset_x: points(OFFSETS_X[name]),
        media_offset_y: points([0, 0.05, -0.05]),
        mask_inset: points(MASKS[name]),
        media_opacity: points(OPACITIES[name]),
        mask_feather: points([0, 0.008, 0.015]),
      },
    },
    timeline_start: 0,
    duration: COLIN_EFFECT_PROOF_DURATION_FRAMES / COLIN_EFFECT_PROOF_FPS,
    lane_key: `visual_${name}`,
    lane_index: laneIndex,
    volume: 0,
    playback_rate: 1,
    trim_start: 0,
    trim_end: null,
    fade_in: 0,
    fade_out: 0,
  };
}

export function buildColinEffectProofElements(urls: ColinEffectPanelUrls): CompositionElement[] {
  const duration = COLIN_EFFECT_PROOF_DURATION_FRAMES / COLIN_EFFECT_PROOF_FPS;
  return [
    {
      id: "proof-title",
      type: "caption_text",
      source_url: null,
      props: {
        text: "PORTLAND",
        positionPreset: "center",
        offsetX: 0,
        offsetY: 0,
        absX: 0.15,
        absY: 0.36,
        maxWidth: 0.7,
        textAlign: "center",
        fontPreset: "classic_serif",
        fontSizePx: 42,
        textColor: null,
        styleVariant: "boxed",
        animationIn: "none",
        animationOut: "none",
        animationInDuration: 0,
        animationOutDuration: 0,
      },
      timeline_start: 0,
      duration,
      lane_key: "captions_0",
      lane_index: 0,
      volume: 0,
      playback_rate: 1,
      trim_start: 0,
      trim_end: null,
      fade_in: 0,
      fade_out: 0,
    },
    panel("top", urls.top, 0),
    panel("middle", urls.middle, 1),
    panel("bottom", urls.bottom, 2),
  ];
}

export function colinEffectProofMasks() {
  return MASKS;
}
