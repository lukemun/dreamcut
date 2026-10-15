/** Keep each Gaussian pass bounded. Large radii use a reduced isolated surface;
 * the scene remains in composition coordinates and outer masks apply afterwards. */
export function gaussianBlurPlan(width:number,height:number,x:number,y:number){
  if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||![x,y].every(v=>Number.isFinite(v)&&v>=0))throw Error('Invalid GPU blur geometry');
  const padX=Math.ceil(x*3),padY=Math.ceil(y*3);
  const extentWidth=width+2*padX,extentHeight=height+2*padY;
  if(![extentWidth,extentHeight].every(Number.isSafeInteger))throw Error('GPU blur extent exceeds safe geometry');
  const targetWidth=Math.max(1,Math.floor(extentWidth*Math.min(1,4/Math.max(x,4))));
  const targetHeight=Math.max(1,Math.floor(extentHeight*Math.min(1,4/Math.max(y,4))));
  const reductions:Array<{width:number;height:number}>=[];
  let w=extentWidth,h=extentHeight;
  while(w!==targetWidth||h!==targetHeight){
    w=Math.max(targetWidth,Math.ceil(w/2));h=Math.max(targetHeight,Math.ceil(h/2));
    reductions.push({width:w,height:h});
  }
  return {reductions,padX,padY,extentWidth,extentHeight,width:targetWidth,height:targetHeight,
    sigmaX:x*targetWidth/extentWidth,sigmaY:y*targetHeight/extentHeight,
    innerScaleX:width/extentWidth,innerScaleY:height/extentHeight};
}

/** Packed vec4 coefficients avoid backend-dependent uniform array alignment. */
export function gaussianBlurUniforms(sigma:number,vertical:boolean){
  if(!Number.isFinite(sigma)||sigma<0||sigma>41)throw Error('Invalid GPU pass sigma');
  const radius=Math.ceil(sigma*3),weights=Array(132).fill(0) as number[];
  if(radius===0)weights[0]=1;
  else{
    let sum=0;
    for(let i=0;i<=radius;i++){weights[i]=Math.exp(-.5*(i/sigma)**2);sum+=weights[i]*(i?2:1);}
    for(let i=0;i<=radius;i++)weights[i]/=sum;
  }
  return new Float32Array([vertical?0:1,vertical?1:0,radius,0,...weights]);
}

export const GAUSSIAN_BLUR_SHADER=/* wgsl */`
struct Params { axis:vec4f, weights:array<vec4f,33> }
@group(0) @binding(0) var<uniform> params:Params;
@group(0) @binding(1) var picture:texture_2d<f32>;
@vertex fn vs(@builtin(vertex_index) i:u32)->@builtin(position) vec4f{
  let p=array<vec2f,3>(vec2f(-1,-1),vec2f(3,-1),vec2f(-1,3));
  return vec4f(p[i],0,1);
}
fn pixel(p:vec2i)->vec4f{
  if(any(p<vec2i(0))||any(p>=vec2i(textureDimensions(picture)))){return vec4f(0);}
  return textureLoad(picture,p,0);
}
@fragment fn fs(@builtin(position) p:vec4f)->@location(0) vec4f{
  let base=vec2i(p.xy);let axis=vec2i(params.axis.xy);
  var color=pixel(base)*params.weights[0].x;
  for(var i=1u;i<=u32(params.axis.z);i++){
    color+=(pixel(base+axis*i32(i))+pixel(base-axis*i32(i)))*params.weights[i/4u][i%4u];
  }
  return color;
}`;
