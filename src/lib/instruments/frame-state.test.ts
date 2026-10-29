import assert from "node:assert/strict";
import { test } from "node:test";

import { RULER_BANDS, bandOf, computeReadDelta, frameFor, layersAt, legalRectFor } from "@/lib/instruments/frame-state";
import { safeAreaFor } from "@/lib/qc/standards";

const CANVAS = { width: 1080, height: 1920 };

test("bandOf maps a y to the printed ruler label the vision pass answers in", () => {
  assert.equal(bandOf(0, CANVAS), 0);
  assert.equal(bandOf(CANVAS.height * 0.05 - 1, CANVAS), 0);
  assert.equal(bandOf(CANVAS.height * 0.05, CANVAS), 1);
  assert.equal(bandOf(CANVAS.height * 0.76, CANVAS), 15);
  // The last pixel must not fall off the end of the ruler.
  assert.equal(bandOf(CANVAS.height, CANVAS), RULER_BANDS - 1);
  assert.equal(bandOf(-50, CANVAS), 0);
});

test("legalRectFor turns safe-area margins into the rectangle drawn on the frame", () => {
  const safe = safeAreaFor("tiktok", CANVAS);
  const legal = legalRectFor(safe, CANVAS);
  assert.equal(legal.left, safe.left);
  assert.equal(legal.top, safe.top);
  assert.equal(legal.right, CANVAS.width - safe.right);
  assert.equal(legal.bottom, CANVAS.height - safe.bottom);
  assert.ok(legal.bottom < CANVAS.height, "TikTok reserves the bottom of the frame");
});

test("layersAt returns only what is on screen, back-to-front in lane order", () => {
  const elements = [
    { id: "caption", type: "caption_text", lane_key: "captions_0", timeline_start: 1, duration: 2, props: {} },
    { id: "shot-a", type: "video_clip", lane_key: "visual_0", timeline_start: 0, duration: 3, props: {}, source_url: "/a.mp4" },
    { id: "shot-b", type: "video_clip", lane_key: "visual_0", timeline_start: 3, duration: 3, props: {}, source_url: "/b.mp4" },
  ];
  const layers = layersAt(elements as never, ["captions_0", "visual_0"], 2);
  assert.deepEqual(layers.map((layer) => layer.id), ["caption", "shot-a"]);
  assert.deepEqual(layers.map((layer) => layer.z), [0, 1]);
  assert.equal(layers[0]!.localSeconds, 1);

  // A time inside shot-b has no caption on screen.
  assert.deepEqual(layersAt(elements as never, ["captions_0", "visual_0"], 4).map((layer) => layer.id), ["shot-b"]);
});

test("layersAt excludes an element at its exact end — the frame after it is gone", () => {
  const elements = [
    { id: "shot", type: "video_clip", lane_key: "visual_0", timeline_start: 0, duration: 2, props: {}, source_url: "/a.mp4" },
  ];
  assert.equal(layersAt(elements as never, ["visual_0"], 1.999).length, 1);
  assert.equal(layersAt(elements as never, ["visual_0"], 2).length, 0);
});

test("frameFor quantizes a sampled time to the composition grid", () => {
  assert.equal(frameFor(0), 0);
  assert.equal(frameFor(1), 30);
  assert.equal(frameFor(12.6), 378);
});

test("computeReadDelta claims unchanged only when both prior hashes prove it", () => {
  // No previous report: nothing is provable, the frame is new.
  assert.equal(computeReadDelta(undefined, "aa", "bb").status, "new");
  // A pre-delta report exists but carries no hashes: sameness is unprovable, so still "new" —
  // the failure direction must be "read more", never "skip wrongly".
  assert.equal(computeReadDelta({}, "aa", "bb").status, "new");
  assert.equal(computeReadDelta({ stillSha256: "aa", overlaySha256: null }, "aa", "bb").status, "new");

  assert.equal(computeReadDelta({ stillSha256: "aa", overlaySha256: "bb" }, "aa", "bb").status, "unchanged");
  // A moved caption box changes only the overlay; that still demands a re-read.
  assert.equal(computeReadDelta({ stillSha256: "aa", overlaySha256: "old" }, "aa", "bb").status, "changed");
  assert.equal(computeReadDelta({ stillSha256: "old", overlaySha256: "bb" }, "aa", "bb").status, "changed");

  // The prior hashes ride along as the audit basis for the verdict.
  const delta = computeReadDelta({ stillSha256: "old-still", overlaySha256: "old-overlay" }, "aa", "bb");
  assert.equal(delta.prevStillSha256, "old-still");
  assert.equal(delta.prevOverlaySha256, "old-overlay");
  assert.equal(delta.stillSha256, "aa");
});

test("the still renderer counts frames at the project's rate, so a 25 fps frame is drawn from its own moment", async () => {
  const { frameFor, stillComposition } = await import("./frame-state");
  const composition = stillComposition({ width: 1920, height: 1080 }, 1.76, 25);
  // 1.72 s is frame 43 at 25 fps; a renderer counting 30 fps would draw 1.43 s instead.
  assert.equal(frameFor(1.72, 25) / composition.fps, 1.72);
  assert.deepEqual(composition, { width: 1920, height: 1080, fps: 25, durationInFrames: 45 });
});
