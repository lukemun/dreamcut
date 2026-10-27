import {Input, ALL_FORMATS, UrlSource, VideoSampleSink,type VideoSample} from 'mediabunny';
import {SequentialSamples} from './sequential-samples';
import type {CachedFrame} from './frame-store';
import {colorNormalizedTrack} from './decoder-color';
import {decoderSampleTime,decodedSampleInterval} from './sample-time';
import {mediaTransportUrl} from '../loopback-transport';

/** Caller resolves this through the existing verified proxy authority, never source_url fallback. */
/** `raster`: a vector image (SVG) is rasterized at its contained size within this
 * composition-pixel box, as Standard's browser draws it, rather than decoded. */
export type GpuProxySource = Readonly<{key: string; url: string; validationUrl: string; alpha?: boolean; kind?: 'image'; raster?: Readonly<{width:number;height:number}>; estimatedFrameBytes?:number}>;
export type GpuVideoDecodeTiming={sourceKey:string;capacityMs:number;queueMs:number;initializationMs:number;decodeMs:number;firstFrameMs:number|null;totalMs:number;requestedFrames:number;sessionReused:boolean};
const SOURCE_CACHE_BYTES=4*1024*1024;
export const GPU_PREVIEW_SOURCE_LIMIT=8;
type SourceSession = {retiring?:boolean;disposed?:boolean;color?:VideoColorSpaceInit; source: GpuProxySource; input: Input; sink: Promise<VideoSampleSink>; samples?:SequentialSamples<VideoSample>;tail: Promise<void>; busy:number; used:number};

/** Bounded demux/decoder ownership; no transport clock or timeline mutations. */
export class BrowserFrameProvider {
  private sessions = new Map<string, SourceSession>();
  private retained = new Map<string, SourceSession>();
  private retirementError:unknown;
  private closed = false;
  private tick = 0;
  private capacityWaiters = new Set<()=>void>();
  get bytes(){return [...this.sessions.values()].reduce((total,session)=>total+(session.samples?.bytes??0),0);}
  /** Conservative encoded-cache reservation, separate from decoded sample bytes. */
  get encodedCacheBudgetBytes(){return (this.sessions.size+this.retained.size)*SOURCE_CACHE_BYTES;}
  private disposeSession(session:SourceSession){if(!session.disposed){session.disposed=true;session.input.dispose();}}
  private async retireSession(key:string,session:SourceSession){
    try{
      await session.samples?.close();session.samples=undefined;
      if(this.closed||session.disposed||this.sessions.get(key)!==session){this.disposeSession(session);return;}
      this.sessions.delete(key);session.busy=0;session.retiring=false;
      this.retained.set(key,session);
      while(this.retained.size>this.maxRetainedSources){const oldest=[...this.retained].sort((a,b)=>a[1].used-b[1].used)[0];this.retained.delete(oldest[0]);this.disposeSession(oldest[1]);}
    }catch(error){this.retirementError=error;this.sessions.delete(key);this.disposeSession(session);}
    finally{this.notifyCapacity();}
  }
  private notifyCapacity(){for(const wake of [...this.capacityWaiters])wake();}
  private waitForCapacity(signal:AbortSignal){
    return new Promise<void>((resolve,reject)=>{
      const cleanup=()=>{this.capacityWaiters.delete(wake);signal.removeEventListener("abort",abort);};
      const wake=()=>{cleanup();resolve();};
      const abort=()=>{cleanup();reject(signal.reason);};
      this.capacityWaiters.add(wake);signal.addEventListener("abort",abort,{once:true});
      if(signal.aborted)abort();
    });
  }
  private async acquireSession(source:GpuProxySource,signal:AbortSignal){
    const retained=this.retained.get(source.key);if(retained)retained.used=++this.tick;
    while(true){
      signal.throwIfAborted();if(this.closed)throw Error("Frame provider closed");
      if(this.retirementError)throw this.retirementError;
      const existing=this.sessions.get(source.key);
      if((existing&&!existing.retiring)||(!existing&&this.sessions.size<this.maxSources)){
        const session=this.session(source);session.busy++;session.used=++this.tick;return session;
      }
      const idle=existing?.retiring?undefined:[...this.sessions].filter(([,entry])=>entry.busy===0).sort((a,b)=>a[1].used-b[1].used)[0];
      if(idle){idle[1].retiring=true;idle[1].busy++;void this.retireSession(idle[0],idle[1]);}
      // A cancelled lookahead may still be unwinding its decoder. Capacity is
      // backpressure, not an unsupported-source failure. Never exceed maxSources.
      await this.waitForCapacity(signal);
    }
  }
  constructor(readonly maxSources = 4, readonly hardwareAcceleration: HardwareAcceleration = 'no-preference',readonly decodeMode:'batch'|'sequential'='sequential',readonly maxRetainedSources=12) {
    if(!Number.isSafeInteger(maxSources)||maxSources<1)throw Error('Invalid decoder budget');
    if(!Number.isSafeInteger(maxRetainedSources)||maxRetainedSources<0||maxRetainedSources>16)throw Error('Invalid retained source budget');
  }
  private session(source: GpuProxySource): SourceSession {
    if(this.closed)throw Error('Frame provider closed');
    if(!source.key || !source.url || source.validationUrl!==source.url)throw Error('GPU source requires matching verified proxy');
    const existing=this.sessions.get(source.key)??this.retained.get(source.key);
    if(existing){
      if(existing.source.url!==source.url || Boolean(existing.source.alpha)!==Boolean(source.alpha))throw Error('Source identity reused for a different URL');
      if(!this.sessions.has(source.key)){
        if(this.sessions.size>=this.maxSources)throw Error('GPU decoder budget exceeded');
        this.retained.delete(source.key);this.sessions.set(source.key,existing);
      }
      return existing;
    }
    if(this.sessions.size>=this.maxSources)throw Error('GPU decoder budget exceeded');
    const input=new Input({formats:ALL_FORMATS,source:new UrlSource(mediaTransportUrl(source.url),{requestInit:{cache:'no-store'},maxCacheSize:SOURCE_CACHE_BYTES,parallelism:1,getRetryDelay:attempt=>attempt<2?.1:null})});
    const colorInfo:{color?:VideoColorSpaceInit}={};
    const sink=(async()=>{
      const track=await input.getPrimaryVideoTrack();
      if(!track || !await track.canDecode())throw Error('GPU proxy codec is unsupported');
      const transparent=await track.canBeTransparent(),codec=await track.getCodec();
      if(transparent!==Boolean(source.alpha))throw Error('GPU alpha declaration does not match the proxy track');
      if(transparent && codec!=='vp9' && codec!=='vp8')throw Error('GPU alpha proxy codec is not verified');
      if(await track.hasHighDynamicRange())throw Error('GPU preview currently requires an SDR proxy');
      if(await track.getRotation()!==0 || await track.getFlip())throw Error('GPU rotated proxy requires geometry normalization');
      const normalized=colorNormalizedTrack(track,transparent);colorInfo.color=(await normalized.getDecoderConfig())?.colorSpace;
      if(!['bt709','smpte170m'].includes(colorInfo.color?.primaries??'')||!['bt709','smpte170m','iec61966-2-1'].includes(colorInfo.color?.transfer??''))throw Error('GPU preview source color interpretation is not verified');
      // The demuxer merges VP8/VP9 side-data alpha on the CPU for every decoded frame. Hardware
      // frames live on the GPU, so each merge read back colour and alpha synchronously (about
      // 1.8 s of GPU time per 5 s of three alpha layers), and VideoToolbox returned opaque
      // alpha as 254. libvpx frames are already in memory and match ffmpeg and the <video> path.
      return new VideoSampleSink(normalized,{hardwareAcceleration:transparent?'prefer-software':this.hardwareAcceleration});
    })();
    // Observe initialization failures immediately, even if the queued caller is cancelled.
    const result={get color(){return colorInfo.color;},source:{...source},input,sink,tail:Promise.resolve(),busy:0,used:++this.tick};
    this.sessions.set(source.key,result);
    void sink.catch(()=>{if(this.sessions.get(source.key)===result)this.sessions.delete(source.key);if(this.retained.get(source.key)===result)this.retained.delete(source.key);this.disposeSession(result);this.notifyCapacity();});
    return result;
  }
  /** Sorted sample requests use one forward decode pass; batches are explicitly bounded. */
  async decode(source: GpuProxySource, timesUs: readonly number[], signal: AbortSignal,
    receive: (frame: CachedFrame<VideoFrame>)=>void,report?:(timing:GpuVideoDecodeTiming)=>void): Promise<void> {
    if(timesUs.length>60 || timesUs.some(t=>!Number.isSafeInteger(t)||t<0))return Promise.reject(Error('Invalid bounded decode request'));
    if(signal.aborted)return Promise.reject(signal.reason);
    const started=performance.now(),cachedSession=this.sessions.get(source.key)??this.retained.get(source.key);
    const session=await this.acquireSession(source,signal),acquired=performance.now();
    // A retained entry may be evicted while this request waits for capacity.
    const sessionReused=session===cachedSession;
    const run=async()=>{
      const dequeued=performance.now();
      signal.throwIfAborted();if(this.closed)throw Error('Frame provider closed');
      const sink=await session.sink;signal.throwIfAborted();
      const initialized=performance.now();
      const times=[...new Set(timesUs)].sort((a,b)=>a-b);
      const reader=this.decodeMode==='sequential'?(session.samples??=new SequentialSamples(start=>sink.samples(start),sample=>sample.codedWidth*sample.codedHeight*4)):undefined;
      const iterator=reader?(async function*(){for(const time of times)yield await reader.read(time,signal);})():sink.samplesAtTimestamps(times.map(decoderSampleTime));
      let index=0,firstFrameMs:number|null=null;
      try{
        for await(const sample of iterator){
          const target=times[index++];
          if(!sample)throw Error(`No decoded picture at ${target} us`);
          try{
            signal.throwIfAborted();if(this.closed)throw Error('Frame provider closed');
            const {timestampUs,durationUs}=reader?reader.interval(sample):decodedSampleInterval(sample.timestamp,sample.duration);
            if(durationUs<=0 || target<timestampUs || target>=timestampUs+durationUs)throw Error(`Decoded picture [${timestampUs}, ${timestampUs+durationUs}) does not cover ${target} us`);
            let frame=sample.toVideoFrame();
            // The pinned demuxer's planar alpha merger drops color metadata when
            // it constructs I420A. Restore the declared source interpretation.
            if(source.alpha && frame.format==='I420A' && session.color){
              try{
              const bytes=new Uint8Array(frame.allocationSize());const layout=await frame.copyTo(bytes);
              const corrected=new VideoFrame(bytes,{format:'I420A',codedWidth:frame.visibleRect?.width??frame.codedWidth,codedHeight:frame.visibleRect?.height??frame.codedHeight,
                displayWidth:frame.displayWidth,displayHeight:frame.displayHeight,
                timestamp:frame.timestamp,duration:frame.duration??undefined,layout,colorSpace:session.color});
              frame.close();frame=corrected;
              }catch(error){frame.close();throw error;}
            }
            if(source.alpha && !['RGBA','BGRA','I420A'].includes(frame.format??'')){frame.close();throw Error('GPU alpha decode did not preserve an alpha plane');}
            let closed=false;
            const release=()=>{if(!closed){closed=true;frame.close();}};
            if(firstFrameMs===null)firstFrameMs=performance.now()-initialized;
            try{receive({sourceKey:source.key,timestampUs,durationUs,
              bytes:decodedFrameBytes(frame),value:frame,release});}
            catch(error){release();throw error;}
          }finally{sample.close();}
        }
      }catch(error){await reader?.close();session.samples=undefined;if(signal.aborted)throw error;throw new Error(`GPU source ${source.key}: ${error instanceof Error?error.message:String(error)}`,{cause:error});}
      finally{await iterator.return();}
      const finished=performance.now();
      report?.({sourceKey:source.key,capacityMs:acquired-started,queueMs:dequeued-acquired,initializationMs:initialized-dequeued,decodeMs:finished-initialized,firstFrameMs,totalMs:finished-started,requestedFrames:times.length,sessionReused});
    };
    // One sink is never driven concurrently. Superseded queued work exits before decode.
    const result=session.tail.then(run).finally(()=>{session.busy--;session.used=++this.tick;this.notifyCapacity();});session.tail=result.catch(()=>{});return result;
  }
  close(){if(this.closed)return;this.closed=true;for(const session of new Set([...this.sessions.values(),...this.retained.values()])){void session.samples?.close();this.disposeSession(session);}this.sessions.clear();this.retained.clear();this.notifyCapacity();}
}

/** Decoded frames usually stay in their native YUV layout (about 1.5 bytes per pixel), not RGBA.
 * Counting their real size lets the frame store keep the frames it can actually hold. */
export function decodedFrameBytes(frame:Pick<VideoFrame,'codedWidth'|'codedHeight'|'allocationSize'>){
  try{const size=frame.allocationSize();if(Number.isFinite(size)&&size>0)return size;}catch{/* Closed or opaque frames fall back to RGBA. */}
  return Math.max(1,frame.codedWidth*frame.codedHeight*4);
}
