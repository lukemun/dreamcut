import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { runCompositionActivity } from "./activity-media";
import { alignmentReport, bestLag, matchOnsets, pearson, turnResponse, uncausedFraction } from "./sound-alignment";
import {
  holdsAround,
  binCount,
  combineCurves,
  compositionIdOf,
  cutActivity,
  detectOnsets,
  keyframeActivity,
  penActivity,
  presetActivity,
  resampleOnto,
  sourceTimeAt,
  synthEmbed,
  type ActivityElement,
} from "./visual-activity";

const window = { start: 0, end: 2, rate: 100 };

const drawnShape = (start: number, props: Record<string, unknown> = {}): ActivityElement => ({
  id: `shape-${start}`,
  type: "shape",
  timeline_start: start,
  duration: 1.5,
  props: { shape_kind: "path", keyframes: { shape_draw: [{ t: 0, v: 0 }, { t: 0.5, v: 1 }] }, ...props },
});

test("a linear draw over 0.5 s is steady activity of 2 per second inside its span only", () => {
  const result = keyframeActivity(drawnShape(0.4), window)!;
  assert.deepEqual(result.fields, ["shape_draw"]);
  assert.ok(Math.abs(result.draw[60]! - 2) < 1e-6);
  assert.equal(result.draw[30], 0);
  assert.equal(result.draw[120], 0);
  assert.equal(result.motion.every((value) => value === 0), true);
});

test("constant keyframe tracks and speed keyframes are not activity", () => {
  const still: ActivityElement = { id: "a", type: "video_clip", timeline_start: 0, duration: 2, props: { keyframes: { media_scale: [{ t: 0, v: 1.6 }, { t: 2, v: 1.6 }], playback_rate: [{ t: 0, v: 1 }, { t: 1, v: 2 }] } } };
  assert.equal(keyframeActivity(still, window), null);
});

test("an eased camera move peaks mid-move", () => {
  const camera: ActivityElement = { id: "cam", type: "shape", timeline_start: 0, duration: 2, props: { shape_kind: "camera", keyframes: { media_scale: [{ t: 0.5, v: 1, ease: "easeInOut" }, { t: 1.5, v: 2 }] } } };
  const motion = keyframeActivity(camera, window)!.motion;
  assert.ok(motion[100]! > motion[60]! && motion[100]! > motion[140]!);
  assert.ok(Math.abs(motion[100]! - 2) < 0.05);
});

test("entrance presets add a unit-area bump and suppress the cut", () => {
  const element: ActivityElement = { id: "p", type: "still", timeline_start: 0.5, duration: 1, props: { animationIn: "fade", animationInDuration: 0.4 } };
  const bump = presetActivity(element, window)!;
  const area = bump.reduce((sum, value) => sum + value, 0) / window.rate;
  assert.ok(Math.abs(area - 1) < 0.02);
  const cut = cutActivity(element, window)!;
  assert.equal(cut.slice(0, 100).every((value) => value === 0), true, "no cut at the faded entrance");
  assert.ok(cut[150]! > 0, "hard exit at 1.5 s");
});

test("a shape that starts undrawn does not count as a cut", () => {
  const cut = cutActivity({ ...drawnShape(0.4), props: { ...drawnShape(0.4).props, animationOut: "fade" } }, window);
  assert.equal(cut, null);
});

test("onsets land where a curve starts rising", () => {
  const curve = new Float64Array(200);
  for (let index = 50; index < 80; index += 1) curve[index] = 1;
  for (let index = 140; index < 160; index += 1) curve[index] = 0.8;
  const onsets = detectOnsets(curve, 100);
  assert.deepEqual(onsets, [0.5, 1.4]);
  assert.deepEqual(detectOnsets(new Float64Array(100), 100), []);
});

test("source curves map onto the timeline through trims and speed", () => {
  const clip: ActivityElement = { id: "v", type: "video_clip", timeline_start: 1, duration: 1, trim_start: 2, playback_rate: 2, props: { source_duration_seconds: 10 } };
  assert.equal(sourceTimeAt(clip, 1.5), 3);
  const source = Float64Array.from({ length: 1000 }, (_, index) => (index >= 300 && index < 310 ? 1 : 0));
  const mapped = resampleOnto(source, 0, 100, window, (time) => (time >= 1 && time <= 2 ? sourceTimeAt(clip, time) : null));
  const active = Array.from(mapped).flatMap((value, index) => (value > 0.5 ? [index] : []));
  assert.ok(active.length > 0 && active[0]! >= 149 && active.at(-1)! <= 156, `source 3.0–3.1 s should land near 1.5 s, got ${active}`);
  assert.equal(compositionIdOf({ ...clip, source_url: "/api/projects/p/media/hyperframes/city-sketch/city-sketch.abc.webm" }), "city-sketch");
});

test("synth_embed evaluates to the same curve inside a synth program", () => {
  const curve = Float64Array.from({ length: binCount(window) }, (_, index) => index / 199);
  const code = `${synthEmbed(window, { total: curve })}\nactivityAt("total", 1.005);`;
  const value = new Function(`${code.replace(/\nactivityAt\("total", 1.005\);$/, "")}; return activityAt("total", 1.005);`)() as number;
  assert.ok(Math.abs(value - 100 / 199) < 0.01);
  assert.equal(combineCurves([curve, curve], curve.length)[199], 1);
});

test("alignment rewards a sound that follows the curve and flags a sound placed elsewhere", () => {
  const rate = 100;
  const curve = Float64Array.from({ length: 300 }, (_, index) => (index >= 50 && index < 150 ? Math.sin(Math.PI * (index - 50) / 100) : 0));
  const follows = curve.map((value) => value * 0.3);
  const report = alignmentReport(curve, follows, rate);
  assert.equal(report.pass, true);
  assert.ok(report.correlation > 0.95);
  const late = Float64Array.from({ length: 300 }, (_, index) => (index >= 200 && index < 260 ? 0.5 : 0));
  const bad = alignmentReport(curve, late, rate);
  assert.equal(bad.pass, false);
  assert.ok(bad.uncaused_energy_fraction > 0.5);
  assert.ok(bad.failures.some((failure) => failure.includes("nothing changes")));
});

test("lag, onset matching and uncaused share are measured in the stated units", () => {
  const curve = Float64Array.from({ length: 200 }, (_, index) => (index >= 50 && index < 100 ? 1 : 0));
  const shifted = Float64Array.from({ length: 200 }, (_, index) => (index >= 55 && index < 105 ? 1 : 0));
  assert.equal(pearson(curve, curve), 1);
  assert.equal(bestLag(curve, shifted, 100).lag_ms, 50);
  const matched = matchOnsets([0.5, 1.2], [0.52, 1.9]);
  assert.deepEqual(matched.matches.map((match) => match.offset_ms), [20]);
  assert.deepEqual(matched.missed, [1.2]);
  assert.deepEqual(matched.extra, [1.9]);
  assert.equal(uncausedFraction(curve, curve, 100), 0);
});

test("composition activity reads scene data in an isolated context", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-activity-"));
  fs.writeFileSync(path.join(dir, "scene.js"), "window.LINES = [[0.2, 0.4, 3], [1.0, 1.1, 1]];");
  const result = runCompositionActivity(dir, ["scene.js"], `
    function activity({ window, rate, helpers }) {
      const ink = helpers.curve();
      for (const [t0, t1, length] of window.LINES) helpers.spread(ink, t0, t1, length);
      return { curves: { ink }, onsets: { ink: window.LINES.map((line) => line[0]) } };
    }`, 2, 100);
  const area = result.curves.ink!.reduce((sum, value) => sum + value, 0) / 100;
  assert.ok(Math.abs(area - 4) < 1e-9);
  assert.deepEqual(result.onsets.ink, [0.2, 1]);
  assert.throws(() => runCompositionActivity(dir, ["../escape.js"], "function activity(){}", 1, 100), /inside the composition/);
  assert.throws(() => runCompositionActivity(dir, ["scene.js"], "function activity({ window }) { return { curves: {} }; }", 1, 100), /no curves/);
  assert.throws(() => runCompositionActivity(dir, ["scene.js"], "function activity() { return process.exit(1); }", 1, 100), /process is not defined/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("the pen tip: speed along the stroke, a turn spike at each corner, pen-down on each new contour", () => {
  // A 0.5 x 0.5 box on a 1080-high canvas: an L (one right-angle corner), then a separate dash.
  const element: ActivityElement = {
    id: "pen", type: "shape", timeline_start: 0, duration: 2,
    props: {
      shape_kind: "path", shape_width: 0.5, shape_height: 0.5,
      shape_contours: [
        { closed: false, points: [{ x: -0.5, y: -0.5 }, { x: -0.5, y: 0.5 }, { x: 0.5, y: 0.5 }] },
        { closed: false, points: [{ x: 0, y: 0 }, { x: 0.5, y: 0 }] },
      ],
      keyframes: { shape_draw: [{ t: 0, v: 0 }, { t: 1.25, v: 1 }] },
    },
  };
  const pen = penActivity(element, window)!;
  // 540 + 540 + 270 px drawn in 1.25 s.
  assert.ok(Math.abs(pen.speed[30]! - 1080) < 1, `speed ${pen.speed[30]}`);
  assert.equal(pen.speed[150], 0, "nothing drawn after 1.25 s");
  const corner = pen.turn.findIndex((value) => value > 0);
  assert.ok(corner >= 49 && corner <= 50, `corner at 0.5 s, got bin ${corner}`);
  assert.ok(Math.abs(pen.turn[corner]! - (Math.PI / 2) * 100) < 1);
  assert.equal(pen.turn.filter((value) => value > 0).length, 1, "straight lines and the lift between contours are not turns");
  assert.deepEqual(pen.pen_down.map((time) => Number(time.toFixed(3))), [0.005, 1.005]);
});

test("turn response rewards a sound that changes at turns and ignores near-silence", () => {
  const rate = 100;
  const full = new Float64Array(200).fill(1);
  const bright = new Float64Array(200).fill(0.3);
  for (let index = 98; index <= 102; index += 1) bright[index] = 0.9;
  assert.equal(turnResponse([1], full, bright, rate).pass, true);
  assert.equal(turnResponse([1], full, new Float64Array(200).fill(0.3), rate).pass, false);
  const quietAtTurn = Float64Array.from(full, (value, index) => (Math.abs(index - 100) <= 3 ? 0.1 : value));
  const flickery = Float64Array.from(bright, (value, index) => (Math.abs(index - 100) <= 3 ? 0.09 : value));
  assert.equal(turnResponse([1], quietAtTurn, flickery, rate).turns[0]!.response, 0);
});

test("holds: where motion stops around each mark and when it starts again, judged against the motion nearby", () => {
  const window = { start: 10, end: 30, rate: 100 };
  const values = new Float64Array(2000);
  // Walk at full strength, then far away (a fifth as much change), with stills between.
  const fill = (from: number, to: number, value: number) => { for (let k = Math.round((from - 10) * 100); k < Math.round((to - 10) * 100); k++) values[k] = value; };
  fill(10, 12, 1); fill(12, 13, 0.02); fill(13, 16, 1);
  fill(16, 17.5, 0.01); fill(16.8, 16.85, 0.9);           // a 50 ms flicker inside the hold
  fill(17.5, 20, 0.2); fill(20, 20.6, 0.004);              // small far subject, then a short stop
  fill(20.6, 22, 0.2); fill(22, 29, 0.003); fill(29, 30, 0.2); // a 7 s hold, longer than the context
  const [near, flickered, far, long, between] = holdsAround(values, window, [12.5, 16.5, 20.3, 25, 14.2]);
  assert.deepEqual([near!.settle_seconds, near!.takeoff_seconds, near!.at_rest], [12, 13, true]);
  assert.deepEqual([flickered!.settle_seconds, flickered!.takeoff_seconds], [16, 17.5]);
  assert.deepEqual([far!.settle_seconds, far!.takeoff_seconds], [20, 20.6]);
  assert.deepEqual([long!.settle_seconds, long!.takeoff_seconds], [22, 29]);
  assert.ok(near!.contrast > 0.9 && far!.contrast > 0.9);
  // A mark dropped mid-walk: the nearest stop within reach, flagged as not at rest.
  assert.deepEqual([between!.at_rest, between!.settle_seconds, between!.takeoff_seconds], [false, 12, 13]);
  assert.deepEqual(holdsAround(values, window, [14.5], { reachSeconds: 1 })[0]!.settle_seconds, null);
});
