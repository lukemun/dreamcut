import {clampMaskFeather,type MaskInsetProps} from '../timeline/media-transform';

/** Pixel-space vertical alpha ramp matching the shared CSS mask. Horizontal
 * insets remain hard clips; an untouched top/bottom edge stays fully opaque. */
export function gpuFeatherMask(mask:MaskInsetProps,amount:number,height:number):readonly [number,number,number,number]|undefined {
 if(!Number.isFinite(height)||height<=0)throw Error('Invalid feather-mask canvas');
 const feather=Math.min(clampMaskFeather(amount),Math.max(0,(1-mask.top-mask.bottom)/2));
 if(feather<=0||mask.top===0&&mask.bottom===0)return undefined;
 return [mask.top*height,(1-mask.bottom)*height,feather*height,(mask.top>0?1:0)+(mask.bottom>0?2:0)];
}


/** CSS line-gradient normal in output pixels; the opaque side has positive distance. */
export function gpuRotatedLineMask(mask:MaskInsetProps,amount:number,rotation:number,width:number,height:number):readonly[number,number,number,number]|undefined{
 if(![width,height].every(value=>Number.isFinite(value)&&value>0))throw Error('Invalid line-mask canvas');
 if(!Number.isFinite(rotation)||rotation===0||mask.left!==0||mask.right!==0||((mask.top>0)===(mask.bottom>0)))return undefined;
 const angle=Math.max(-180,Math.min(180,rotation))*Math.PI/180;
 const nx=-Math.sin(angle),ny=Math.cos(angle),side=mask.top>0?1:-1;
 const boundary=(mask.top>0?mask.top:1-mask.bottom)*height-height/2+nx*width/2+ny*height/2;
 const feather=Math.min(clampMaskFeather(amount),Math.max(0,(1-mask.top-mask.bottom)/2))*height;
 return [nx*side,ny*side,boundary*side,feather];
}
