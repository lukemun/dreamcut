import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveCanvasCaptionDragPosition,
  resolveCanvasCaptionNudgePosition,
} from "./canvas-caption-drag";

const start = {
  elementId: "caption-1",
  pointerClientX: 100,
  pointerClientY: 200,
  frameWidthPx: 400,
  frameHeightPx: 800,
  contentWidthRatio: 0.5,
  contentHeightRatio: 0.75,
  initialAbsX: 0.25,
  initialAbsY: 0.4,
};

test("maps pointer movement into content-relative caption coordinates", () => {
  assert.deepEqual(resolveCanvasCaptionDragPosition(start, 140, 260), {
    absX: 0.45,
    absY: 0.5,
  });
});

test("allows intentional edge bleed while keeping dragged captions recoverable", () => {
  assert.deepEqual(resolveCanvasCaptionDragPosition(start, -1000, 2000), {
    absX: -0.5,
    absY: 1.5,
  });
});

test("nudges captions by composition pixels in all four directions", () => {
  const base = {
    stepPx: 1,
    frameWidthPx: 1080,
    frameHeightPx: 1920,
    contentWidthRatio: 1,
    contentHeightRatio: 1,
    currentAbsX: 0.5,
    currentAbsY: 0.5,
  };

  assert.deepEqual(resolveCanvasCaptionNudgePosition({ ...base, key: "ArrowLeft" }), {
    absX: 0.5 - 1 / 1080,
    absY: 0.5,
  });
  assert.deepEqual(resolveCanvasCaptionNudgePosition({ ...base, key: "ArrowRight" }), {
    absX: 0.5 + 1 / 1080,
    absY: 0.5,
  });
  assert.deepEqual(resolveCanvasCaptionNudgePosition({ ...base, key: "ArrowUp" }), {
    absX: 0.5,
    absY: 0.5 - 1 / 1920,
  });
  assert.deepEqual(resolveCanvasCaptionNudgePosition({ ...base, key: "ArrowDown" }), {
    absX: 0.5,
    absY: 0.5 + 1 / 1920,
  });
});

test("supports coarse nudges, content-relative coordinates, and bounded edge bleed", () => {
  assert.deepEqual(resolveCanvasCaptionNudgePosition({
    key: "ArrowRight",
    stepPx: 10,
    frameWidthPx: 1000,
    frameHeightPx: 1000,
    contentWidthRatio: 0.5,
    contentHeightRatio: 0.75,
    currentAbsX: 0.99,
    currentAbsY: 0.25,
  }), { absX: 1.01, absY: 0.25 });
  assert.equal(resolveCanvasCaptionNudgePosition({
    key: "Enter",
    stepPx: 1,
    frameWidthPx: 1000,
    frameHeightPx: 1000,
    contentWidthRatio: 1,
    contentHeightRatio: 1,
    currentAbsX: 0.5,
    currentAbsY: 0.5,
  }), null);
});
