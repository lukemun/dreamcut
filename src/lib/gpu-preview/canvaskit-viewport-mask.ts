import type {Canvas,CanvasKit,Image} from 'canvaskit-wasm';
/** CSS mask-size:100% 100%; called after restoring all actor transforms. */
export function applyCanvasKitViewportMask(kit:CanvasKit,canvas:Canvas,image:Image,width:number,height:number){
 const shader=image.makeShaderOptions(kit.TileMode.Decal,kit.TileMode.Decal,kit.FilterMode.Linear,kit.MipmapMode.None,[width/image.width(),0,0,0,height/image.height(),0,0,0,1]);
 const paint=new kit.Paint();
 try{paint.setShader(shader);paint.setBlendMode(kit.BlendMode.DstIn);canvas.drawPaint(paint);}finally{paint.delete();shader.delete();}
}

/** Own the complete outer mask scope in one place so actor drawing cannot mask
 * earlier scene layers or leak a save/restore across repeated presentations. */
export function withCanvasKitViewportMask(kit:CanvasKit,canvas:Canvas,image:Image,width:number,height:number,blend:import('canvaskit-wasm').BlendMode,draw:()=>void){
 const initial=canvas.getSaveCount(),paint=new kit.Paint();
 try{paint.setBlendMode(blend);canvas.saveLayer(paint);draw();if(canvas.getSaveCount()!==initial+1)throw Error('Caption mask actor left an unbalanced canvas stack');applyCanvasKitViewportMask(kit,canvas,image,width,height);}
 finally{canvas.restoreToCount(initial);paint.delete();}
}
