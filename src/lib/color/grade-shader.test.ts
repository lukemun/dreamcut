import assert from "node:assert/strict";
import test from "node:test";
import CanvasKitInit from "canvaskit-wasm";
import { ATLAS_ROW_COUNT, ATLAS_WIDTH, IDENTITY_GRADE_V2, evaluateGrade, prepareGrade, type GradeV2 } from "./grade-v2";
import { CANVASKIT_GRADE_V2_SKSL, buildGradeShaderDescriptor, canvasKitGradeV2Uniforms } from "./grade-shader";
import { SDR_REC709, inputToWorking, sourcePeakRelative, workingToDisplay, type SourceColorSpace } from "./io-transforms";
import type { Vec3 } from "./matrices";

const kit = CanvasKitInit();
const PATCHES: Vec3[] = [];
for (let r = 0; r <= 4; r += 1) for (let g = 0; g <= 4; g += 1) for (let b = 0; b <= 4; b += 1) PATCHES.push([r / 4, g / 4, b / 4]);
PATCHES.push([0.87, 0.67, 0.55], [0.2, 0.3, 0.9], [0.8, 0.2, 0.1], [0.5, 0.5, 0.5]);

async function renderShader(grade: GradeV2, source: SourceColorSpace = SDR_REC709): Promise<Uint8Array> {
  const k = await kit;
  let diagnostic = "";
  const effect = k.RuntimeEffect.Make(CANVASKIT_GRADE_V2_SKSL, (e) => { diagnostic = e; });
  assert.ok(effect, `SkSL compiles: ${diagnostic}`);
  const width = PATCHES.length;
  const bytes = new Uint8Array(width * 4);
  PATCHES.forEach((rgb, i) => bytes.set([...rgb.map((v) => Math.round(v * 255)), 255], i * 4));
  const info = (w: number, h: number) => ({ width: w, height: h, colorType: k.ColorType.RGBA_8888, alphaType: k.AlphaType.Unpremul, colorSpace: k.ColorSpace.SRGB });
  const image = k.MakeImage(info(width, 1), bytes, width * 4)!;
  const descriptor = buildGradeShaderDescriptor(grade, source);
  const atlasImage = k.MakeImage({ ...info(ATLAS_WIDTH, ATLAS_ROW_COUNT), alphaType: k.AlphaType.Opaque }, descriptor.atlasBytes(), ATLAS_WIDTH * 4)!;
  const lutImage = k.MakeImage({ ...info(2, 4), alphaType: k.AlphaType.Opaque }, new Uint8Array(32).fill(255), 8)!;
  const nearest = (img: typeof image) => img.makeShaderOptions(k.TileMode.Clamp, k.TileMode.Clamp, k.FilterMode.Nearest, k.MipmapMode.None);
  const children = [nearest(image), nearest(atlasImage), nearest(lutImage)];
  const shader = effect!.makeShaderWithChildren(canvasKitGradeV2Uniforms(descriptor), children);
  const surface = k.MakeSurface(width, 1)!, paint = new k.Paint();
  try {
    paint.setShader(shader);
    surface.getCanvas().drawPaint(paint);
    surface.flush();
    return surface.getCanvas().readPixels(0, 0, info(width, 1)) as Uint8Array;
  } finally {
    paint.delete(); surface.delete(); shader.delete(); children.forEach((c) => c.delete());
    image.delete(); atlasImage.delete(); lutImage.delete(); effect!.delete();
  }
}

function reference(grade: GradeV2, source: SourceColorSpace = SDR_REC709): number[] {
  const baked = prepareGrade(grade), sourcePeak = sourcePeakRelative(source);
  return PATCHES.flatMap((rgb) => workingToDisplay(evaluateGrade(inputToWorking(rgb, source), baked), { sourcePeak }).map((v) => v * 255));
}

async function difference(grade: GradeV2, source?: SourceColorSpace) {
  const pixels = await renderShader(grade, source), expected = reference(grade, source);
  let max = 0, sum = 0;
  for (let i = 0; i < PATCHES.length; i += 1) for (let c = 0; c < 3; c += 1) {
    const d = Math.abs(pixels[i * 4 + c]! - expected[i * 3 + c]!);
    max = Math.max(max, d); sum += d;
  }
  return { max, mean: sum / (PATCHES.length * 3) };
}

const cases: Array<[string, GradeV2, SourceColorSpace?]> = [
  ["identity", IDENTITY_GRADE_V2],
  ["exposure, white balance, contrast and zones", { ...IDENTITY_GRADE_V2, exposureEv: 0.5, temperature: 0.4, tint: -0.2, contrast: 1.3, shadows: 0.3, highlights: -0.4 }],
  ["wheels", { ...IDENTITY_GRADE_V2, lift: { rgb: [0.02, 0, -0.02], master: 0.05 }, gamma: { rgb: [0, 0.1, 0], master: 0.1 }, gain: { rgb: [0.1, 0, -0.1], master: -0.2 }, offset: { rgb: [0, 0, 0.01], master: 0 } }],
  ["curves and saturation", { ...IDENTITY_GRADE_V2, saturation: 1.3, hueDegrees: 12, curves: { ...IDENTITY_GRADE_V2.curves, y: [[0, 0.02], [0.48, 0.52], [1, 1]], b: [[0, 0.03], [1, 1]] } }],
  ["hue curves and slices", { ...IDENTITY_GRADE_V2, curves: { ...IDENTITY_GRADE_V2.curves, hueSat: [[0, 0.5], [0.3, 1], [0.7, 1]], hueHue: [[0.6, 15]] }, slices: { ...IDENTITY_GRADE_V2.slices, blue: { hue: 10, saturation: 1.2, density: 0.5 }, skin: { hue: -5, saturation: 0.8, density: 0 } } }],
  ["HLG source tone-mapped", { ...IDENTITY_GRADE_V2, exposureEv: -0.5 }, { transfer: "hlg", primaries: "rec2020" }],
];

for (const [label, grade, source] of cases) {
  // CanvasKit's CPU raster approximates log2/exp2/pow; saturation then amplifies that in dark channels
  // of saturated colours. The browser GPU path is checked tighter by the renderer contract.
  test(`CanvasKit grade shader matches the reference: ${label}`, async () => {
    const { max, mean } = await difference(grade, source);
    assert.ok(mean <= 0.6 && max <= 5, `mean ${mean.toFixed(3)} max ${max.toFixed(3)} levels`);
  });
}

test("identity on SDR stays within one level, and mostly exact, on the CPU raster", async () => {
  // Exactness itself is checked on the GPU path; the CPU's approximate pow can tip a dithered value.
  const pixels = await renderShader(IDENTITY_GRADE_V2);
  let exact = 0;
  PATCHES.forEach((rgb, i) => rgb.forEach((v, c) => {
    const d = Math.abs(pixels[i * 4 + c]! - Math.round(v * 255));
    assert.ok(d <= 1, `patch ${rgb} channel ${c} off by ${d}`);
    if (d === 0) exact += 1;
  }));
  assert.ok(exact / (PATCHES.length * 3) >= 0.9, `${exact} of ${PATCHES.length * 3} exact`);
});
