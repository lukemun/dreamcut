import type {ColorGradeFilterDescriptor} from '../timeline/color-grade';

/** vec4 packing keeps uniform array alignment explicit on every WebGPU backend. */
export function gpuGradeUniforms(grade?:ColorGradeFilterDescriptor|null):number[]{
  if(!grade)return Array(116).fill(0);
  const pad=(values:readonly number[],length:number)=>[...values,...Array(length-values.length).fill(0)];
  return [1,grade.exposureSlope,grade.toneActive?1:0,0,
    grade.redGain,grade.greenGain,grade.blueGain,0,
    grade.contrastSlope,grade.contrastIntercept,grade.saturation,grade.hueDegrees*Math.PI/180,
    ...grade.liftSlope,0,...grade.liftIntercept,0,...grade.gammaExponent,0,...grade.gainSlope,0,
    ...pad(grade.toneTable,68),...pad(grade.masterCurveTable,20)];
}

export const GPU_GRADE_FIELDS=/* wgsl */`
  gradeOptions: vec4f, whiteBalance: vec4f, contrastSaturationHue: vec4f,
  liftSlope: vec4f, liftIntercept: vec4f, gammaExponent: vec4f, gainSlope: vec4f,
  toneTable: array<vec4f,17>, curveTable: array<vec4f,5>,
`;

/** Same linearRGB primitive order as ColorGradeFilter. Its verified Chromium
 * SVG surface quantizes between primitives, including the linear-light boundary.
 * Preserve that rounding: unrestricted float intermediates lift dark colors.
 * Merging exposure and white balance also changes clipped highlights. */
export const GPU_GRADE_SHADER=/* wgsl */`
fn bounded(c:vec3f)->vec3f{return floor(clamp(c,vec3f(0),vec3f(1))*255.0+vec3f(0.5))/255.0;}
fn transfer(v:f32,table:u32)->f32{
  let index=table*256u+u32(floor(clamp(v,0.0,1.0)*255.0+0.5));
  return gradeTransfer[index/4u][index%4u];
}
fn sameTransfer(c:vec3f,table:u32)->vec3f{return vec3f(transfer(c.r,table),transfer(c.g,table),transfer(c.b,table));}
fn applyGrade(rgb:vec3f)->vec3f{
  if(params.gradeOptions.x<0.5){return rgb;}
  var c=select(rgb/12.92,pow((rgb+vec3f(0.055))/1.055,vec3f(2.4)),rgb>vec3f(0.04045));
  c=bounded(c);
  c=sameTransfer(c,0u);
  c=bounded(c*params.whiteBalance.xyz);
  c=sameTransfer(c,1u);
  if(params.gradeOptions.z>0.5){c=sameTransfer(c,2u);}
  // SVG feColorMatrix saturate uses these coefficients (not Rec.709 luma).
  c=bounded(mix(vec3f(dot(c,vec3f(0.213,0.715,0.072))),c,params.contrastSaturationHue.z));
  let co=cos(params.contrastSaturationHue.w);let si=sin(params.contrastSaturationHue.w);
  let hue=mat3x3f(
    vec3f(0.213+co*0.787-si*0.213,0.213-co*0.213+si*0.143,0.213-co*0.213-si*0.787),
    vec3f(0.715-co*0.715-si*0.715,0.715+co*0.285+si*0.140,0.715-co*0.715+si*0.715),
    vec3f(0.072-co*0.072+si*0.928,0.072-co*0.072-si*0.283,0.072+co*0.928+si*0.072));
  c=bounded(hue*c);
  c=vec3f(transfer(c.r,3u),transfer(c.g,4u),transfer(c.b,5u));
  c=vec3f(transfer(c.r,6u),transfer(c.g,7u),transfer(c.b,8u));
  c=vec3f(transfer(c.r,9u),transfer(c.g,10u),transfer(c.b,11u));
  c=sameTransfer(c,12u);
  return bounded(select(c*12.92,1.055*pow(c,vec3f(1.0/2.4))-vec3f(0.055),c>vec3f(0.0031308)));
}
`;

export const GPU_GRADE_TRANSFER_BYTES=14*256*4;
/** Chromium FEComponentTransfer builds byte lookup tables, truncating each
 * output before Skia applies it. SVG numbers/table entries are float32 inputs;
 * LUT arithmetic is double precision. This is distinct from color-matrix rounding.
 * https://github.com/chromium/chromium/blob/main/third_party/blink/renderer/platform/graphics/filters/fe_component_transfer.cc */
export function gpuGradeTransferTables(grade:ColorGradeFilterDescriptor|null|undefined,glow=0){
 const byte=(v:number)=>Math.trunc(Math.min(255,Math.max(0,v)))/255;
 const linear=(s:number,b=0)=>Array.from({length:256},(_,i)=>byte(Math.fround(s)*i+255*Math.fround(b)));
 const gamma=(exponent:number)=>Array.from({length:256},(_,i)=>byte(255*Math.pow(i/255,Math.fround(exponent))));
 const table=(input:readonly number[])=>{
  const values=input.map(Math.fround);
  return Array.from({length:256},(_,i)=>{const t=i/255*(values.length-1),k=Math.floor(t);return byte(255*(values[k]+(t-k)*(values[Math.min(k+1,values.length-1)]-values[k])));});
 };
 const color=grade?[linear(grade.exposureSlope),linear(grade.contrastSlope,grade.contrastIntercept),table(grade.toneTable),
  ...grade.liftSlope.map((s,i)=>linear(s,grade.liftIntercept[i])),...grade.gammaExponent.map(gamma),...grade.gainSlope.map(s=>linear(s)),table(grade.masterCurveTable)].flat():Array(13*256).fill(0);
 return new Float32Array([...color,...linear(glow)]);
}
