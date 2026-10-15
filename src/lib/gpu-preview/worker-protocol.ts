import type {CompositionElement} from '../render/composition-adapters';
import type {GpuPreviewRuntime} from './runtime';
import type {GpuRasterTextLayer} from './scene';
import type {ProjectionRect} from '../timeline/source-projection';
import type {GpuTextFillRegion} from './text-bounds';
import type {ReplayStats} from './replay-segment-cache';
export type GpuWorkerConfig={elements:CompositionElement[];laneOrder:readonly string[];scope:string;deliveryWidth:number;deliveryHeight:number;width:number;height:number;fps:number;duration:number};
/** `replayHit`: drawn from the lossy replay segment cache rather than composited live. */
export type WorkerPicture={bitmap:ImageBitmap;timing:NonNullable<GpuPreviewRuntime['lastPresentation']>&{replayHit?:boolean};bytes:number;prefetch:GpuPreviewRuntime['lastPrefetch'];replay?:ReplayStats|null};
export type TextPicture={bitmap:ImageBitmap;bounds:ProjectionRect;anchor?:readonly[number,number];fillRegions?:readonly GpuTextFillRegion[];tickerWidth?:number};
export type GpuWorkerRequest=
 |({type:'init';id:number;scriptUrl:string;wasmUrl:string}&GpuWorkerConfig)
 |{type:'render';id:number;frame:number;generation:number;allowReplay:boolean}
 |{type:'cancel'}
 |{type:'update';elements:CompositionElement[];laneOrder:readonly string[];duration:number}
 |({type:'text-result';id:number}&({error:string;bitmap?:never}|TextPicture))
 |({type:'svg-result';id:number}&({error:string;bitmap?:never}|{bitmap:ImageBitmap}));
export type GpuWorkerReply=
 |{type:'boot'}
 |{type:'ready';id:number}
 |({type:'picture';id:number}&WorkerPicture)
 |{type:'error';id:number;error:string}
 |{type:'fatal';error:string}
 |{type:'text';id:number;layer:GpuRasterTextLayer}
 /** Vector stills need a document to rasterize; the page draws them for the worker. */
 |{type:'svg';id:number;url:string;width:number;height:number};
