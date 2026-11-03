/** Match Skia's rounded morphology radius and bounded linear/sparse dilation.
 * The filter is evaluated in composition pixels after source orientation and
 * media scale; outer masks and opacity remain later stages. */
export function morphologySteps(radius:number){
 if(!Number.isFinite(radius)||radius<0)throw Error('Invalid GPU morphology radius');
 const target=Math.min(256,Math.floor(radius+.5));
 const steps:number[]=[];let applied=0;
 while(applied<target){const next=applied===0?Math.min(14,target):Math.min(target-applied,applied);steps.push(next);applied+=next;}
 return steps;
}
/** Outline-layer actor (TimelineComposition outline branch): feMorphology dilate of
 * the mask's alpha by `outline_width` CSS px of the media box, flooded with the color.
 * The media box is composition-sized, so the radius scales with media scale only. */
export function gpuOutlineLayerDraw(props:Record<string,unknown>,mediaScale:number){
 const width=Math.max(0,Math.min(64,Number(props.outline_width??8)));
 const hex=/^#[0-9a-f]{6}$/i.test(String(props.outline_color))?String(props.outline_color):'#ffffff';
 return {radius:(Number.isFinite(width)?width:0)*mediaScale,softness:0,only:true,
  color:[1,3,5].map(offset=>parseInt(hex.slice(offset,offset+2),16)/255) as [number,number,number]};
}
export function outlinePassPlan(radius:number,softness:number,blur:{x:number;y:number}={x:0,y:0}){
 if(![radius,softness,blur.x,blur.y].every(v=>Number.isFinite(v)&&v>=0)||softness>41)throw Error('Invalid GPU outline geometry');
 const steps=morphologySteps(radius);
 const dilation=steps.reduce((sum,n)=>sum+n,0);
 return {steps,softness,padX:dilation+Math.ceil(3*(softness+blur.x)),padY:dilation+Math.ceil(3*(softness+blur.y)),passes:3+2*steps.length};
}
export const MORPHOLOGY_SHADER=/* wgsl */`
struct Params {axis:vec4f}
@group(0) @binding(0) var<uniform> params:Params;
@group(0) @binding(1) var picture:texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
 let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));return vec4f(p[i],0,1);
}
fn alpha(p:vec2i)->f32{
 if(any(p<vec2i(0))||any(p>=vec2i(textureDimensions(picture)))){return 0;}
 return textureLoad(picture,p,0).a;
}
@fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f{
 let at=vec2i(p.xy);let axis=vec2i(params.axis.xy);let radius=i32(params.axis.z);
 var result=0.0;
 if(params.axis.w>0.5){result=max(alpha(at-axis*radius),alpha(at+axis*radius));}
 else{for(var i=-radius;i<=radius;i++){result=max(result,alpha(at+axis*i));}}
 return vec4f(0,0,0,result);
}`;
