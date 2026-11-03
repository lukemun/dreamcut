/** Match the continuous WebGL grade used by LutCanvasFilter. This deliberately
 * does not use the SVG path's intermediate byte-transfer tables. */
export const GPU_LUT_SHADER=/* wgsl */`
fn lutTone(value:f32)->f32{
 let at=clamp(value,0.0,1.0)*64.0;let left=u32(floor(at));let right=min(64u,left+1u);
 return mix(params.toneTable[left/4u][left%4u],params.toneTable[right/4u][right%4u],fract(at));
}
fn lutCurve(value:f32)->f32{
 let at=clamp(value,0.0,1.0)*16.0;let left=u32(floor(at));let right=min(16u,left+1u);
 return mix(params.curveTable[left/4u][left%4u],params.curveTable[right/4u][right%4u],fract(at));
}
fn applyLutGrade(rgb:vec3f)->vec3f{
 var c=select(rgb/12.92,pow((rgb+vec3f(0.055))/1.055,vec3f(2.4)),rgb>=vec3f(0.04045));
 c*=params.gradeOptions.y*params.whiteBalance.xyz;
 c=c*params.contrastSaturationHue.x+vec3f(params.contrastSaturationHue.y);
 if(params.gradeOptions.z>0.5){c=vec3f(lutTone(c.r),lutTone(c.g),lutTone(c.b));}
 c=mix(vec3f(dot(c,vec3f(0.2126,0.7152,0.0722))),c,params.contrastSaturationHue.z);
 let co=cos(params.contrastSaturationHue.w);let si=sin(params.contrastSaturationHue.w);
 let hue=mat3x3f(
  vec3f(0.213+co*0.787-si*0.213,0.213-co*0.213+si*0.143,0.213-co*0.213-si*0.787),
  vec3f(0.715-co*0.715-si*0.715,0.715+co*0.285+si*0.140,0.715-co*0.715+si*0.715),
  vec3f(0.072-co*0.072+si*0.928,0.072-co*0.072-si*0.283,0.072+co*0.928+si*0.072));
 c=hue*c;c=c*params.liftSlope.xyz+params.liftIntercept.xyz;
 c=pow(max(c,vec3f(0)),params.gammaExponent.xyz)*params.gainSlope.xyz;
 c=vec3f(lutCurve(c.r),lutCurve(c.g),lutCurve(c.b));
 let graded=clamp(select(c*12.92,1.055*pow(c,vec3f(1.0/2.4))-vec3f(0.055),c>=vec3f(0.0031308)),vec3f(0),vec3f(1));
 let coord=clamp((graded-params.lutMin.xyz)/(params.lutMax.xyz-params.lutMin.xyz),vec3f(0),vec3f(1));
 let looked=textureSampleLevel(colorLut,linearSampler,coord,0.0).rgb;
 return bounded(mix(graded,looked,params.lutOptions.x));
}
`;
