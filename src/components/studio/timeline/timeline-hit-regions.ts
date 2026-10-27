export type ClipHitRegion = {
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ResizeHitRegion = {
  elementId: string;
  edge: "start" | "end";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type MuteHitRegion = {
  laneKey: string;
  x: number;
  y: number;
  size: number;
};

/** Track visibility (eye) toggle in the lane header. */
export type HideHitRegion = {
  laneKey: string;
  x: number;
  y: number;
  size: number;
};

export type SoloHitRegion = {
  laneKey: string;
  x: number;
  y: number;
  size: number;
};

export type LaneResizeHitRegion = {
  laneKey: string;
  x: number;
  width: number;
  y: number;
  height: number;
};

export type LaneMenuBtnHitRegion = {
  laneKey: string;
  x: number;
  y: number;
  size: number;
};

export type MenuBtnHitRegion = {
  elementId: string;
  x: number;
  y: number;
  size: number;
};

export type BeatMenuBtnHitRegion = {
  beatId: string;
  x: number;
  y: number;
  size: number;
};

export type BeatResizeHitRegion = {
  beatId: string;
  edge: "start" | "end";
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GainHitRegion = {
  elementId: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GainKeyframeHitRegion = {
  elementId: string;
  keyframeIndex: number;
  x: number;
  y: number;
  radius: number;
};

export type VisualKeyframeHitRegion = {
  elementId: string;
  timeSec: number;
  x: number;
  y: number;
  radius: number;
};

export type EnvelopePointHitRegion = {
  elementId: string;
  pointIndex: number;
  x: number;
  y: number;
  radius: number;
};

export type EnvelopeSegmentHitRegion = {
  elementId: string;
  leftIndex: number;
  rightIndex: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

export type TransitionHitRegion =
  | {
    kind: "existing";
    transitionId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }
  | {
    kind: "create";
    fromElementId: string;
    toElementId: string;
    x: number;
    y: number;
    width: number;
    height: number;
  };

export type ContextMenuState = {
  x: number;
  y: number;
} & (
  | { target: "clip"; elementId: string }
  | { target: "beat"; beatId: string }
  | { target: "lane"; laneKey: string }
  | { target: "lane_body"; laneKey: string; atSec: number }
  | { target: "empty" }
);
