import assert from "node:assert/strict";
import test from "node:test";
import { SKIN_LINE_DEGREES, VECTORSCOPE_TARGETS, colorScopeStats, vectorscopeBins } from "./scopes";

function frame(width: number, height: number, pixel: (x: number, y: number) => [number, number, number]) {
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) rgba.set([...pixel(x, y), 255], (y * width + x) * 4);
  return rgba;
}

test("vectorscope targets sit at broadcast angles", () => {
  const degrees = Object.fromEntries(VECTORSCOPE_TARGETS.map((target) => [target.name, Math.round(target.degrees)]));
  assert.ok(Math.abs(degrees.red! - 103) <= 2, `red ${degrees.red}`);
  assert.ok(Math.abs(degrees.yellow! - 174) <= 8, `yellow ${degrees.yellow}`);
  assert.ok(Math.abs(degrees.blue! - 355) <= 2, `blue ${degrees.blue}`);
  assert.ok(SKIN_LINE_DEGREES > degrees.red! && SKIN_LINE_DEGREES < degrees.yellow!);
});

test("a grey ramp has no cast, full range brightness and no chroma sectors", () => {
  const stats = colorScopeStats(frame(256, 4, (x) => [x, x, x]), 256, 4);
  assert.equal(stats.cast.measured && stats.cast.toward, "none");
  assert.ok(stats.brightness.p1 <= 2 && stats.brightness.p99 >= 98);
  assert.equal(stats.hue_sectors.length, 0);
  assert.equal(stats.skin, null);
});

test("a warm cast on neutrals reads as a cast toward red/yellow", () => {
  const stats = colorScopeStats(frame(64, 64, () => [140, 128, 112]), 64, 64);
  assert.ok(stats.cast.measured);
  assert.ok(stats.cast.measured && ["red", "yellow"].includes(stats.cast.toward), JSON.stringify(stats.cast));
});

test("skin-like pixels report their offset from the skin line, and clipping is counted", () => {
  const stats = colorScopeStats(frame(32, 32, (x) => (x < 16 ? [205, 150, 120] : [255, 255, 255])), 32, 32);
  assert.ok(stats.skin && Math.abs(stats.skin.mean_offset_degrees) < 25);
  assert.equal(stats.clipped.highlights_percent, 50);
});

test("vectorscope bins put a saturated red toward its target", () => {
  const bins = vectorscopeBins(frame(4, 4, () => [255, 0, 0]), 4, 4, 64);
  const index = bins.findIndex((value) => value > 0);
  const x = index % 64, y = Math.floor(index / 64);
  assert.ok(x < 32 && y < 10, `${x},${y}`);
});
