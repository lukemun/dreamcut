'use client';
import {useLayoutEffect,useMemo,useRef,useState,useSyncExternalStore,type ComponentProps} from 'react';
import {instantPreviewStore} from '@/components/studio/timeline/instant-preview-store';
import {applyInstantPreviewProps} from '@/components/studio/timeline/proposal-preview-props';
import {useFrameState} from '@/lib/frame-runtime';
import {TimelineComposition} from '@/lib/remotion/TimelineComposition';
import {admitGpuScene} from '@/lib/gpu-preview/scene';
import type {GpuPreviewRuntime} from '@/lib/gpu-preview/runtime';
import {heavyGpuPictureFrames} from '@/lib/gpu-preview/heavy-picture-plan';
import {gpuDisplayBuffer,gpuDisplaySessionKey,previewPixelScale} from '@/lib/gpu-preview/display-buffer';
import {PREVIEW_QUALITY_EVENT,readPreviewQuality} from '@/lib/preview-quality';
import {GpuWorkerClient} from '@/lib/gpu-preview/worker-client';
import {GpuPictureQueue} from '@/lib/gpu-preview/picture-queue';
import {GpuPlaybackMetrics,GpuSeekMetrics} from '@/lib/gpu-preview/playback-metrics';
import {gpuReplayProfile} from '@/lib/gpu-preview/replay-profile';
import {GpuSessionFailure} from '@/lib/gpu-preview/session-failure';
import {gpuAdmissionError,reportGpuPreviewFailure} from '@/lib/observability/gpu-preview-report';
import {PausedSeekCoalescer,isForwardScrubStep} from '@/lib/gpu-preview/paused-seek-coalescer';

const PLAY_RUNWAY_SECONDS=0.5;
const PLAY_COSTLY_LOOKAHEAD_SECONDS=4;
const DIAGNOSTICS_INTERVAL_MS=250;
/** Each GPU start phase (worker script load, then CanvasKit/device start) gets this long. */
const INIT_PHASE_LIMIT_MS=30000;
/** A fast 53-bit digest (cyrb53) of a long string, for keys that only need to tell scenes apart. */
function stringDigest(text:string){
 let h1=0xdeadbeef,h2=0x41c6ce57;
 for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);h1=Math.imul(h1^c,2654435761);h2=Math.imul(h2^c,1597334677);}
 h1=Math.imul(h1^(h1>>>16),2246822507)^Math.imul(h2^(h2>>>13),3266489909);
 h2=Math.imul(h2^(h2>>>16),2246822507)^Math.imul(h1^(h1>>>13),3266489909);
 return `${text.length}:${(4294967296*(2097151&h2)+(h1>>>0)).toString(36)}`;
}

type Live=ComponentProps<typeof TimelineComposition>;
type Picture={bitmap:ImageBitmap;bytes:number;timing:NonNullable<GpuPreviewRuntime['lastPresentation']>&{replayHit?:boolean};close():void};
// The product renderer is paired with CanvasKit export. Alternate compositors
// remain available only in engineering fixtures.
const canvasKitTrial=true;
/** Canvas lifecycle adapter. The existing Player/audio mixer exclusively owns time. */
/** `onFailure`'s `device` is true when this computer could not start the GPU path at all (no usable graphics), as opposed to a failure mid-session. */
/** Startup failures that mean this computer cannot draw the GPU path. Anything else while starting (a proxy
 * not ready yet, an unsupported source) is about the project, not the computer. */
const GPU_DEVICE_FAILURE=/WebGL2 unavailable|GPU context unavailable|GPU surface unavailable|CanvasKit output unavailable|GPU worker failed/;
export function GpuPlaybackComposition({live:input,projectId,onFailure}:{live:Live;projectId?:string;onFailure:(reason:string,device:boolean)=>void}){
 // Dial drags on a proposal card reach the player directly, without an editor re-render.
 const instant=useSyncExternalStore(instantPreviewStore.subscribe,instantPreviewStore.get,()=>null);
 const live=useMemo(()=>{
  if(!instant)return input;
  const ids=new Set(instant.props.map(prop=>prop.elementId));
  return input.elements.some(element=>ids.has(element.id))?{...input,elements:applyInstantPreviewProps(input.elements,instant.props)}:input;
 },[input,instant]);
 const state=useFrameState(),canvas=useRef<HTMLCanvasElement>(null),runtime=useRef<GpuWorkerClient|null>(null);
 const visibilityEpoch=useRef(0);
 useLayoutEffect(()=>{const changed=()=>{visibilityEpoch.current++;};document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);},[]);
 const [display,setDisplay]=useState<ReturnType<typeof gpuDisplayBuffer>&{pixelScale:number}|null>(null);
 useLayoutEffect(()=>{
  const parent=canvas.current!.closest('[data-dreamcut-player]')!;
  const measure=()=>{const rect=parent.getBoundingClientRect();if(rect.width<=0||rect.height<=0)return;const pixelScale=previewPixelScale(state.width,state.height,projectId?readPreviewQuality(projectId):'prepared');const next={...gpuDisplayBuffer(state.width*pixelScale,state.height*pixelScale,rect.width,rect.height,devicePixelRatio,state.fps),pixelScale};setDisplay(old=>old?.deliveryWidth===next.deliveryWidth&&old?.deliveryHeight===next.deliveryHeight&&old.pixelScale===next.pixelScale?old:next);};
  const observer=new ResizeObserver(measure);observer.observe(parent);window.addEventListener('resize',measure);window.addEventListener(PREVIEW_QUALITY_EVENT,measure);measure();
  return()=>{observer.disconnect();window.removeEventListener('resize',measure);window.removeEventListener(PREVIEW_QUALITY_EVENT,measure);};
 },[state.width,state.height,state.fps]);
 // The player settles its size over several layouts on mount (and changes it on window resize or
 // fullscreen). A new size is applied to the running worker; only a new pixel scale or picture
 // budget starts a new one. Restarting per size started the worker four times on load.
 const sessionKey=display?gpuDisplaySessionKey(display):null;
 const displayRef=useRef(display);displayRef.current=display;
 const [scope]=useState(()=>crypto.randomUUID()),[ready,setReady]=useState(0);
 const inputAdmission=useMemo(()=>admitGpuScene(input.elements,scope,canvasKitTrial?'canvaskit':'webgpu'),[input.elements,scope]);
 // Dragged values only place, size or fade a layer: admission is unchanged, so patch the
 // admitted elements instead of re-checking every clip per drag sample.
 const admission=useMemo(()=>live===input||!inputAdmission.supported||!instant?inputAdmission
  :{...inputAdmission,elements:applyInstantPreviewProps(inputAdmission.elements,instant.props)},[live,input,inputAdmission,instant]);
 // Live dial drags while paused: a scene change waits for the paused picture already being
 // prepared, which is then shown, and the newest scene renders next. Cancelling on every
 // drag sample presented nothing until the drag stopped (the same rule as paused scrubbing).
 const pausedPictureInFlight=useRef(false);
 const [shownLive,setShownLive]=useState(live);
 const liveRef=useRef(live);liveRef.current=live;
 useLayoutEffect(()=>{
  if(!pausedPictureInFlight.current||state.transportPlaying){setShownLive(live);return;}
  if(canvas.current)canvas.current.dataset.gpuSceneDeferrals=String(Number(canvas.current.dataset.gpuSceneDeferrals??0)+1);
 },[live,state.transportPlaying]);
 const shownAdmission=useMemo(()=>shownLive===live?admission:admitGpuScene(shownLive.elements,scope,canvasKitTrial?'canvaskit':'webgpu'),[shownLive,live,admission,scope]);

 const latest=useRef({live,admission,onFailure});latest.current={live,admission,onFailure};
 const latestState=useRef(state);latestState.current=state;
 const failure=useRef<GpuSessionFailure|null>(null);
 const metrics=useRef(new GpuPlaybackMetrics());
 const seeks=useRef(new GpuSeekMetrics());
 const pictures=useRef<GpuPictureQueue<Picture>|null>(null),lastRequest=useRef<{frame:number;epoch:number;playing:boolean}|null>(null);
 const installedLive=useRef<Live|null>(null),gate=useRef(Symbol('GPU picture')),lastDiagnostics=useRef(0);
 // A whole-scene key is conservative: no preparation hint crosses an edit,
 // source/proxy choice or output setting. Persisted hints never contain pixels.
 // Content key: the editor rebuilds `live` on unrelated changes (selection, inspector), and an
 // identical scene must keep its prepared and replay pictures.
 // The scene key is the input scene plus any dragged values: re-serialising the whole
 // timeline on every drag sample cost more than drawing the picture.
 const inputKey=useMemo(()=>JSON.stringify(input),[input]);
 const liveKey=useMemo(()=>live===input?inputKey:`${inputKey}\u0000${JSON.stringify(instant?.props)}`,[live,input,inputKey,instant]);
 const shownLiveKey=useMemo(()=>shownLive===live?liveKey:JSON.stringify(shownLive),[shownLive,live,liveKey]);
 const installedLiveKey=useRef<string|null>(null);
 // Replay hints are keyed by the scene as edited; a dial drag in progress does not re-key them.
 // The scene key is megabytes for dense scenes; the profile identity only needs a digest of it.
 const profileInputs=useMemo(()=>JSON.stringify({live:stringDigest(inputKey),width:state.width,height:state.height,fps:state.fps,duration:state.durationInFrames,display:sessionKey}),[inputKey,state.width,state.height,state.fps,state.durationInFrames,sessionKey]);
 // Replay hints follow the scene, but the GPU session must not: an edit (a dial, a proposal
 // preview) swaps the scene in the running worker. Rebuilding the session per edit took
 // seconds before the paused frame showed the change.
 const profileInputsRef=useRef(profileInputs);profileInputsRef.current=profileInputs;
 const profileRef=useRef<{key:string;profile?:Awaited<ReturnType<typeof gpuReplayProfile>>}|null>(null);
 const rotateProfile=(inputs:string)=>{
  if(profileRef.current?.key===inputs)return;
  profileRef.current?.profile?.close();
  const entry:{key:string;profile?:Awaited<ReturnType<typeof gpuReplayProfile>>}={key:inputs};profileRef.current=entry;
  if(!projectId)return;
  void gpuReplayProfile(projectId,inputs,window.localStorage).then(profile=>{if(profileRef.current===entry)entry.profile=profile;else profile.close();}).catch(()=>{/* Local storage is optional. */});
 };
 useLayoutEffect(()=>{
  if(!sessionKey)return;
  let cancelled=false;const session=state.session;
  // Failing while the worker starts (before it is ready) means the device cannot run the GPU path.
  let stage:'admission'|'device'|'running'='admission';
  let profile:Awaited<ReturnType<typeof gpuReplayProfile>>|undefined;
  session.visualResources.set(gate.current,'Preparing GPU preview');
  const terminal=new GpuSessionFailure(()=>cancelled,()=>{
   session.previewFrameRenderer=null;
   pictures.current?.close();pictures.current=null;lastRequest.current=null;
   const owned=runtime.current;runtime.current=null;installedLive.current=null;
   try{owned?.close();}finally{session.visualResources.delete(gate.current);}
  },reason=>latest.current.onFailure(reason,stage==='device'&&GPU_DEVICE_FAILURE.test(reason)),reportGpuPreviewFailure);
  failure.current=terminal;
  const fail=(error:unknown)=>terminal.fail(error);
  // Two limits: loading the worker script, then starting CanvasKit in it. The script request
  // waits behind the page's other requests (a long timeline keeps the server and the browser's
  // connections busy for many seconds), which is not the device starting.
  let timeout=setTimeout(()=>fail(Error('GPU preview worker did not load in time.')),INIT_PHASE_LIMIT_MS);
  void (async()=>{
   const current=latest.current;if(!current.admission.supported)throw gpuAdmissionError(current.admission.reason);
   const inputs=profileInputsRef.current;
   if(projectId){try{profile=await gpuReplayProfile(projectId,inputs,window.localStorage);}catch{/* Local storage is optional. */}}
   if(cancelled||terminal.failed){profile?.close();return;}
   profileRef.current?.profile?.close();profileRef.current={key:inputs,profile};
   stage='device';
   // The latest measured size: sizes that settle while the profile loads need no resize.
   const {deliveryWidth,deliveryHeight,capacity,pixelScale}=displayRef.current!;
   const owned=new GpuWorkerClient({deliveryWidth,deliveryHeight,elements:current.admission.elements,laneOrder:current.live.laneOrderKeys??[],scope,width:state.width,height:state.height,fps:state.fps,duration:state.durationInFrames,pixelScale},fail);
   runtime.current=owned;
   void owned.booted.then(()=>{clearTimeout(timeout);if(!cancelled&&!terminal.failed)timeout=setTimeout(()=>fail(Error('GPU preview initialization timed out.')),INIT_PHASE_LIMIT_MS);},()=>{/* Boot failures reach `fail` through the worker client. */});
   await owned.ready;stage='running';if(cancelled||terminal.failed)return;
   let generation=0;
   pictures.current=new GpuPictureQueue<Picture>(async(frame,sequential,ahead)=>{
    // Pictures in playing order are kept for replay, including those prepared ahead of a paused
    // frame (Play starts with them). The paused frame itself is composited live and not recorded.
    const forPlayback=owned.allowReplay||ahead;
    const result=await owned.render(frame,generation,forPlayback,sequential&&forPlayback);
    return {bitmap:result.bitmap,timing:result.timing,bytes:result.bitmap.width*result.bitmap.height*4,close(){result.bitmap.close();}};
   },()=>{generation++;owned.cancelPreparation();},capacity,fail,{frames:heavyGpuPictureFrames(current.admission.elements,state.fps,state.durationInFrames),capacity,horizon:Math.ceil(state.fps*12)},
    {capacity,thresholdMs:Math.max(16,1000/state.fps),cost:picture=>picture.timing.totalMs,seeds:profile?.seeds(capacity),onCost:(frame,cost)=>profileRef.current?.profile?.record(frame,cost)});
   // A picture made out of order (dense or costly frame) joins the replay recording when playback order reaches it.
   // No copy when this browser has no replay cache (the worker reports null stats).
   pictures.current.onPassed=async(frame,picture,ahead)=>{if(owned.lastReplay!==null&&(owned.allowReplay||ahead))owned.recordPicture(frame,await createImageBitmap(picture.bitmap));};
   // A picture decoded from the replay cache says nothing about how fast the producer composites.
   pictures.current.cached=picture=>picture.timing.replayHit===true;
   installedLive.current=current.live;installedLiveKey.current=JSON.stringify(current.live);
   setReady(version=>version+1);
  })().catch(fail).finally(()=>clearTimeout(timeout));
  return()=>{cancelled=true;profileRef.current?.profile?.close();profileRef.current=null;if(failure.current===terminal)failure.current=null;clearTimeout(timeout);try{terminal.close();}catch(error){console.warn('[GPU preview cleanup]',error);}};
 },[scope,state.session,state.width,state.height,state.fps,sessionKey,projectId]);
 useLayoutEffect(()=>{
  const owned=runtime.current;if(!owned||!display)return;
  // Before the worker is ready the size is held and sent with its start; afterwards a paused
  // picture is redrawn at the new size, and playback's next pictures arrive at it.
  let sent=false;
  if(!failure.current?.guard(()=>{sent=owned.resize(display.deliveryWidth,display.deliveryHeight);})||!sent)return;
  if(pictures.current&&!latestState.current.transportPlaying){pictures.current.invalidate();setReady(version=>version+1);}
 },[display]);
 useLayoutEffect(()=>{
  const owned=runtime.current;if(!owned)return;
  if(!shownAdmission.supported){failure.current?.fail(gpuAdmissionError(shownAdmission.reason));return;}
  const queue=pictures.current;if(!queue)return;
  if(installedLive.current!==shownLive&&installedLiveKey.current===shownLiveKey)installedLive.current=shownLive;
  if(installedLive.current!==shownLive&&!failure.current?.guard(()=>{installedLiveKey.current=shownLiveKey;rotateProfile(profileInputsRef.current);queue.setWarmFrames(heavyGpuPictureFrames(shownAdmission.elements,state.fps,state.durationInFrames));queue.invalidate();if(canvas.current)canvas.current.dataset.gpuSceneUpdates=String(Number(canvas.current.dataset.gpuSceneUpdates??0)+1);owned.updateScene(shownAdmission.elements,shownLive.laneOrderKeys??[],state.durationInFrames);installedLive.current=shownLive;}))return;
  let cancelled=false,request=0;
  const session=state.session;
  // Scrubbing: let an in-flight paused picture finish and show it, then prepare
  // only the latest target. Cancelling on every pointer move restarted decoders
  // from a keyframe and presented nothing until the drag stopped.
  const scrub=new PausedSeekCoalescer<{frame:number;epoch:number}>();
  /** Waits for the runway the measured producer needs (playback-runway.ts); its own pictures refine the measurement. */
  const holdRunway=async(queue:GpuPictureQueue<Picture>,frame:number)=>{
   const {fps,playbackRate}=latestState.current,consumed=fps*(playbackRate??1),least=Math.ceil(fps*PLAY_RUNWAY_SECONDS);
   const runway=await queue.holdRunway(frame,consumed,least,()=>cancelled);
   if(canvas.current){const holds=JSON.parse(canvas.current.dataset.gpuRunway??'{"holds":0}');canvas.current.dataset.gpuRunway=JSON.stringify({holds:holds.holds+1,frame,runway,productionFps:queue.productionFps&&Math.round(queue.productionFps*10)/10,consumedFps:consumed});}
  };
  const renderFrame=(frame:number,epoch:number,playing:boolean,continuation=false)=>{
   const token=scrub.offer({frame,epoch},!playing);
   if(token===null)return;
   const prior=lastRequest.current;
   // A short forward scrub step keeps the producer's sequential decoders: cancelling
   // them restarts decoding at the previous keyframe for a target a few frames ahead.
   const forwardStep=continuation&&prior!==null&&isForwardScrubStep(prior.frame,frame,latestState.current.fps);
   if(prior&&prior.epoch!==epoch&&prior.frame!==frame&&!forwardStep)queue.invalidate(true);
   lastRequest.current={frame,epoch,playing};
   owned.allowReplay=playing;
   const ownRequest=++request,requestedAt=performance.now();
   if(!playing)pausedPictureInFlight.current=true;
   const visibleEpoch=visibilityEpoch.current,wasVisible=document.visibilityState==='visible';
   session.visualResources.set(gate.current,'Preparing complete GPU picture');
   const timeout=setTimeout(()=>{
    if(!cancelled&&ownRequest===request)failure.current?.fail(Error('GPU preview timed out preparing this frame.'));
   },playing&&!prior?.playing?120000:30000);
   // Playing on from the previous picture, and this one is not ready: the producer fell behind.
   const stalled=playing&&prior?.playing===true&&prior.epoch===epoch&&!queue.has(frame);
   void queue.request(frame,latestState.current.durationInFrames).then(async picture=>{
    // The picture's own wait, before any runway hold: a hold is playback buffering, not this frame's cost.
    const pictureWaitMs=performance.now()-requestedAt;
    if(playing&&!prior?.playing){
     // Start after half a second of pictures and the remembered slow frames of the next few seconds,
     // then the measured runway (below); the rest keeps filling while it plays.
     const fps=latestState.current.fps;
     await queue.readyAhead(frame,Math.ceil(fps*PLAY_RUNWAY_SECONDS),frame+Math.ceil(fps*PLAY_COSTLY_LOOKAHEAD_SECONDS));
     await holdRunway(queue,frame);
     // Let Play's editor/layout updates settle before releasing picture/audio.
     await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));
    }else if(stalled&&ownRequest===request&&!cancelled){
     // Buffer once: hold (picture and sound together) until enough pictures are ready to play
     // through, instead of resuming on each late picture and stopping again a few frames later.
     await holdRunway(queue,frame);
    }
    if(cancelled||ownRequest!==request||failure.current?.failed)return;
    if(playing&&prior?.playing&&prior.epoch===epoch&&wasVisible&&document.visibilityState==='visible'&&visibleEpoch===visibilityEpoch.current)queue.recordPlaybackWait(frame,pictureWaitMs);
    const output=canvas.current!.getContext('2d',{alpha:false});
    if(!output)throw Error('GPU presentation canvas unavailable');
    output.drawImage(picture.bitmap,0,0,state.width,state.height);
    // A paused frame is for inspection and capture: replace a compressed replay picture with the live composite.
    canvas.current!.dataset.gpuReplayFrame=picture.timing.replayHit?'1':'0';
    if(picture.timing.replayHit&&!playing)void owned.render(frame,undefined,false).then(live=>{
     try{if(!cancelled&&ownRequest===request&&canvas.current){canvas.current.getContext('2d',{alpha:false})?.drawImage(live.bitmap,0,0,state.width,state.height);canvas.current.dataset.gpuReplayFrame='0';}}
     finally{live.bitmap.close();}
    }).catch(()=>{/* The next request redraws this frame. */});
    const timing={...picture.timing,frame,resourceMs:performance.now()-requestedAt};
    canvas.current!.dataset.gpuPreviewFrame=String(frame);
    canvas.current!.dataset.gpuCacheBytes=String(owned.bytes+queue.bytes);
    canvas.current!.dataset.gpuPresentation=JSON.stringify(timing);
    // Diagnostics nothing samples per frame refresh a few times a second while playing.
    const diagnostics=!playing||performance.now()-lastDiagnostics.current>=DIAGNOSTICS_INTERVAL_MS;
    if(diagnostics){
     lastDiagnostics.current=performance.now();
     canvas.current!.dataset.gpuPictureQueue=JSON.stringify({size:queue.size,capacity:queue.capacity,bytes:queue.bytes});
     canvas.current!.dataset.gpuReplayCache=JSON.stringify(queue.replayStats);
     if(owned.lastReplay)canvas.current!.dataset.gpuReplaySegments=JSON.stringify(owned.lastReplay);
    }
    const measured=metrics.current.record(epoch,playing,performance.now(),timing);
    if(measured)canvas.current!.dataset.gpuPlaybackMetrics=JSON.stringify(measured);
    const seek=playing?undefined:seeks.current.record(timing.resourceMs,picture.timing);
    if(seek)canvas.current!.dataset.gpuSeekMetrics=JSON.stringify(seek);
    session.visualResources.delete(gate.current);
    if(diagnostics){
     canvas.current!.dataset.gpuSlowText=JSON.stringify(owned.slowText);
     canvas.current!.dataset.gpuSlowPictures=JSON.stringify(owned.slowPictures);
    }
    canvas.current!.dataset.gpuPrefetch=JSON.stringify(owned.lastPrefetch);
   }).catch(error=>{
    // A superseded picture is a cancellation (newer frame or scene change), not a GPU failure; the next request redraws.
    if(error instanceof DOMException&&error.name==='AbortError'&&error.message==='GPU picture superseded')return;
    if(!cancelled&&ownRequest===request)failure.current?.fail(error);
   }).finally(()=>{
    clearTimeout(timeout);
    if(!playing&&ownRequest===request)pausedPictureInFlight.current=false;
    // A scene that arrived while this picture was prepared renders next.
    if(!cancelled&&liveRef.current!==shownLive){setShownLive(liveRef.current);return;}
    const next=scrub.settle(token);
    if(next&&!cancelled)renderFrame(next.frame,next.epoch,false,true);
   });
  };
  session.previewFrameRenderer=renderFrame;
  const target=session.previewTarget??{frame:state.frame,epoch:state.seekVersion??0,playing:Boolean(state.transportPlaying)};
  renderFrame(target.frame,target.epoch,target.playing);
  return()=>{cancelled=true;if(session.previewFrameRenderer===renderFrame)session.previewFrameRenderer=null;};
 },[ready,shownLive,shownAdmission,shownLiveKey,state.session,state.durationInFrames]);
 return <canvas ref={canvas} width={state.width} height={state.height} data-gpu-preview data-gpu-compositor={canvasKitTrial?'canvaskit':'webgpu'} style={{position:'absolute',inset:0,width:'100%',height:'100%',background:'black'}}/>;
}
