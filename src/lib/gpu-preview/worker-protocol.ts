import type {CompositionElement} from '../render/composition-adapters';
import type {GpuPreviewRuntime} from './runtime';
import type {GpuRasterTextLayer} from './scene';
import type {ProjectionRect} from '../timeline/source-projection';
import type {GpuTextFillRegion} from './text-bounds';
import type {ReplayStats} from './replay-segment-cache';
/** `pixelScale` below 1 composites a preview with fewer pixels than its logical size (software drawing). */
export type GpuWorkerConfig={elements:CompositionElement[];laneOrder:readonly string[];scope:string;deliveryWidth:number;deliveryHeight:number;width:number;height:number;fps:number;duration:number;pixelScale?:number};
/** `replayHit`: drawn from the lossy replay segment cache rather than composited live. */
export type WorkerPicture={bitmap:ImageBitmap;timing:NonNullable<GpuPreviewRuntime['lastPresentation']>&{replayHit?:boolean};bytes:number;prefetch:GpuPreviewRuntime['lastPrefetch'];replay?:ReplayStats|null};
export type TextPicture={bitmap:ImageBitmap;bounds:ProjectionRect;anchor?:readonly[number,number];fillRegions?:readonly GpuTextFillRegion[];tickerWidth?:number};
export type GpuWorkerRequest=
 |({type:'init';id:number;scriptUrl:string;wasmUrl:string}&GpuWorkerConfig)
 /** `allowReplay`: may come from the replay cache (playback and the pictures prepared ahead of a paused frame, never the paused frame itself).
  * `record`: a picture in playing order, which the replay cache keeps; speculative pictures and paused frames are not recorded. */
 |{type:'render';id:number;frame:number;generation:number;allowReplay:boolean;record?:boolean}
 /** A finished picture made out of order, handed to the replay recording when playback order reaches it. */
 |{type:'record';frame:number;bitmap:ImageBitmap}
 |{type:'cancel'}
 |{type:'update';elements:CompositionElement[];laneOrder:readonly string[];duration:number}
 /** The displayed size changed: later pictures are delivered at this size. */
 |{type:'resize';deliveryWidth:number;deliveryHeight:number}
 |({type:'text-result';id:number}&({error:string;bitmap?:never}|TextPicture))
 |({type:'svg-result';id:number}&({error:string;bitmap?:never}|{bitmap:ImageBitmap}));
/** The worker's own stack crosses with its message so error reports show where it failed. */
export type GpuWorkerFailure={error:string;name?:string;stack?:string};
export function workerFailure(error:unknown):GpuWorkerFailure{
 return error instanceof Error?{error:error.message,name:error.name,stack:error.stack}:{error:String(error)};
}
export function workerError(failure:GpuWorkerFailure){
 const error=Error(failure.error);if(failure.name)error.name=failure.name;if(failure.stack)error.stack=failure.stack;return error;
}
export type GpuWorkerReply=
 |{type:'boot'}
 |{type:'ready';id:number}
 |({type:'picture';id:number}&WorkerPicture)
 |({type:'error';id:number}&GpuWorkerFailure)
 |({type:'fatal'}&GpuWorkerFailure)
 |{type:'text';id:number;layer:GpuRasterTextLayer}
 /** Vector stills need a document to rasterize; the page draws them for the worker. */
 |{type:'svg';id:number;url:string;width:number;height:number};
