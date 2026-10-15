/** Reduce only the alpha dependency for wide halos. Source color stays full
 * detail; padded input already includes the halo's transparent support. */
export type GlowMaskPlan={width:number;height:number;reductions:Array<{width:number;height:number;drawWidth?:number;drawHeight?:number}>;sigmaX:number;sigmaY:number;passes:number;uvScaleX?:number;uvScaleY?:number};
export function glowMaskPlan(width:number,height:number,sigma:number):GlowMaskPlan{
 if(![width,height].every(v=>Number.isSafeInteger(v)&&v>0)||!Number.isFinite(sigma)||sigma<0)throw Error('Invalid GPU glow geometry');
 const scale=Math.min(1,4/Math.max(4,sigma));
 if(scale<1){
  // Keep the intended fractional rectangle centered in an outward-rounded
  // texture, then undo its padding when sampling the final halo.
  // See FilterResult::rescale's centered floating bounds in SkImageFilterTypes.cpp:
  // https://skia.googlesource.com/skia/+/main/src/core/SkImageFilterTypes.cpp
  const reductions:Array<{width:number;height:number;drawWidth:number;drawHeight:number}>=[];
  let fw=width,fh=height,pw=width,ph=height;
  const targetW=width*scale,targetH=height*scale;
  while(fw>targetW||fh>targetH){
   const nw=Math.max(targetW,fw/2),nh=Math.max(targetH,fh/2);
   const w=2*Math.ceil(nw/2),h=2*Math.ceil(nh/2);
   reductions.push({width:w,height:h,drawWidth:pw*nw/fw,drawHeight:ph*nh/fh});
   fw=nw;fh=nh;pw=w;ph=h;
  }
  return {width:pw,height:ph,reductions,sigmaX:sigma*scale,sigmaY:sigma*scale,passes:reductions.length+2,uvScaleX:fw/pw,uvScaleY:fh/ph};
 }
 return {width,height,reductions:[],sigmaX:sigma,sigmaY:sigma,passes:2};
}
