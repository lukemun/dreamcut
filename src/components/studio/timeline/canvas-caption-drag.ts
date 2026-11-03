import { clampCaptionAbsPosition } from "@/lib/timeline/captions";

export type CanvasCaptionDragStart = {
  elementId: string;
  pointerClientX: number;
  pointerClientY: number;
  frameWidthPx: number;
  frameHeightPx: number;
  contentWidthRatio: number;
  contentHeightRatio: number;
  initialAbsX: number;
  initialAbsY: number;
};

export type CanvasCaptionPosition = {
  absX: number;
  absY: number;
};

export type CanvasCaptionNudgeKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

export type CanvasCaptionNudgeInput = {
  key: string;
  stepPx: number;
  frameWidthPx: number;
  frameHeightPx: number;
  contentWidthRatio: number;
  contentHeightRatio: number;
  currentAbsX: number;
  currentAbsY: number;
};

export function resolveCanvasCaptionDragPosition(
  start: CanvasCaptionDragStart,
  pointerClientX: number,
  pointerClientY: number,
): CanvasCaptionPosition {
  const contentWidthPx = Math.max(1, start.frameWidthPx * start.contentWidthRatio);
  const contentHeightPx = Math.max(1, start.frameHeightPx * start.contentHeightRatio);

  return {
    absX: clampCaptionAbsPosition(start.initialAbsX + (pointerClientX - start.pointerClientX) / contentWidthPx),
    absY: clampCaptionAbsPosition(start.initialAbsY + (pointerClientY - start.pointerClientY) / contentHeightPx),
  };
}

export function resolveCanvasCaptionNudgePosition(
  input: CanvasCaptionNudgeInput,
): CanvasCaptionPosition | null {
  const key = input.key as CanvasCaptionNudgeKey;
  if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(key)) return null;

  const contentWidthPx = Math.max(1, input.frameWidthPx * input.contentWidthRatio);
  const contentHeightPx = Math.max(1, input.frameHeightPx * input.contentHeightRatio);
  const stepPx = Math.max(0, input.stepPx);
  const deltaX = key === "ArrowLeft" ? -stepPx : key === "ArrowRight" ? stepPx : 0;
  const deltaY = key === "ArrowUp" ? -stepPx : key === "ArrowDown" ? stepPx : 0;

  return {
    absX: clampCaptionAbsPosition(input.currentAbsX + deltaX / contentWidthPx),
    absY: clampCaptionAbsPosition(input.currentAbsY + deltaY / contentHeightPx),
  };
}
