import {resolveMediaShadow} from '../timeline/media-shadow';
import {resolveSourceOrientation} from '../timeline/resolved-media-scene';

/** Composition-space drop shadow for one CanvasKit actor. */
export type GpuMediaShadow={dx:number;dy:number;sigma:number;opacity:number};

/**
 * Standard draws `drop-shadow(x y blur)` on the contained picture, inside the source
 * orientation/mirror wrapper and the media-scale wrapper. CanvasKit applies the
 * shadow at the actor level in composition pixels, so carry the offset through the
 * same mirror -> rotate -> scale chain. The CSS `drop-shadow()` blur length is the
 * Gaussian standard deviation itself (Filter Effects: feGaussianBlur stdDeviation =
 * radius; unlike box-shadow's radius/2), scaled with the picture. Measured against
 * Chrome's Standard output, sigma = blur matches and blur/2 does not.
 */
export function gpuMediaShadow(props:Record<string,unknown>|null|undefined,mediaScale:number):GpuMediaShadow|undefined{
 const shadow=resolveMediaShadow(props);
 if(!shadow||shadow.opacity<=0)return undefined;
 if(!Number.isFinite(mediaScale)||mediaScale<=0)throw Error('Invalid GPU media shadow scale');
 const orientation=resolveSourceOrientation(props);
 // Source orientation is a quarter turn; keep its rotation exact.
 const radians=orientation.degrees*Math.PI/180,c=Math.round(Math.cos(radians)),s=Math.round(Math.sin(radians));
 const x=shadow.offsetX*orientation.mirrorX,y=shadow.offsetY;
 return {dx:mediaScale*(c*x-s*y)+0,dy:mediaScale*(s*x+c*y)+0,sigma:mediaScale*shadow.blur,opacity:shadow.opacity};
}

/** Transparent support a padded intermediate needs around the picture. */
export function gpuMediaShadowPad(shadow:GpuMediaShadow|undefined){
 return shadow?Math.ceil(Math.max(Math.abs(shadow.dx),Math.abs(shadow.dy))+3*shadow.sigma):0;
}
