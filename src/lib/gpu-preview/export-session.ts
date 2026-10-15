import {GpuTextCache} from './text-cache';
import type {CompositionElement} from '../render/composition-adapters';
import {admitGpuScene} from './scene';
import {GpuPreviewRuntime} from './runtime';
import {CanvasKitCompositor,CANVASKIT_EXPORT_BUDGET_BYTES} from './canvaskit-compositor';
import {loadCanvasKit} from './canvaskit-loader';
import {ensureRequiredRemotionFonts} from '../remotion/google-fonts';
import {resolveCaptionProps,captionRemotionFontFamily} from '../timeline/captions';

/** Exact-frame adapter over the same CanvasKit runtime as interactive preview.
 * No fallback, transport clock, speculative playback or preview-source authority. */
/** pixelScale > 1 supersamples a 2K/4K export: the scene keeps its logical size while
 * the canvas, intermediates and text rasters hold pixelScale pixels per logical pixel. */
export async function createGpuExportSession(canvas:HTMLCanvasElement,config:{width:number;height:number;pixelScale?:number;fps:number;durationInFrames:number;inputProps:{elements:CompositionElement[];laneOrderKeys?:string[]}}){
 const scale=config.pixelScale??1,area=scale*scale;
 const scope=crypto.randomUUID(),admission=admitGpuScene(config.inputProps.elements,scope,'canvaskit',true);
 if(!admission.supported)throw Error(`GPU export unavailable: ${admission.reason}`);
 if(!navigator.gpu)throw Error('GPU export requires WebGPU availability');
 const adapter=await navigator.gpu.requestAdapter();if(!adapter)throw Error('GPU export could not acquire an adapter');
 const device=await adapter.requestDevice();let runtime:GpuPreviewRuntime|undefined,compositor:CanvasKitCompositor|undefined;
 let failure:Error|undefined,closed=false;
 const fail=(error:unknown)=>{failure=error instanceof Error?error:Error(String(error));};
 device.addEventListener('uncapturederror',event=>fail(event.error));
 void device.lost.then(info=>{if(!closed)fail(Error(`GPU export device lost: ${info.message}`));});
 try{
  const fonts=[...new Set(config.inputProps.elements.filter(e=>e.type==='caption_text').map(e=>captionRemotionFontFamily(resolveCaptionProps(e.props).fontPreset).split(',')[0]!.trim().replace(/^['"]|['"]$/g,'')))];
  await ensureRequiredRemotionFonts(fonts);
  canvas.width=config.width*scale;canvas.height=config.height*scale;
  // Export uses original-resolution sources rather than preview proxies. A
  // 12 MP source plus its upload and output surfaces can exceed the 128 MiB
  // interactive budget even for 1080p output. Keep a separate bounded allowance;
  // the compositor still checks each actor and releases its transient uploads.
  compositor=new CanvasKitCompositor(await loadCanvasKit(),canvas,Math.ceil(CANVASKIT_EXPORT_BUDGET_BYTES*area),fail,scale);
  runtime=new GpuPreviewRuntime(device,null,navigator.gpu.getPreferredCanvasFormat(),admission.elements,config.inputProps.laneOrderKeys??[],scope,config.width,config.height,config.fps,compositor,true,new GpuTextCache('session-fonts-v1',Math.ceil(32*1024*1024*area),scale),scale);
  return {
   /** The last frame's preparation timing (resources, drawing), for export diagnostics. */
   get lastPresentation(){return runtime!.lastPresentation;},
   async frame(frame:number){
    if(closed)throw Error('GPU export session closed');
    if(!Number.isInteger(frame)||frame<0||frame>=config.durationInFrames)throw Error('Invalid GPU export frame');
    if(failure)throw failure;
    if(!await runtime!.present(frame,'export'))throw Error('GPU export frame was superseded');
    await device.queue.onSubmittedWorkDone();
    if(failure)throw failure;
    if(runtime!.lastPresentation?.frame!==frame)throw Error('GPU export did not present the requested frame');
   },
   close(){if(closed)return;closed=true;try{runtime?.close();}finally{device.destroy();}},
  };
 }catch(error){closed=true;try{if(runtime)runtime.close();else compositor?.close();}finally{device.destroy();}throw error;}
}
