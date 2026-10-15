import type {CanvasKit} from 'canvaskit-wasm';
import type {GpuVideoDraw} from './compositor';
/** Validate and select the final actor blend, after all local raster/filter work. */
export function canvasKitBlendMode(k:CanvasKit,blend:GpuVideoDraw['blend']){
 switch(blend){case undefined:case 'normal':return k.BlendMode.SrcOver;case 'difference':return k.BlendMode.Difference;case 'exclusion':return k.BlendMode.Exclusion;case 'multiply':return k.BlendMode.Multiply;default:throw Error('Invalid CanvasKit blend');}
}
