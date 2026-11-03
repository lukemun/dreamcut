import type {Canvas,CanvasKit,Image,Paint,Surface} from 'canvaskit-wasm';

/** Supersampled export: the scene stays in logical composition coordinates while
 * every surface holds `scale` device pixels per logical pixel. Scale 1 is the
 * unchanged preview/1080p path and allocates and draws exactly as before. A preview
 * drawn in software uses 0.5 (softwarePreviewPixelScale); export never goes below 1. */
export function validCanvasKitPixelScale(scale:number){
 if(!Number.isFinite(scale)||scale<0.5||scale>2)throw Error('CanvasKit pixel scale must be between 0.5 and 2');
 return scale;
}

/** A transparent intermediate in logical units: its canvas is pre-scaled. */
export function makeCanvasKitScaledSurface(kit:CanvasKit,parent:Surface,width:number,height:number,scale:number){
 // Intermediates match their parent: 8-bit for preview and SDR export, half-float for HDR export.
 const surface=parent.makeSurface({width:Math.ceil(width*scale),height:Math.ceil(height*scale),colorType:parent.imageInfo?.().colorType??kit.ColorType.RGBA_8888,alphaType:kit.AlphaType.Premul,colorSpace:kit.ColorSpace.SRGB});
 if(surface&&scale!==1)surface.getCanvas().scale(scale,scale);
 return surface;
}

/** Draw an intermediate snapshot back at its logical size and position. CanvasKit's
 * drawImage samples nearest; keep that so device pixels map 1:1 as at scale 1. */
export function drawCanvasKitScaledImage(kit:CanvasKit,canvas:Canvas,image:Image,x:number,y:number,scale:number,paint?:Paint|null){
 if(scale===1){canvas.drawImage(image,x,y,paint??null);return;}
 canvas.drawImageRectOptions(image,kit.LTRBRect(0,0,image.width(),image.height()),kit.LTRBRect(x,y,x+image.width()/scale,y+image.height()/scale),kit.FilterMode.Nearest,kit.MipmapMode.None,paint??null);
}

/** The source rectangle covering a logical region of a scaled snapshot. */
export function canvasKitScaledSourceRect(kit:CanvasKit,width:number,height:number,scale:number){
 return kit.LTRBRect(0,0,width*scale,height*scale);
}
