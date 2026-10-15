import { hasKeyframes, removeKeyframes, resolveNumberKeyframe, upsertKeyframe } from "./keyframes";

type PropsLike = Record<string, unknown> | null | undefined;

export const MAX_CUBE_LUT_BYTES = 2 * 1024 * 1024;
export const MIN_CUBE_LUT_SIZE = 2;
export const MAX_CUBE_LUT_SIZE = 64;

export type ParsedCubeLut = {
  title: string | null;
  size: number;
  domainMin: readonly [number, number, number];
  domainMax: readonly [number, number, number];
  data: readonly number[];
};

export type ColorGradeLut = {
  assetId: string;
  sourceUrl: string;
  intensity: number;
};

export const COLOR_GRADE_LUT_KEYFRAME_FIELDS = ["lut_intensity"] as const;

function finiteTriplet(parts: string[], lineNumber: number) {
  if (parts.length !== 3) throw new Error(`Line ${lineNumber}: expected three numeric values.`);
  const values = parts.map(Number);
  if (values.some((value) => !Number.isFinite(value))) throw new Error(`Line ${lineNumber}: LUT values must be finite numbers.`);
  return values as [number, number, number];
}

export function parseCubeLut(text: string): ParsedCubeLut {
  if (new TextEncoder().encode(text).byteLength > MAX_CUBE_LUT_BYTES) {
    throw new Error(`.cube file exceeds the ${MAX_CUBE_LUT_BYTES / 1024 / 1024} MB limit.`);
  }
  let title: string | null = null;
  let size: number | null = null;
  let domainMin: [number, number, number] = [0, 0, 0];
  let domainMax: [number, number, number] = [1, 1, 1];
  const data: number[] = [];

  for (const [index, sourceLine] of text.split(/\r?\n/).entries()) {
    const lineNumber = index + 1;
    const line = sourceLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [keyword, ...rest] = line.split(/\s+/);
    if (keyword === "TITLE") {
      title = rest.join(" ").replace(/^"|"$/g, "").trim() || null;
      continue;
    }
    if (keyword === "LUT_1D_SIZE") throw new Error("1D .cube files are not supported; upload a 3D LUT.");
    if (keyword === "LUT_3D_SIZE") {
      const parsed = Number(rest[0]);
      if (!Number.isInteger(parsed) || parsed < MIN_CUBE_LUT_SIZE || parsed > MAX_CUBE_LUT_SIZE) {
        throw new Error(`LUT_3D_SIZE must be an integer from ${MIN_CUBE_LUT_SIZE} to ${MAX_CUBE_LUT_SIZE}.`);
      }
      size = parsed;
      continue;
    }
    if (keyword === "DOMAIN_MIN") {
      domainMin = finiteTriplet(rest, lineNumber);
      continue;
    }
    if (keyword === "DOMAIN_MAX") {
      domainMax = finiteTriplet(rest, lineNumber);
      continue;
    }
    if (/^[A-Za-z_]/.test(keyword ?? "")) throw new Error(`Line ${lineNumber}: unsupported .cube directive ${keyword}.`);
    data.push(...finiteTriplet([keyword!, ...rest], lineNumber).map((value) => Math.min(1, Math.max(0, value))));
  }

  if (size == null) throw new Error("Missing LUT_3D_SIZE directive.");
  if (domainMin.some((value, index) => value >= domainMax[index]!)) throw new Error("DOMAIN_MIN must be below DOMAIN_MAX on every channel.");
  const expected = size * size * size * 3;
  if (data.length !== expected) throw new Error(`Expected ${expected / 3} LUT rows for size ${size}, found ${data.length / 3}.`);
  return { title, size, domainMin, domainMax, data };
}

export function normalizeLutIntensity(value: unknown) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return Number(Math.min(1, Math.max(0, numeric)).toFixed(3));
}

export function readColorGradeLutProps(props: PropsLike): ColorGradeLut | null {
  const assetId = props?.lut_asset_id;
  const sourceUrl = props?.lut_source_url;
  if (assetId == null && sourceUrl == null && props?.lut_intensity == null) return null;
  if (typeof assetId !== "string" || !/^[a-f0-9]{16,64}$/.test(assetId)) throw new Error("Invalid or missing lut_asset_id.");
  const projectLocal = typeof sourceUrl === "string" && (/^\/api\/projects\//.test(sourceUrl) || /^https?:\/\/[^/]+\/api\/projects\//.test(sourceUrl)) && sourceUrl.endsWith(".cube");
  if (!projectLocal) throw new Error("Invalid or missing project-local lut_source_url.");
  return { assetId, sourceUrl, intensity: normalizeLutIntensity(props?.lut_intensity) };
}

export function resolveColorGradeLutAtTime(props: PropsLike, timeSeconds: number): ColorGradeLut | null {
  const lut = readColorGradeLutProps(props);
  if (!lut) return null;
  return {
    ...lut,
    intensity: normalizeLutIntensity(resolveNumberKeyframe(props, "lut_intensity", timeSeconds, lut.intensity, { min: 0, max: 1 })),
  };
}

export function writeColorGradeLutProps(props: PropsLike, lut: { assetId: string; sourceUrl: string }, intensity = 1) {
  return {
    ...(props ?? {}),
    lut_asset_id: lut.assetId,
    lut_source_url: lut.sourceUrl,
    lut_intensity: normalizeLutIntensity(intensity),
    color_grade_model: "linear-srgb-v1",
  };
}

export function commitColorGradeLutIntensityAtTime(props: PropsLike, timeSeconds: number, intensity: number) {
  const lut = readColorGradeLutProps(props);
  if (!lut) throw new Error("Choose a LUT before adjusting its intensity.");
  const normalized = normalizeLutIntensity(intensity);
  const next = hasKeyframes(props, "lut_intensity")
    ? upsertKeyframe(props, "lut_intensity", timeSeconds, normalized)
    : { ...(props ?? {}), lut_intensity: normalized };
  next.color_grade_model = "linear-srgb-v1";
  return next;
}

export function resetColorGradeLutProps(props: PropsLike) {
  const next = removeKeyframes(props, COLOR_GRADE_LUT_KEYFRAME_FIELDS);
  delete next.lut_asset_id;
  delete next.lut_source_url;
  delete next.lut_intensity;
  const keyframes = next.keyframes && typeof next.keyframes === "object"
    ? next.keyframes as Record<string, unknown>
    : {};
  const hasRemainingGrade = Object.keys(next).some((key) => key.startsWith("grade_") || key.startsWith("lut_"))
    || Object.keys(keyframes).some((key) => key.startsWith("grade_") || key.startsWith("lut_"));
  if (!hasRemainingGrade) delete next.color_grade_model;
  return next;
}

/** Shared RGBA8 upload authority for WebGL and WebGPU LUT sampling. Red varies
 * fastest in .cube order; quantization is deliberately the existing byte rule. */
export function cubeLutRgbaBytes(parsed:ParsedCubeLut):Uint8Array<ArrayBuffer> {
  if(!Number.isInteger(parsed.size)||parsed.size<MIN_CUBE_LUT_SIZE||parsed.size>MAX_CUBE_LUT_SIZE
    ||parsed.data.length!==parsed.size**3*3)throw Error('Invalid parsed LUT dimensions');
  const bytes=new Uint8Array(parsed.size**3*4);
  for(let index=0;index<parsed.size**3;index++){
    for(let channel=0;channel<3;channel++){
      const value=parsed.data[index*3+channel]!;
      if(!Number.isFinite(value)||value<0||value>1)throw Error('Invalid parsed LUT value');
      bytes[index*4+channel]=Math.round(value*255);
    }
    bytes[index*4+3]=255;
  }
  return bytes;
}
