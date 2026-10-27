import assert from "node:assert/strict";
import test from "node:test";
import {
  ATLAS_ROWS,
  GRADE_AXIS_STOP,
  IDENTITY_GRADE_V2,
  SKIN_HUE,
  SLICE_CENTRES,
  bakeGradeAtlas,
  evaluateGrade,
  hueOf,
  prepareGrade,
  sliceWeights,
  type GradeV2,
} from "./grade-v2";
import { SDR_REC709, inputToWorking, workingToDisplay } from "./io-transforms";
import type { Vec3 } from "./matrices";

const grade = (patch: Partial<GradeV2>): GradeV2 => ({ ...IDENTITY_GRADE_V2, ...patch });
const display = (rgb: Vec3, g: GradeV2): Vec3 => workingToDisplay(evaluateGrade(inputToWorking(rgb, SDR_REC709), prepareGrade(g)), { sourcePeak: 1 });
const luma = (rgb: Vec3) => 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
const near = (a: number, b: number, tol: number, label = "") => assert.ok(Math.abs(a - b) <= tol, `${label} ${a} vs ${b}`);
const PATCHES: Vec3[] = [[0, 0, 0], [0.05, 0.05, 0.05], [0.5, 0.5, 0.5], [1, 1, 1], [0.8, 0.2, 0.1], [0.1, 0.6, 0.3], [0.2, 0.3, 0.9], [0.87, 0.67, 0.55]];

test("identity grade returns SDR input unchanged", () => {
  for (const rgb of PATCHES) {
    const out = display(rgb, IDENTITY_GRADE_V2);
    for (let i = 0; i < 3; i += 1) near(out[i]!, rgb[i]!, 2e-5, `${rgb}`);
  }
});

test("slices are centred on measured primaries and always sum to one", () => {
  const order = ["red", "yellow", "green", "cyan", "blue", "magenta"] as const;
  near(SLICE_CENTRES.red, 0, 1e-9, "red is hue 0");
  for (let i = 1; i < order.length; i += 1) assert.ok(SLICE_CENTRES[order[i]!] > SLICE_CENTRES[order[i - 1]!], `${order[i]} after ${order[i - 1]}`);
  for (let h = 0; h < 1; h += 0.013) {
    const w = sliceWeights(h);
    near(Object.values(w).reduce((a, b) => a + b, 0), 1, 1e-9, `hue ${h}`);
  }
  assert.ok(SKIN_HUE > SLICE_CENTRES.red && SKIN_HUE < SLICE_CENTRES.yellow, "skin sits between red and yellow");
  near(hueOf([0.6, 0.3, 0.3]), 0, 0.01, "desaturated red keeps red's hue");
});

test("wheels move the part of the range they name", () => {
  const black: Vec3 = [0.02, 0.02, 0.02], mid: Vec3 = [0.45, 0.45, 0.45], white: Vec3 = [1, 1, 1];
  const lifted = grade({ lift: { rgb: [0, 0, 0], master: 0.1 } });
  assert.ok(luma(display(black, lifted)) > luma(black) + 0.01, "lift raises blacks");
  near(luma(display(white, lifted)), 1, 1e-4, "lift leaves white");
  const gained = grade({ gain: { rgb: [0, 0, 0], master: -0.5 } });
  assert.ok(luma(display(white, gained)) < 0.95, "gain lowers white");
  near(display([0, 0, 0], gained)[0], 0, 1e-6, "gain leaves black");
  const gamma = grade({ gamma: { rgb: [0, 0, 0], master: 0.3 } });
  assert.ok(luma(display(mid, gamma)) > luma(mid) + 0.02, "gamma brightens mids");
  const warm = grade({ gain: { rgb: [0.2, 0, -0.2], master: 0 } });
  const warmed = display(mid, warm);
  assert.ok(warmed[0] > warmed[2] + 0.02, "an RGB gain shift tints");
  const offset = grade({ offset: { rgb: [0, 0, 0], master: GRADE_AXIS_STOP } });
  near(evaluateGrade(inputToWorking(mid, SDR_REC709), prepareGrade(offset))[1] / inputToWorking(mid, SDR_REC709)[1], 2, 0.01, "offset of one stop doubles linear light");
});

test("tone rows stay monotonic under extreme settings", () => {
  const extreme = grade({ contrast: 2.5, shadows: -1, highlights: 1, blacks: 1, whites: -1, lift: { rgb: [0.3, -0.3, 0], master: 0 }, gamma: { rgb: [0, 0, 0], master: -1 } });
  const atlas = bakeGradeAtlas(extreme);
  for (const row of [ATLAS_ROWS.toneR, ATLAS_ROWS.toneG, ATLAS_ROWS.toneB]) {
    for (let i = 1; i < atlas.width; i += 1) assert.ok(atlas.data[row * atlas.width + i]! >= atlas.data[row * atlas.width + i - 1]!, `row ${row} at ${i}`);
  }
});

test("saturation and hue controls change colour and leave neutrals alone", () => {
  const grey: Vec3 = [0.5, 0.5, 0.5];
  const mono = display([0.8, 0.2, 0.1], grade({ saturation: 0 }));
  near(mono[0], mono[1], 1e-4); near(mono[1], mono[2], 1e-4);
  for (const g of [grade({ saturation: 1.6 }), grade({ hueDegrees: 40 })]) {
    const out = display(grey, g);
    for (let i = 0; i < 3; i += 1) near(out[i]!, 0.5, 1e-4, "neutral");
  }
});

test("hue curves and colour slice affect only the chosen colours", () => {
  const red: Vec3 = [0.8, 0.15, 0.1], blue: Vec3 = [0.15, 0.25, 0.85], grey: Vec3 = [0.5, 0.5, 0.5];
  const desatRed = grade({ curves: { ...IDENTITY_GRADE_V2.curves, hueSat: [[0, 0.2], [0.15, 1], [0.85, 1]] } });
  const r = display(red, desatRed), b = display(blue, desatRed);
  assert.ok(r[0] - r[2] < (red[0] - red[2]) * 0.6, "red loses saturation");
  for (let i = 0; i < 3; i += 1) near(b[i]!, blue[i]!, 0.01, "blue untouched");
  const slice = grade({ slices: { ...IDENTITY_GRADE_V2.slices, blue: { hue: 0, saturation: 1, density: 1 } } });
  assert.ok(luma(display(blue, slice)) < luma(blue) - 0.02, "blue density darkens blue");
  for (let i = 0; i < 3; i += 1) near(display(grey, slice)[i]!, 0.5, 1e-4, "density leaves neutrals");
  near(luma(display(red, slice)), luma(red), 0.01, "density on blue leaves red");
  const skin = grade({ slices: { ...IDENTITY_GRADE_V2.slices, skin: { hue: 0, saturation: 0.5, density: 0 } } });
  const face: Vec3 = [0.87, 0.67, 0.55];
  const desat = display(face, skin);
  assert.ok(desat[0] - desat[2] < face[0] - face[2] - 0.03, "skin slice desaturates skin");
  for (let i = 0; i < 3; i += 1) near(display(blue, skin)[i]!, blue[i]!, 1e-4, "skin slice leaves blue");
});

test("custom curves shape tone per channel", () => {
  const mid: Vec3 = [0.45, 0.45, 0.45];
  const brighter = grade({ curves: { ...IDENTITY_GRADE_V2.curves, y: [[0, 0], [0.48, 0.55], [1, 1]] } });
  assert.ok(luma(display(mid, brighter)) > luma(mid) + 0.03);
  const blueLift = grade({ curves: { ...IDENTITY_GRADE_V2.curves, b: [[0, 0.05], [1, 1]] } });
  const out = display([0.05, 0.05, 0.05], blueLift);
  assert.ok(out[2] > out[0] + 0.02, "blue curve raises blue shadows");
});
