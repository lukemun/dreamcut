/** Owned Chromium/FFmpeg renderer. Browser composition and preview share one clock. */
import fs from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { chromium } from "playwright-core";
import type { AudioSample } from "../frame-runtime";
import { exportAudioMix, runMediaProcess } from "./audio-export";
import { readEnv } from "../env-name";
import { MAX_EXPORT_WORKERS, MAX_GPU_PICTURE_SEGMENTS } from "./export-parallelism";
import { EXPORT_CHUNK_FRAMES, ExportChunkStore, exportChunks, type ExportChunk } from "./export-chunks";
import { canvasEncoderCodec } from "./canvas-encoder";

/** In-page encode bitrate: 0.16 bits per pixel per frame (about 10 Mbps at 1080×1920, 30 fps; YouTube suggests 8–12 for 1080p). */
export function canvasEncodeBitrate(width:number,height:number,fps:number){return Math.round(width*height*fps*.16);}

/** Share chunk indexes out as contiguous runs, one per page, as even as whole chunks allow. */
export function distributeChunks(indexes:readonly number[],pages:number):number[][]{
  const parts=Math.max(0,Math.min(pages,indexes.length));
  return Array.from({length:parts},(_,part)=>indexes.slice(Math.floor(indexes.length*part/parts),Math.floor(indexes.length*(part+1)/parts)));
}
/** The same colour description the screenshot path writes: BT.709 primaries and matrix, sRGB transfer, limited range. */
const CANVAS_COLOR_TAGS="h264_metadata=colour_primaries=1:transfer_characteristics=13:matrix_coefficients=1:video_full_range_flag=0";
const sampleRate = 48000;
export async function isolateDevelopmentUpdates(page: import("playwright-core").Page) {
  let frozen = false;
  await page.routeWebSocket(/.*/, socket => {
    const server = socket.connectToServer();
    server.onMessage(message => { if (!frozen) socket.send(message); });
  });
  // Closing the HMR socket makes the dev client reconnect and reload the page,
  // destroying the loaded composition during a long capture. Keep the transport
  // alive until page teardown; freeze only server updates, including reconnects.
  return () => { frozen = true; };
}
/** The desktop service rejects pages without its session cookie, including the headless
 * renderer's /render-frame. The browser editor (pnpm dev) has no token and needs none. */
export function desktopRenderSessionCookie(env:Record<string,string|undefined>=process.env){
  return env.DREAMCUT_SERVICE_TOKEN ? { name: "dreamcut_desktop_session", value: env.DREAMCUT_SERVICE_TOKEN } : undefined;
}
/** What an export is doing, for its progress label. */
export type ExportStage="starting"|"rendering"|"encoding"|"mixing-audio"|"saving";
export type BrowserVideoOptions = {
  gpu?: boolean;
  baseUrl: string; outputLocation: string; width: number; height: number; fps: number; durationInFrames: number;
  inputProps: Record<string, any>; fixtureId?: string; nativeProjectId?: string; imageFormat?: "png" | "jpeg"; jpegQuality?: number;
  /** Defaults to the desktop service session when running inside the app. */
  sessionCookie?: { name: string; value: string };
  session?: VideoRenderSession; pictureOnly?: boolean; audioOnly?: boolean; pcmOutputLocation?: string; pixelScale?: number; outputSize?: { width: number; height: number }; concurrency?: number; frameRange?: [number,number]; crf?: number; signal?: AbortSignal;
  /** GPU export: reuse unchanged chunks from this project's chunk cache (export-chunks.ts). */ chunkCacheDir?: string; exportChunks?: ExportChunk[]; /** Overall 0–1 progress and the stage it belongs to. */
  onProgress?: (progress:number,stage:ExportStage)=>void; onComplete?: ()=>void;
};
const RENDER_PAGE_TIMEOUT_MS=120_000;
/** Exclusive capture session. Reuses a settled composition only for identical inputs. */
export class VideoRenderSession {
  private browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  /** GPU export: every page after the first gets its own browser, so each has its own GPU process. */
  private extraBrowsers: Array<Awaited<ReturnType<typeof chromium.launch>>> = [];
  private pages: import("playwright-core").Page[] = [];
  private identity = '';
  private errors: string[] = [];
  busy = false;
  readonly metrics={launches:0,loads:0};
  async acquire(options: BrowserVideoOptions, workers: number, pixelScale: number) {
    if (this.busy) throw new Error('Video capture session is already in use');
    this.busy = true;
    const {width,height,fps,durationInFrames,inputProps}=options;
    // GPU draws into its own canvas, so it supersamples explicitly; Standard's DOM follows the device scale.
    const config={width,height,fps,durationInFrames,inputProps,fixtureId:options.fixtureId,nativeProjectId:options.nativeProjectId,gpu:options.gpu,...(options.audioOnly?{audioOnly:true}:{}),...(options.gpu&&pixelScale>1?{pixelScale}:{})};
    const identity=JSON.stringify({base:options.baseUrl,config,workers,pixelScale});
    const launch=()=>{this.metrics.launches++;return chromium.launch({channel:"chrome",headless:true,args:["--force-color-profile=srgb","--autoplay-policy=no-user-gesture-required","--disable-background-timer-throttling","--disable-renderer-backgrounding","--disable-backgrounding-occluded-windows"]});};
    if(!this.browser)this.browser=await launch();
    const separate=Boolean(options.gpu)&&readEnv("EXPORT_SHARED_BROWSER")!=="1";
    if(separate&&this.extraBrowsers.length<workers-1)this.extraBrowsers.push(...await Promise.all(Array.from({length:workers-1-this.extraBrowsers.length},launch)));
    if (identity !== this.identity) {
      await Promise.all(this.pages.map(page=>page.context().close()));this.pages=[];this.errors=[];
      // Workers load in parallel. A cold dev-server compile of /render-frame can take
      // well over Playwright's 30 s default; a rejected page fails at once, not by timeout.
      const browser=this.browser,baseUrl=options.baseUrl.replace(/\/$/,""),cookie=options.sessionCookie??desktopRenderSessionCookie();
      this.pages=await Promise.all(Array.from({length:workers},async(_,index)=>{
        const owner=separate&&index>0?this.extraBrowsers[index-1]!:browser;
        const page=await owner.newPage({viewport:{width,height},deviceScaleFactor:pixelScale});
        if(cookie)await page.context().addCookies([{...cookie,url:baseUrl,httpOnly:true,sameSite:"Strict"}]);
        const freeze=await isolateDevelopmentUpdates(page);
        page.on('pageerror',error=>this.errors.push(error.message));
        const response=await page.goto(`${baseUrl}/render-frame`,{waitUntil:'networkidle',timeout:RENDER_PAGE_TIMEOUT_MS});
        if(response&&!response.ok())throw new Error(`The export renderer could not open the editor page (HTTP ${response.status()}).`);
        await page.waitForFunction(()=>Boolean(window.__dreamcutRender),undefined,{timeout:RENDER_PAGE_TIMEOUT_MS});
        await page.evaluate(config=>window.__dreamcutRender!.load(config),config);freeze();
        return page;
      }));
      this.identity=identity;this.metrics.loads++;
    }
    return {pages:this.pages,errors:this.errors,browserVersion:this.browser.version()};
  }
  release() { this.busy=false; }
  async close() { const browser=this.browser,extra=this.extraBrowsers;this.browser=undefined;this.extraBrowsers=[];this.pages=[];this.identity='';this.errors=[];await Promise.all([browser?.close(),...extra.map(owner=>owner.close())]);this.busy=false; }
}
export type BrowserRenderDetails={outputWidth?:number;outputHeight?:number;engine:string;sourceDecoder:string;compositor:string;width:number;height:number;compositionWidth:number;compositionHeight:number;pixelScale:number;fps:number;durationInFrames:number;sourceFrameRange:[number,number];audioSources:number;audioRuns:number;browserVersion:string;concurrency:number;imageFormat:string;timings:Record<string,number>};
export async function renderBrowserVideo(options: BrowserVideoOptions):Promise<{sourceCount:number;runCount:number}|BrowserRenderDetails|void> {
  const {width,height,fps,durationInFrames,inputProps,signal}=options;
  if(options.pictureOnly && (options.audioOnly || options.pcmOutputLocation))throw Error("Picture-only capture cannot also emit audio");
  if(options.gpu&&(options.nativeProjectId||options.fixtureId||options.audioOnly))throw Error("GPU picture export cannot combine renderer backends");
  if(options.gpu&&options.imageFormat==="jpeg")throw Error("GPU export requires lossless intermediate frames");
  const began=performance.now(),timings:Record<string,number>={};
  const mark=(name:string)=>{timings[name]=Math.round(performance.now()-began);};
  const start=options.frameRange?.[0]??0,end=options.frameRange?.[1]??durationInFrames-1,count=end-start+1;
  if(![width,height,durationInFrames,start,end].every(Number.isInteger)||width<2||height<2||width%2||height%2||!(fps>0)||start<0||end>=durationInFrames||count<1) throw new Error("Invalid render dimensions or frame window");
  const pixelScale=options.pixelScale??1;
  if(options.outputSize&&(pixelScale!==1||![options.outputSize.width,options.outputSize.height].every(n=>Number.isInteger(n)&&n>=2&&n%2===0)))throw new Error("Invalid export output size");
  if(!(pixelScale>0 && pixelScale<=2) || ![width*pixelScale,height*pixelScale].every(n=>Number.isInteger(n)&&n>=2&&n%2===0))throw new Error("Invalid preview pixel scale");
  // GPU pictures share the decoding hardware; more pages than MAX_GPU_PICTURE_SEGMENTS only wait.
  const workers=Math.max(1,Math.min(options.gpu?MAX_GPU_PICTURE_SEGMENTS:MAX_EXPORT_WORKERS,Math.floor(options.concurrency??2)));
  if(!Number.isFinite(workers)) throw new Error("Invalid render concurrency");
  signal?.throwIfAborted();
  const capture=options.session??new VideoRenderSession();
  if(capture.busy)throw new Error("Video capture session is already in use");
  const temporary=fs.mkdtempSync(path.join(os.tmpdir(),"dreamcut-render-"));
  let succeeded=false;
  let encoder:ReturnType<typeof spawn>|undefined;
  const abort=()=>{encoder?.kill();void capture.close();};
  signal?.addEventListener("abort",abort,{once:true});
  // GPU pictures cannot evaluate authored audio, so a Standard audio-only pass runs in
  // its own browser. It runs alongside picture capture rather than after it.
  const gpuAudio=options.gpu&&!options.pictureOnly&&!options.audioOnly;
  let pictureShare=0,audioShare=gpuAudio?0:1;
  const report=(stage:ExportStage)=>options.onProgress?.(.85*(gpuAudio?pictureShare*.7+audioShare*.3:pictureShare),stage);
  let audioPass:Promise<{output:string;sourceCount:number;runCount:number}>|undefined;
  const audioAbort=new AbortController();
  try {
    options.onProgress?.(0,"starting");
    const store=options.chunkCacheDir?new ExportChunkStore(options.chunkCacheDir):null;
    const encodedSize=options.outputSize??{width:width*pixelScale,height:height*pixelScale};
    const bitrate=canvasEncodeBitrate(encodedSize.width,encodedSize.height,fps);
    // GPU export works in fixed chunks; their fingerprints decide what can be reused.
    const chunks=options.exportChunks??(options.gpu&&!options.audioOnly&&readEnv("EXPORT_CAPTURE")!=="screenshot"
      ? (store?exportChunks({width,height,fps,durationInFrames,inputProps:options.inputProps as never,rasterScale:pixelScale},[start,end],options.baseUrl,
          {...encodedSize,fps,bitrate,codec:canvasEncoderCodec(encodedSize.width,encodedSize.height,fps)})
        : Array.from({length:Math.ceil(count/EXPORT_CHUNK_FRAMES)},(_,index)=>({range:[start+index*EXPORT_CHUNK_FRAMES,Math.min(end,start+(index+1)*EXPORT_CHUNK_FRAMES-1)] as [number,number],pictureKey:null,audioKey:null})))
      : []);
    if(gpuAudio){
      const output=path.join(temporary,"gpu-audio.f32le");
      // Captions and stills make no sound; leaving them out spares each audio frame most of its rendering.
      const audible={...options.inputProps,elements:(options.inputProps as {elements:Array<{type:string}>}).elements.filter(element=>element.type!=="caption_text"&&element.type!=="still")};
      audioPass=renderBrowserVideo({...options,inputProps:audible,gpu:false,outputLocation:output,audioOnly:true,pictureOnly:false,pcmOutputLocation:undefined,session:undefined,onComplete:undefined,exportChunks:chunks,
        signal:signal?AbortSignal.any([signal,audioAbort.signal]):audioAbort.signal,
        onProgress:(progress,stage)=>{if(stage==="starting")return;audioShare=progress;report(pictureShare<1?"rendering":"mixing-audio");}})
        .then(result=>{if(!result||!("runCount" in result)||"engine" in result)throw Error("GPU audio evaluation did not return a manifest");audioShare=1;return {output,sourceCount:result.sourceCount,runCount:result.runCount};});
      void audioPass.catch(()=>{});
    }
    const pictureFile=(chunk:ExportChunk,index:number)=>store&&chunk.pictureKey?store.file(chunk.pictureKey,"h264"):path.join(temporary,`chunk-${String(index).padStart(5,"0")}.h264`);
    const toRender=options.audioOnly?[]:chunks.map((_,index)=>index).filter(index=>!(store&&chunks[index]!.pictureKey&&store.valid(pictureFile(chunks[index]!,index))));
    const soundFile=(chunk:ExportChunk)=>store&&chunk.audioKey?store.file(chunk.audioKey,"sound.json"):null;
    const savedSound=new Map<number,AudioSample[][]>();
    if(options.audioOnly&&store)chunks.forEach((chunk,index)=>{
      const file=soundFile(chunk);
      if(file&&store.valid(file)){try{const samples=JSON.parse(fs.readFileSync(file,"utf8"));if(Array.isArray(samples)&&samples.length===chunk.range[1]-chunk.range[0]+1)savedSound.set(index,samples);}catch{/* Unreadable: evaluate again. */}}
    });
    // Everything already cached: no browser is needed for this pass.
    const nothingToDraw=chunks.length>0&&(options.audioOnly?savedSound.size===chunks.length:toRender.length===0);
    const {pages,errors,browserVersion}=nothingToDraw?{pages:[] as import("playwright-core").Page[],errors:[] as string[],browserVersion:"not launched"}:await capture.acquire(options,workers,pixelScale);
    signal?.throwIfAborted();
    mark("loadedMs");
    const video=path.join(temporary,"picture.mp4");
    // Screenshots contain sRGB values. Declare both the YUV matrix and transfer
    // on frames: encoder flags alone can be overwritten by PNG frame metadata.
    if (!options.audioOnly) encoder=spawn("ffmpeg",["-hide_banner","-loglevel","error","-y","-f","image2pipe","-framerate",String(fps),"-i","pipe:0","-an","-c:v","libx264","-preset","fast","-crf",String(options.crf??18),"-vf",`scale=${options.outputSize?`${options.outputSize.width}:${options.outputSize.height}:flags=lanczos:`:""}out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=iec61966-2-1:colorspace=bt709`,"-pix_fmt","yuv420p",video],{stdio:["pipe","ignore","pipe"]});
    let encoderError="";let pipeError:Error|null=null;
    encoder?.stderr!.on("data",chunk=>{encoderError=(encoderError+chunk).slice(-32000);});
    encoder?.stdin!.on("error",error=>{pipeError=error;});
    let finished=options.audioOnly ? Promise.resolve() : new Promise<void>((resolve,reject)=>{encoder!.on("error",reject);encoder!.on("close",code=>code===0?resolve():reject(new Error(`Video encoder failed: ${encoderError}`)));});
    void finished.catch(()=>{});
    const frames:AudioSample[][]=[];
    let drawMs=0,captureMs=0;
    // GPU export encodes in the page: the drawn canvas goes straight to the browser's
    // (hardware) H.264 encoder and only compressed video comes back, so no frame is
    // screenshotted. Frames are encoded in fixed chunks, each its own stream opening with a key
    // frame; chunks still valid in the cache are reused, and the rest are shared out as
    // contiguous runs, one per page, each page in order. All chunks then join end to end.
    // A browser that cannot encode keeps the screenshot path below.
    // DREAMCUT_EXPORT_CAPTURE=screenshot forces it.
    const encodeConfig=(firstFrame:number)=>({fps,firstFrame,bitrate,keyFrameSeconds:2,
      ...(options.outputSize?{outputWidth:options.outputSize.width,outputHeight:options.outputSize.height}:{})});
    // Pictures only: an audio pass receives the same chunks to reuse saved sound, never to draw.
    const canvasEncode=!options.audioOnly&&chunks.length>0&&(toRender.length===0||await pages[0]!.evaluate(config=>window.__dreamcutRender!.startEncode(config),encodeConfig(start))
      .then(()=>true,error=>{console.warn("[browser render] in-page encoding unavailable; using screenshots:",error instanceof Error?error.message:error);return false;}));
    if(canvasEncode){
      encoder?.kill();encoder=undefined;finished=Promise.resolve();
      const groups=distributeChunks(toRender,pages.length);
      const done=new Array<number>(groups.length).fill(0),renderFrames=toRender.reduce((sum,index)=>sum+chunks[index]!.range[1]-chunks[index]!.range[0]+1,0);
      const progress=()=>{pictureShare=renderFrames?done.reduce((sum,value)=>sum+value,0)/renderFrames:1;report("rendering");};
      let logged=0;
      await Promise.all(groups.map(async(group,pageIndex)=>{
        const page=pages[pageIndex]!;
        for(const index of group){
          const chunk=chunks[index]!,[first,last]=chunk.range,file=pictureFile(chunk,index),pending=`${file}.${process.pid}.pending`;
          const out=fs.createWriteStream(pending);
          const write=async(encoded:string)=>{if(encoded&&!out.write(Buffer.from(encoded,"base64")))await once(out,"drain");};
          try{
            await page.evaluate(config=>window.__dreamcutRender!.startEncode(config),encodeConfig(first));
            // Runs of half a second: one round trip each, progress stays live, cancellation stays prompt.
            const run=Math.max(1,Math.round(fps/2));
            for(let frame=first;frame<=last;frame+=run){
              signal?.throwIfAborted();
              const through=Math.min(last,frame+run-1),drawStarted=performance.now();
              await write(await page.evaluate(([from,to])=>window.__dreamcutRender!.encodeFrames(from,to),[frame,through] as [number,number]));
              if(errors.length)throw new Error(errors.join("\n"));
              drawMs+=performance.now()-drawStarted;
              done[pageIndex]!+=through-frame+1;progress();
              const total=done.reduce((sum,value)=>sum+value,0);
              if(total-logged>=fps*groups.length){logged=total;console.log(`[browser render] ${total}/${renderFrames} frames to draw (in-page encode, ${groups.length} pages, ${chunks.length-toRender.length}/${chunks.length} chunks reused)`);}
            }
            await write(await page.evaluate(()=>window.__dreamcutRender!.finishEncode()));
          }finally{out.end();await once(out,"close");}
          if(store&&chunk.pictureKey)store.commit(pending,file);else fs.renameSync(pending,file);
        }
      }));
      for(let frame=start;frame<=end;frame+=1)frames.push([]);
      // Each chunk opens with its own parameter sets and key frame, so the streams join end to end.
      // -r on the input: the browser's stream carries its own timing, which ffmpeg would otherwise trust.
      // Byte-level join: raw H.264 carries no timestamps for a demuxer to reconcile.
      await runMediaProcess("ffmpeg",["-hide_banner","-loglevel","error","-y","-f","h264","-r",String(fps),"-i",`concat:${chunks.map(pictureFile).join("|")}`,"-an","-c:v","copy","-bsf:v",CANVAS_COLOR_TAGS,video],signal);
      timings.pages=groups.length;timings.chunks=chunks.length;timings.chunksReused=chunks.length-toRender.length;
    }
    // Which frames this pass evaluates: none after an in-page picture encode; for an audio pass
    // with chunk fingerprints, only the chunks whose saved sound is missing; otherwise all.
    const todo:number[]=[];
    if(!canvasEncode){
      if(options.audioOnly&&chunks.length)chunks.forEach((chunk,index)=>{if(!savedSound.has(index))for(let frame=chunk.range[0];frame<=chunk.range[1];frame+=1)todo.push(frame);});
      else for(let frame=start;frame<=end;frame+=1)todo.push(frame);
    }
    const evaluated=new Map<number,AudioSample[]>();
    for(let at=0;at<todo.length;at+=workers){
      signal?.throwIfAborted();
      const batch=todo.slice(at,at+workers);
      const captures=await Promise.all(batch.map(async(frameNumber,index)=>{
        const page=pages[index]!;
        const drawStarted=performance.now();
        const samples=await page.evaluate(frame=>window.__dreamcutRender!.frame(frame),frameNumber);
        if(errors.length) throw new Error(errors.join("\n"));
        const type=options.imageFormat??"png";
        const captureStarted=performance.now();
        const picture=options.audioOnly ? null : await page.screenshot({clip:{x:0,y:0,width,height},type,animations:"allow",...(type==="jpeg"?{quality:options.jpegQuality??95}:{})});
        // Summed across workers: where per-frame time goes (drawing in the page vs taking its picture).
        drawMs+=captureStarted-drawStarted;captureMs+=performance.now()-captureStarted;
        return {frameNumber,samples,picture};
      }));
      for(const capture of captures){
        if(pipeError) throw pipeError;
        evaluated.set(capture.frameNumber,capture.samples);
        if(capture.picture && !encoder!.stdin!.write(capture.picture)) await Promise.race([once(encoder!.stdin!,"drain"),finished.then(()=>{throw new Error("Encoder exited before all frames were written");})]);
      }
      pictureShare=Math.min(1,(at+batch.length)/todo.length);
      if(options.audioOnly)options.onProgress?.(pictureShare,"rendering");else report("rendering");
      if(at%(Math.ceil(fps/workers)*workers)===0) console.log(`[browser render] ${at+batch.length}/${todo.length} frames`);
    }
    if(!canvasEncode){
      if(options.audioOnly&&chunks.length){
        chunks.forEach((chunk,index)=>{
          const saved=savedSound.get(index);
          const samples=saved??Array.from({length:chunk.range[1]-chunk.range[0]+1},(_,offset)=>evaluated.get(chunk.range[0]+offset)!);
          const file=soundFile(chunk);
          if(!saved&&store&&file){const pending=`${file}.${process.pid}.pending`;fs.writeFileSync(pending,JSON.stringify(samples));store.commit(pending,file);}
          frames.push(...samples);
        });
        timings.soundChunksReused=savedSound.size;
      }else for(let frame=start;frame<=end;frame+=1)frames.push(evaluated.get(frame)!);
    }
    mark("capturedMs");timings.frameDrawMs=Math.round(drawMs);timings.frameCaptureMs=Math.round(captureMs);timings.inPageEncode=canvasEncode?1:0;
    if(!options.audioOnly)options.onProgress?.(.86,"encoding");
    encoder?.stdin!.end();await finished;mark("encodedMs");
    signal?.throwIfAborted();
    let audio:{output:string;sourceCount:number;runCount:number};
    if(options.pictureOnly)audio={output:"",sourceCount:0,runCount:0};
    else if(audioPass){
      // The existing authored audio evaluation, unchanged: PCM only; its Standard
      // pictures never enter output.
      if(audioShare<1)report("mixing-audio");
      audio=await audioPass;
    }else{
      if(!options.audioOnly)options.onProgress?.(.9,"mixing-audio");
      audio=await exportAudioMix(frames,fps,temporary,signal);
    }
    mark("audioMs");
    if (options.audioOnly) {
      fs.copyFileSync(audio.output,options.outputLocation);
      options.onProgress?.(1,"rendering");options.onComplete?.();succeeded=true;return {sourceCount:audio.sourceCount,runCount:audio.runCount};
    }
    if (options.pcmOutputLocation) fs.copyFileSync(audio.output, options.pcmOutputLocation);
    options.onProgress?.(.95,"saving");
    const muxed=path.join(temporary,"complete.mp4");
    if (options.pictureOnly || options.pcmOutputLocation) fs.copyFileSync(video, muxed);
    else await runMediaProcess("ffmpeg",["-v","error","-y","-i",video,"-f","f32le","-ar",String(sampleRate),"-ac","2","-i",audio.output,"-map","0:v","-map","1:a","-c:v","copy","-c:a","aac","-b:a","192k","-t",String(count/fps),"-movflags","+faststart",muxed],signal);
    signal?.throwIfAborted();
    fs.copyFileSync(muxed,`${options.outputLocation}.partial`);fs.renameSync(`${options.outputLocation}.partial`,options.outputLocation);
    // The cache keeps exactly what this export used: its picture chunks and the sound chunks its audio pass saved.
    if(store&&chunks.length&&!options.audioOnly&&!options.pictureOnly)store.retain(new Set(chunks.flatMap((chunk,index)=>[pictureFile(chunk,index),...(soundFile(chunk)?[soundFile(chunk)!]:[])])));
    // How the video was made is returned to the caller; nothing is written beside the export.
    const details:BrowserRenderDetails={...(options.outputSize?{outputWidth:options.outputSize.width,outputHeight:options.outputSize.height}:{}),engine:options.gpu?"dreamcut-canvaskit-chromium-ffmpeg":options.nativeProjectId?"dreamcut-rust-react-chromium-ffmpeg":"dreamcut-react-chromium-ffmpeg",sourceDecoder:options.nativeProjectId?"rust-ffmpeg":"browser",compositor:options.gpu?"canvaskit":"browser",width:width*pixelScale,height:height*pixelScale,compositionWidth:width,compositionHeight:height,pixelScale,fps,durationInFrames:count,sourceFrameRange:[start,end],audioSources:audio.sourceCount,audioRuns:audio.runCount,browserVersion,concurrency:workers,imageFormat:options.imageFormat??"png",timings};
    options.onProgress?.(1,"saving");
    options.onComplete?.();succeeded=true;return details;
  } finally {
    signal?.removeEventListener("abort",abort);encoder?.stdin?.destroy();encoder?.kill();
    const cleanupStart=performance.now();
    // The output is final before cleanup. Chrome can take many seconds to exit after
    // GPU pages sit idle, so a finished or failed export never waits for it.
    if(!options.session||!succeeded)void capture.close().catch(error=>console.error("[browser render] close failed",error));else capture.release();
    if(audioPass&&!succeeded)audioAbort.abort();
    console.log(`[browser render timing] ${JSON.stringify({...timings,totalMs:Math.round(performance.now()-began),closeMs:Math.round(performance.now()-cleanupStart)})}`);
    fs.rmSync(`${options.outputLocation}.partial`,{force:true});fs.rmSync(temporary,{recursive:true,force:true});
  }
}

export type BrowserStillOptions = {
  /** Local desktop authentication, scoped to this browser context only. */
  sessionCookie?: { name: string; value: string };
  baseUrl: string; output: string; width: number; height: number; durationInFrames: number; frame: number;
  inputProps: Record<string, any>; fixtureId?: string; nativeProjectId?: string; transparent?: boolean; fps?: number; imageFormat?: "png" | "jpeg"; jpegQuality?: number;
};

/** One bounded instrument run. Reuse settled pages, never evidence from another run.
 * A second page keeps caption-removal measurements isolated from the main picture.
 * Serial calls only: seeking while another capture is in flight would mix frames.
 */
export async function createBrowserStillSession() {
  const browser = await chromium.launch({ channel: "chrome", headless: true, args: ["--force-color-profile=srgb"] });
  type Entry = { page: import("playwright-core").Page; errors: string[]; resources: Map<string, string>; pending: Promise<void>[]; fingerprintFailed: boolean };
  const pages = new Map<string, Entry>();
  const stats = { browserLaunches: 1, pageLoads: 0, captures: 0, pageReuses: 0 };
  let closed = false;
  let busy = false;
  let closing: Promise<void> | undefined;
  const close = () => {
    closed = true;
    return closing ??= browser.close();
  };
  async function prepare(options: BrowserStillOptions): Promise<Entry> {
    const config = { width: options.width, height: options.height, durationInFrames: options.durationInFrames,
      fps: options.fps ?? 30, inputProps: options.inputProps, fixtureId: options.fixtureId, transparent: options.transparent ?? false };
    const baseUrl = options.baseUrl.replace(/\/$/, "");
    // Serialize values, not object identity: callers can revise props in place.
    const key = JSON.stringify({ baseUrl, config });
    let entry = pages.get(key);
    if (!entry) {
      if (pages.size === 2) {
        const oldest = pages.keys().next().value!;
        await pages.get(oldest)!.page.close();
        pages.delete(oldest);
      }
      const page = await browser.newPage({ viewport: { width: options.width, height: options.height }, deviceScaleFactor: 1 });
      // Same session as exports: a DreamCut-started editor refuses /render-frame without it.
      const cookie = options.sessionCookie ?? desktopRenderSessionCookie();
      if (cookie) await page.context().addCookies([{ ...cookie, url: baseUrl, httpOnly: true, sameSite: "Strict" }]);
      const errors: string[] = [];
      const tracked: Entry = { page, errors, resources: new Map(), pending: [], fingerprintFailed: false };
      page.on("response", response => {
        const kind = response.request().resourceType();
        // Hash the code and fonts actually loaded by this browser, including Google CSS fetches.
        if (!["script", "stylesheet", "font"].includes(kind) && !response.url().startsWith("https://fonts.googleapis.com/")) return;
        tracked.pending.push((async () => {
          try {
            if (!response.ok()) throw new Error("Resource fetch failed");
            tracked.resources.set(response.url(), createHash("sha256").update(await response.body()).digest("hex"));
          } catch { tracked.fingerprintFailed = true; }
        })());
      });
      page.on("pageerror", error => errors.push(error.message));
      const freeze = await isolateDevelopmentUpdates(page);
      await page.goto(`${baseUrl}/render-frame`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => Boolean(window.__dreamcutRender));
      await page.evaluate(value => window.__dreamcutRender!.load(value), config);
      freeze();
      if (options.transparent) await page.addStyleTag({ content: "html, body { background: transparent !important; }" });
      entry = tracked;
      pages.set(key, entry);
      stats.pageLoads++;
    } else {
      pages.delete(key);
      pages.set(key, entry);
      stats.pageReuses++;
    }
    return entry;
  }
  async function exclusive<T>(work: () => Promise<T>): Promise<T> {
    if (closed) throw new Error("Still render session is closed");
    if (busy) throw new Error("Still render session requires serial captures");
    busy = true;
    try { return await work(); }
    catch (error) { await close().catch(() => {}); throw error; }
    finally { busy = false; }
  }
  return {
    stats,
    close,
    async fingerprint(options: BrowserStillOptions): Promise<string | null> {
      return exclusive(async () => {
        const entry = await prepare(options);
        await Promise.all(entry.pending);
        if (entry.errors.length) throw new Error(entry.errors.join("\n"));
        if (entry.fingerprintFailed || entry.resources.size === 0) return null;
        return createHash("sha256").update(JSON.stringify({ browser: browser.version(), platform: process.platform,
          resources: [...entry.resources].sort(([a], [b]) => a.localeCompare(b)) })).digest("hex");
      });
    },
    async render(options: BrowserStillOptions) {
      return exclusive(async () => {
        const entry = await prepare(options);
        await entry.page.evaluate(frame => window.__dreamcutRender!.frame(frame), options.frame);
        if (entry.errors.length) throw new Error(entry.errors.join("\n"));
        await entry.page.locator("#dreamcut-render-surface").screenshot({ path: options.output, type: options.imageFormat ?? "png", omitBackground: options.transparent,
          ...(options.imageFormat === "jpeg" ? { quality: options.jpegQuality ?? 90 } : {}) });
        if (entry.errors.length) throw new Error(entry.errors.join("\n"));
        stats.captures++;
      });
    },
  };
}

/** Fresh-session compatibility path and correctness oracle for batch verification. */
export async function renderBrowserStill(options: BrowserStillOptions) {
  const session = await createBrowserStillSession();
  try { await session.render(options); } finally { await session.close(); }
}
