import assert from "node:assert/strict";
import test from "node:test";

import { buildCustomCutoutEncodeArgs, normalizeCustomCutoutRequest, resolveDisplayDimensions, samTimeoutMs } from "./custom-cutout";

test("uses autorotated display dimensions for phone footage", () => {
  assert.deepEqual(resolveDisplayDimensions(1920, 1080, 90), { width: 1080, height: 1920 });
  assert.deepEqual(resolveDisplayDimensions(1920, 1080, -90), { width: 1080, height: 1920 });
  assert.deepEqual(resolveDisplayDimensions(1920, 1080, 0), { width: 1920, height: 1080 });
});

test("normalizes a bounded custom cutout request", () => {
  assert.deepEqual(normalizeCustomCutoutRequest({
    source_relative_path: "camera/take-1.mp4",
    start_seconds: 1,
    end_seconds: 4,
    prompt_seconds: 2.5,
    positive_points: [{ x: 0.4, y: 0.3 }],
    negative_points: [{ x: 0.8, y: 0.8 }],
  }), {
    sourceRelativePath: "camera/take-1.mp4",
    startSeconds: 1,
    endSeconds: 4,
    promptSeconds: 2.5,
    positivePoints: [{ x: 0.4, y: 0.3 }],
    negativePoints: [{ x: 0.8, y: 0.8 }],
  });
});

test("rejects traversal, empty prompts, and overlong intervals", () => {
  assert.throws(() => normalizeCustomCutoutRequest({
    source_relative_path: "../outside.mp4",
    start_seconds: 0,
    end_seconds: 1,
    prompt_seconds: 0.5,
    positive_points: [{ x: 0.5, y: 0.5 }],
  }), /project media file/);
  assert.throws(() => normalizeCustomCutoutRequest({
    source_relative_path: "take.mp4",
    start_seconds: 0,
    end_seconds: 1,
    prompt_seconds: 0.5,
    positive_points: [],
  }), /Click the object/);
  assert.throws(() => normalizeCustomCutoutRequest({
    source_relative_path: "take.mp4",
    start_seconds: 0,
    end_seconds: 181,
    prompt_seconds: 1,
    positive_points: [{ x: 0.5, y: 0.5 }],
  }), /no longer than 180/);
  // A whole talking-head take (here 116 s) is one request; SAM 2 tracks it in bounded chunks.
  assert.equal(normalizeCustomCutoutRequest({
    source_relative_path: "take.mp4", start_seconds: 0, end_seconds: 116.1, prompt_seconds: 30, positive_points: [{ x: 0.5, y: 0.5 }],
  }).endSeconds, 116.1);
});

test("SAM 2 time limit grows with the frame count instead of killing long windows at 30 minutes", () => {
  assert.equal(samTimeoutMs(30), 30 * 60 * 1000);
  // 116 s at 30 fps took ~1 s per frame locally; the limit leaves three times that plus ten minutes.
  assert.equal(samTimeoutMs(3483), (3483 * 3 + 600) * 1000);
});

test("encodes final cutout RGB directly from the source video, never the JPEG tracking frames", () => {
  const args = buildCustomCutoutEncodeArgs({
    sourcePath: "/project/media/render-authority/source.mp4",
    masksPattern: "/project/instruments/masks/%05d.png",
    outputPath: "/project/media/cutouts/subject.webm",
    width: 1080,
    height: 1920,
    startSeconds: 4,
    durationSeconds: 2,
    frameRateText: "30",
    frameCount: 60,
  });
  assert.ok(args.includes("/project/media/render-authority/source.mp4"));
  assert.ok(args.includes("/project/instruments/masks/%05d.png"));
  assert.equal(args.some((arg) => arg.includes("%05d.jpg")), false);
  assert.equal(args.includes("-lossless"), false);
  assert.equal(args[args.indexOf("-crf") + 1], "18");
  assert.equal(args[args.indexOf("-b:v") + 1], "0");
  assert.ok(args.some((arg) => arg.includes("scale=1080:1920:flags=lanczos")));
  assert.ok(args.includes("60"));
});

test("drops the source rotation so upright phone cutouts are not rotated again on playback", () => {
  const args = buildCustomCutoutEncodeArgs({
    sourcePath: "/project/media/sources/phone.mov",
    masksPattern: "/project/instruments/masks/%05d.png",
    outputPath: "/project/media/cutouts/subject.webm",
    width: 2160,
    height: 3840,
    startSeconds: 0,
    durationSeconds: 2,
    frameRateText: "30",
    frameCount: 60,
  });
  const graph = args[args.indexOf("-filter_complex") + 1];
  assert.match(graph, /\[0:v\][^;]*sidedata=mode=delete:type=DISPLAYMATRIX\[rgb\]/);
});
