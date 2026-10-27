/**
 * One grade shader for every renderer. The body is written once in the GLSL subset SkSL also
 * accepts; CanvasKit (default renderer, GPU export) and the Standard WebGL2 filter wrap it with
 * their own sampling. Constants and the atlas encoding come from the TypeScript reference
 * (grade-v2.ts, io-transforms.ts), so preview, export and the reference evaluate the same maths.
 */
import { ATLAS_ROWS, ATLAS_ROW_COUNT, ATLAS_WIDTH, HUE_ZERO, SAT_NORM, SKIN_HUE, bakeGradeAtlas, saturationHueMatrix, whiteBalanceMatrix, type GradeV2 } from "./grade-v2";
import { SDR_REC709, WORKING_PRIMARIES, sourcePeakRelative, type SourceColorSpace } from "./io-transforms";
import { gamutMatrix, lumaWeights, type Mat3 } from "./matrices";
import { HLG_REFERENCE_WHITE_SCENE, REFERENCE_WHITE_NITS, linearToAcescct, nitsToPq } from "./transfers";

/** Each atlas row is stored as 16 bits (R = high byte, G = low byte) over a fixed range. */
export const ATLAS_RANGES: Record<keyof typeof ATLAS_ROWS, readonly [number, number]> = {
  toneR: [-0.5, 1.5], toneG: [-0.5, 1.5], toneB: [-0.5, 1.5],
  curveR: [-0.5, 1.5], curveG: [-0.5, 1.5], curveB: [-0.5, 1.5],
  hueShift: [-0.5, 0.5], hueSat: [0, 4], hueLum: [-4, 4], hueDensity: [-4, 4],
  lumSat: [0, 4], satSat: [0, 4],
  skinHue: [-0.5, 0.5], skinSat: [-1, 3], skinDensity: [-4, 4],
};

export function encodeGradeAtlas(atlas: ReturnType<typeof bakeGradeAtlas>): Uint8Array {
  const bytes = new Uint8Array(ATLAS_WIDTH * ATLAS_ROW_COUNT * 4);
  for (const [name, row] of Object.entries(ATLAS_ROWS) as Array<[keyof typeof ATLAS_ROWS, number]>) {
    const [lo, hi] = ATLAS_RANGES[name];
    for (let i = 0; i < ATLAS_WIDTH; i += 1) {
      const value = atlas.data[row * ATLAS_WIDTH + i]!;
      const q = Math.round(Math.min(1, Math.max(0, (value - lo) / (hi - lo))) * 65535);
      bytes.set([q >> 8, q & 255, 0, 255], (row * ATLAS_WIDTH + i) * 4);
    }
  }
  return bytes;
}

export const TRANSFER_CODES = { srgb: 0, hlg: 1, pq: 2, linear: 3 } as const;

export type GradeShaderDescriptor = {
  /** Stable identity of the atlas bytes, for upload caches. */
  atlasKey: string;
  atlasBytes: () => Uint8Array;
  inputMatrix: Mat3;
  transfer: number;
  linearMatrix: Mat3;
  chromaMatrix: Mat3;
  hslActive: boolean;
  /** srcPq, maxLum, knee start of the BT.2390 tone map; srcPq 0 when the source fits SDR. */
  toneMap: readonly [number, number, number];
  gamutThreshold: number;
};

function hasHsl(grade: GradeV2) {
  const c = grade.curves;
  return [c.hueHue, c.hueSat, c.hueLum, c.lumSat, c.satSat].some((points) => points.length > 0)
    || Object.values(grade.slices).some((s) => s.hue !== 0 || s.saturation !== 1 || s.density !== 0);
}

// Baking is the only costly step (15 rows × 1024 samples), so atlases are cached by what they encode:
// playback rebuilds descriptors every frame but only re-bakes when a curve or tone control changes.
const ATLAS_CACHE_LIMIT = 32;
const atlasCache = new Map<string, Uint8Array>();
function cachedAtlasBytes(key: string, grade: GradeV2) {
  let bytes = atlasCache.get(key);
  if (bytes) { atlasCache.delete(key); atlasCache.set(key, bytes); return bytes; }
  bytes = encodeGradeAtlas(bakeGradeAtlas(grade));
  atlasCache.set(key, bytes);
  if (atlasCache.size > ATLAS_CACHE_LIMIT) atlasCache.delete(atlasCache.keys().next().value!);
  return bytes;
}

export function buildGradeShaderDescriptor(grade: GradeV2, source: SourceColorSpace = SDR_REC709, maxCllNits?: number | null): GradeShaderDescriptor {
  const sourcePeak = sourcePeakRelative(source, maxCllNits);
  const srcPq = sourcePeak > 1 ? nitsToPq(sourcePeak * REFERENCE_WHITE_NITS) : 0;
  const maxLum = srcPq ? nitsToPq(REFERENCE_WHITE_NITS) / srcPq : 1;
  const atlasKey = `grade-v2:${JSON.stringify([grade.offset, grade.lift, grade.gamma, grade.gain, grade.contrast, grade.contrastPivot, grade.highlights, grade.shadows, grade.whites, grade.blacks, grade.curves, grade.slices])}`;
  const exposure = 2 ** grade.exposureEv;
  return {
    atlasKey,
    atlasBytes: () => cachedAtlasBytes(atlasKey, grade),
    inputMatrix: source.primaries === WORKING_PRIMARIES ? [[1, 0, 0], [0, 1, 0], [0, 0, 1]] : gamutMatrix(source.primaries, WORKING_PRIMARIES),
    transfer: TRANSFER_CODES[source.transfer],
    linearMatrix: whiteBalanceMatrix(grade.temperature, grade.tint).map((row) => row.map((c) => c * exposure)) as unknown as Mat3,
    chromaMatrix: saturationHueMatrix(grade.saturation, grade.hueDegrees),
    hslActive: hasHsl(grade),
    toneMap: [srcPq, maxLum, srcPq ? 1.5 * maxLum - 0.5 : 1],
    gamutThreshold: sourcePeak > 1 ? 0.815 : 1,
  };
}

/** Column-major floats for a GLSL/SkSL mat3 uniform. */
export function matrixColumns(m: Mat3): number[] {
  return [m[0][0], m[1][0], m[2][0], m[0][1], m[1][1], m[2][1], m[0][2], m[1][2], m[2][2]];
}

const f = (n: number) => { const s = n.toPrecision(12); return s.includes(".") || s.includes("e") ? s : `${s}.0`; };
const LUMA = lumaWeights("rec709");
const AXIS_ZERO = linearToAcescct(0), AXIS_RANGE = linearToAcescct(16) - AXIS_ZERO;
const row = (name: keyof typeof ATLAS_ROWS) => `${f(ATLAS_ROWS[name])},${f(ATLAS_RANGES[name][0])},${f(ATLAS_RANGES[name][1])}`;

/** Shared body. Each backend defines `vec4 atlasTexel(vec2 texelCentre)` and `vec3 lutLookup(vec3 encoded)` first. */
export const GRADE_SHADER_BODY = `
float toCct(float l){return l<=0.0078125?10.5402377416545*l+0.0729055341958355:(log2(l)+9.72)/17.52;}
float fromCct(float c){return c<=0.155251141552511?(c-0.0729055341958355)/10.5402377416545:exp2(c*17.52-9.72);}
float toAxis(float l){return (toCct(l)-${f(AXIS_ZERO)})/${f(AXIS_RANGE)};}
float fromAxis(float u){return fromCct(u*${f(AXIS_RANGE)}+${f(AXIS_ZERO)});}
float decodeTexel(vec4 t,float lo,float hi){return lo+(floor(t.r*255.0+0.5)*256.0+floor(t.g*255.0+0.5))/65535.0*(hi-lo);}
float rowSample(float x,float r,float lo,float hi){
 float p=clamp(x,0.0,1.0)*${f(ATLAS_WIDTH - 1)};float i=min(floor(p),${f(ATLAS_WIDTH - 2)});
 return mix(decodeTexel(atlasTexel(vec2(i+0.5,r+0.5)),lo,hi),decodeTexel(atlasTexel(vec2(i+1.5,r+0.5)),lo,hi),p-i);
}
float rowExtend(float x,float r,float lo,float hi){
 if(x<0.0){float a=rowSample(0.0,r,lo,hi);return a+x*${f(ATLAS_WIDTH - 1)}*(rowSample(${f(1 / (ATLAS_WIDTH - 1))},r,lo,hi)-a);}
 if(x>1.0){float b=rowSample(1.0,r,lo,hi);return b+(x-1.0)*${f(ATLAS_WIDTH - 1)}*(b-rowSample(${f(1 - 1 / (ATLAS_WIDTH - 1))},r,lo,hi));}
 return rowSample(x,r,lo,hi);
}
float tone(float l,float r,float lo,float hi){return fromAxis(rowExtend(toAxis(l),r,lo,hi));}
float srgbDecode(float v){float a=abs(v);float d=a<=0.04045?a/12.92:pow((a+0.055)/1.055,2.4);return v<0.0?-d:d;}
float srgbEncode(float l){float a=abs(l);float e=a<=0.0031308?a*12.92:1.055*pow(a,1.0/2.4)-0.055;return l<0.0?-e:e;}
float hlgDecode(float v){float e=max(v,0.0);return (e<=0.5?e*e/3.0:(exp((e-0.559910729529562)/0.17883277)+0.28466892)/12.0)/${f(HLG_REFERENCE_WHITE_SCENE)};}
float pqToNits(float v){float p=pow(max(v,0.0),1.0/78.84375);return 10000.0*pow(max(p-0.8359375,0.0)/(18.8515625-18.6875*p),1.0/0.1593017578125);}
float nitsToPq(float n){float y=pow(max(n,0.0)/10000.0,0.1593017578125);return pow((0.8359375+18.8515625*y)/(1.0+18.6875*y),78.84375);}
float decodeChannel(float v){return transfer<0.5?srgbDecode(v):transfer<1.5?hlgDecode(v):transfer<2.5?pqToNits(v)/${f(REFERENCE_WHITE_NITS)}:v;}
float luma(vec3 c){return dot(c,vec3(${f(LUMA[0])},${f(LUMA[1])},${f(LUMA[2])}));}
vec2 opponent(vec3 d){return vec2((2.0*d.r-d.g-d.b)*0.5,0.866025403784439*(d.g-d.b));}
vec3 fromOpponent(float m,vec2 c){return vec3(m+0.666666666666667*c.x,m-c.x/3.0+c.y*0.577350269189626,m-c.x/3.0-c.y*0.577350269189626);}
vec3 adjustChroma(vec3 lin,float radians,float gain){
 float y=luma(lin);vec3 d=lin-vec3(y);vec2 o=opponent(d);float m=(d.r+d.g+d.b)/3.0;float c=cos(radians),s=sin(radians);
 return fromOpponent(m,vec2(o.x*c-o.y*s,o.x*s+o.y*c)*gain)+vec3(y);
}
float skinWindow(float h){float d=abs(fract(h-${f(SKIN_HUE)}+1.5)-0.5);return d>=${f(15 / 360)}?0.0:0.5*(1.0+cos(3.14159265358979*d/${f(15 / 360)}));}
float skinGate(float s){return smoothstep(0.04,0.12,s)*(1.0-smoothstep(0.6,0.9,s));}
vec3 hslStage(vec3 lin){
 float y=luma(lin);vec3 d=lin-vec3(y);vec2 o=opponent(d);float chroma=length(o);
 if(chroma<1e-9||y<=0.0)return lin;
 float sat=chroma/y/${f(SAT_NORM)};float hue=fract(atan(o.y,o.x)/6.28318530717959-${f(HUE_ZERO)}+1.0);
 float gate=skinGate(sat)*skinWindow(hue);float weight=min(1.0,sat);
 float shift=(rowSample(hue,${row("hueShift")})+gate*rowSample(hue,${row("skinHue")}))*6.28318530717959;
 float gain=rowSample(hue,${row("hueSat")})*rowSample(toAxis(y),${row("lumSat")})*rowSample(sat,${row("satSat")})*(1.0+gate*rowSample(hue,${row("skinSat")}));
 float stops=weight*rowSample(hue,${row("hueLum")})-weight*(rowSample(hue,${row("hueDensity")})+gate*rowSample(hue,${row("skinDensity")}));
 return adjustChroma(lin,shift,gain)*exp2(stops);
}
vec3 compressGamut(vec3 c){
 float ach=max(c.r,max(c.g,c.b));
 if(ach<=0.0)return vec3(0.0);
 if(gamutThreshold>=1.0)return max(c,vec3(0.0));
 vec3 lim=vec3(1.147,1.264,1.312);vec3 d=(vec3(ach)-c)/ach;vec3 t=vec3(gamutThreshold);
 vec3 scale=(lim-t)/pow(pow((vec3(1.0)-t)/(lim-t),vec3(-1.2))-vec3(1.0),vec3(1.0/1.2));
 vec3 n=max(d-t,vec3(0.0))/scale;vec3 cd=t+scale*n/pow(vec3(1.0)+pow(n,vec3(1.2)),vec3(1.0/1.2));
 return vec3(ach)-mix(d,cd,step(t,d))*ach;
}
float toneMapPeak(float rel){
 if(toneMap.x<=0.0)return min(rel,1.0);
 float e=min(1.0,nitsToPq(rel*${f(REFERENCE_WHITE_NITS)})/toneMap.x);float ks=toneMap.z;float m=e;
 if(e>ks){float t=(e-ks)/(1.0-ks);float t2=t*t,t3=t2*t;m=(2.0*t3-3.0*t2+1.0)*ks+(t3-2.0*t2+t)*(1.0-ks)+(-2.0*t3+3.0*t2)*toneMap.y;}
 return pqToNits(m*toneMap.x)/${f(REFERENCE_WHITE_NITS)};
}
vec3 gradeEncoded(vec3 encoded,vec2 position){
 vec3 lin=inputMatrix*vec3(decodeChannel(encoded.r),decodeChannel(encoded.g),decodeChannel(encoded.b));
 lin=linearMatrix*lin;
 lin=vec3(tone(lin.r,${row("toneR")}),tone(lin.g,${row("toneG")}),tone(lin.b,${row("toneB")}));
 lin=vec3(tone(lin.r,${row("curveR")}),tone(lin.g,${row("curveG")}),tone(lin.b,${row("curveB")}));
 lin=chromaMatrix*lin;
 if(hslActive>0.5)lin=hslStage(lin);
 if(outputMode>0.5){
  // HDR export: keep light above SDR white (up to the display peak) and colour beyond Rec.709 for the
  // BT.2020 encode; a half-float surface carries it. Values stay relative to SDR white, sRGB-encoded.
  float hdrPeak=max(lin.r,max(lin.g,lin.b));
  if(hdrPeak>0.0&&toneMap.x>0.0)lin*=toneMapPeak(hdrPeak)/hdrPeak;
  lin=min(lin,vec3(displayPeak));
  vec3 extended=vec3(srgbEncode(lin.r),srgbEncode(lin.g),srgbEncode(lin.b));
  if(lutIntensity>0.0)extended=mix(extended,lutLookup(clamp(extended,0.0,1.0)),lutIntensity);
  return extended;
 }
 lin=compressGamut(lin);
 float peak=max(lin.r,max(lin.g,lin.b));
 if(peak>0.0&&toneMap.x>0.0)lin*=toneMapPeak(peak)/peak;
 vec3 outColor=clamp(vec3(srgbEncode(lin.r),srgbEncode(lin.g),srgbEncode(lin.b)),0.0,1.0);
 if(lutIntensity>0.0)outColor=mix(outColor,lutLookup(outColor),lutIntensity);
 // Quantize here with a deterministic sub-level dither, so banding breaks up but an exact 8-bit value
 // never moves. The quarter-level bias survives both rounding (GPU) and truncating (CPU) stores.
 float noise=(fract(sin(dot(floor(position),vec2(12.9898,78.233)))*43758.5453)-0.5)*0.98;
 return (min(floor(outColor*255.0+0.5+noise),vec3(255.0))+vec3(0.25))/255.0;
}
`;

const UNIFORMS = (sampler: "shader" | "glsl") => `
uniform ${sampler === "shader" ? "float3x3" : "mat3"} inputMatrix;
uniform float transfer;
uniform ${sampler === "shader" ? "float3x3" : "mat3"} linearMatrix;
uniform ${sampler === "shader" ? "float3x3" : "mat3"} chromaMatrix;
uniform float hslActive;
uniform ${sampler === "shader" ? "float3" : "vec3"} toneMap;
uniform float gamutThreshold;
uniform float lutIntensity;
uniform float lutSize;
uniform ${sampler === "shader" ? "float3" : "vec3"} lutDomainMin;
uniform ${sampler === "shader" ? "float3" : "vec3"} lutDomainMax;
uniform float outputMode;
uniform float displayPeak;
`;

/** CanvasKit runtime effect. Children: source, atlas (1024×15 RGBA8, nearest), lut (2D atlas of a 3D LUT). */
export const CANVASKIT_GRADE_V2_SKSL = `
uniform shader source;
uniform shader atlas;
uniform shader lut;
${UNIFORMS("shader")}
vec4 atlasTexel(vec2 p){return vec4(atlas.eval(p));}
vec3 lutTap(vec3 p){p=clamp(p,vec3(0.0),vec3(lutSize-1.0));return vec3(lut.eval(vec2(p.r+0.5,p.g+p.b*lutSize+0.5)).rgb);}
vec3 lutLookup(vec3 c){
 vec3 p=clamp((c-lutDomainMin)/(lutDomainMax-lutDomainMin),0.0,1.0)*lutSize-0.5;vec3 a=floor(p),t=fract(p);
 return mix(mix(mix(lutTap(a),lutTap(a+vec3(1.0,0.0,0.0)),t.r),mix(lutTap(a+vec3(0.0,1.0,0.0)),lutTap(a+vec3(1.0,1.0,0.0)),t.r),t.g),mix(mix(lutTap(a+vec3(0.0,0.0,1.0)),lutTap(a+vec3(1.0,0.0,1.0)),t.r),mix(lutTap(a+vec3(0.0,1.0,1.0)),lutTap(a+vec3(1.0,1.0,1.0)),t.r),t.g),t.b);
}
${GRADE_SHADER_BODY}
half4 main(float2 p){
 half4 pixel=source.eval(p);
 if(pixel.a<=0)return half4(0);
 float3 graded=gradeEncoded(float3(pixel.rgb)/float(pixel.a),p);
 return half4(half3(graded*float(pixel.a)),pixel.a);
}`;

/** Where graded pixels go: an SDR display (preview, SDR export) or an HDR export with headroom up to `peak` (relative to SDR white). */
export type GradeOutput = { mode: "sdr" } | { mode: "hdr"; peak: number };
export const SDR_OUTPUT: GradeOutput = { mode: "sdr" };
/** HLG export: 1000-nit nominal peak over 203-nit SDR white. */
export const HLG_EXPORT_OUTPUT: GradeOutput = { mode: "hdr", peak: 1000 / REFERENCE_WHITE_NITS };

/** The tone-map uniform for an output: an HDR export compresses only what exceeds its own peak. */
export function toneMapForOutput(d: GradeShaderDescriptor, output: GradeOutput): readonly [number, number, number] {
  if (output.mode === "sdr" || d.toneMap[0] <= 0) return d.toneMap;
  const srcPq = d.toneMap[0];
  const maxLum = nitsToPq(output.peak * REFERENCE_WHITE_NITS) / srcPq;
  return maxLum >= 1 ? [0, 1, 1] : [srcPq, maxLum, 1.5 * maxLum - 0.5];
}

/** Uniform values for CanvasKit, in declaration order. */
export function canvasKitGradeV2Uniforms(d: GradeShaderDescriptor, lut?: { size: number; intensity: number; domainMin: readonly number[]; domainMax: readonly number[] } | null, output: GradeOutput = SDR_OUTPUT): number[] {
  return [
    ...matrixColumns(d.inputMatrix), d.transfer, ...matrixColumns(d.linearMatrix), ...matrixColumns(d.chromaMatrix),
    d.hslActive ? 1 : 0, ...toneMapForOutput(d, output), d.gamutThreshold,
    lut?.intensity ?? 0, lut?.size ?? 2, ...(lut?.domainMin ?? [0, 0, 0]), ...(lut?.domainMax ?? [1, 1, 1]),
    output.mode === "hdr" ? 1 : 0, output.mode === "hdr" ? output.peak : 1,
  ];
}

/** Standard renderer: WebGL2 fragment shader with the same body. */
export const WEBGL_GRADE_V2_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform sampler2D u_source;
uniform vec2 u_sourceScale;
uniform sampler2D u_atlas;
uniform highp sampler3D u_lut;
uniform vec2 u_canvasSize;
uniform vec4 u_recolorR;
uniform vec4 u_recolorG;
uniform vec4 u_recolorB;
uniform bool u_recolorActive;
${UNIFORMS("glsl")}
vec4 atlasTexel(vec2 p){return texelFetch(u_atlas,ivec2(p),0);}
vec3 lutLookup(vec3 c){return texture(u_lut,clamp((c-lutDomainMin)/(lutDomainMax-lutDomainMin),0.0,1.0)).rgb;}
${GRADE_SHADER_BODY}
void main(){
 vec2 sourceUv=(v_uv-0.5)/u_sourceScale+0.5;
 if(any(lessThan(sourceUv,vec2(0.0)))||any(greaterThan(sourceUv,vec2(1.0)))){fragColor=vec4(0.0);return;}
 vec4 pixel=texture(u_source,sourceUv);
 if(pixel.a<=0.0){fragColor=vec4(0.0);return;}
 vec3 rgb=pixel.rgb;
 if(u_recolorActive){vec4 original=vec4(rgb,1.0);rgb=floor(clamp(vec3(dot(u_recolorR,original),dot(u_recolorG,original),dot(u_recolorB,original)),0.0,1.0)*255.0+0.5)/255.0;}
 vec3 graded=gradeEncoded(rgb,v_uv*u_canvasSize);
 fragColor=vec4(graded*pixel.a,pixel.a);
}`;
