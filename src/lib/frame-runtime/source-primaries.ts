/** SMPTE-C → sRGB, linear RGB, row-major. Derived from Skia Rec601/709 D65
 * chromaticities; SDR transfer interpretation follows native-preview/source-color.
 * https://skia.googlesource.com/skia/+/main/include/core/SkColorSpace.h
 */
export const SMPTE_C_TO_SRGB = [
  [0.939542064,0.050181357,0.010276579],
  [0.017772223,0.965792862,0.016434914],
  [-0.001621600,-0.004369750,1.005991350],
] as const;
export const SMPTE_C_SVG_MATRIX = [...SMPTE_C_TO_SRGB.flatMap(row=>[...row,0,0]),0,0,0,1,0].join(' ');
export const SMPTE_C_WGSL_MATRIX = `mat3x3f(${[0,1,2].map(column=>`vec3f(${SMPTE_C_TO_SRGB.map(row=>row[column]).join(',')})`).join(',')})`;
