'use client';
import {useCallback,useEffect,useLayoutEffect,useRef,useState,type ComponentProps} from 'react';
import {FrameContext,FrameSession,settleFrameResources,useFrameState,type FrameState} from '@/lib/frame-runtime';
import {TimelineComposition} from '@/lib/remotion/TimelineComposition';
import {NativeSourceProvider} from '@/lib/native-preview/NativeSourceProvider';
import {resolveVideoPlaybackSource} from '@/lib/remotion/video-preview-source';
import {quantizeVisualFrameSpan} from '@/lib/timeline/frame-quantization';

import {useNativeSourceWarmup} from '@/lib/native-preview/use-source-warmup';
import {nativePreparationFrame,nativePresentationAction} from '@/lib/native-preview/presentation-schedule';

type Live=ComponentProps<typeof TimelineComposition>;
type Snapshot={token:number;live:Live;state:FrameState};
function NativeStage({snapshot,projectId,pending,onSettled,onFailed}:{snapshot:Snapshot;projectId:string;pending:boolean;onSettled:(token:number)=>void;onFailed:(token:number,error:unknown)=>void}){
 const root=useRef<HTMLDivElement>(null),[session]=useState(()=>new FrameSession());
 useEffect(()=>()=>session.dispose(),[session]);
 useLayoutEffect(()=>{
  if(!pending)return;let cancelled=false;session.error=null;
  void settleFrameResources(session,root.current!).then(()=>{if(root.current)root.current.dataset.nativeSettle=JSON.stringify({...session.lastSettleTiming,token:snapshot.token});if(!cancelled)onSettled(snapshot.token);},error=>{if(!cancelled)onFailed(snapshot.token,error);});
  return()=>{cancelled=true;};
 },[snapshot,pending,session,onSettled,onFailed]);
 const state:FrameState={...snapshot.state,session,effectDrawMode:'settled',playing:false,transportPlaying:false,muted:true,volume:0};
 return <div ref={root} style={{position:'absolute',inset:0}}><FrameContext.Provider value={state}><NativeSourceProvider projectId={projectId}><TimelineComposition {...snapshot.live} externalAudioPreview/></NativeSourceProvider></FrameContext.Provider></div>;
}
/** Two complete scene buffers. CSS, text, masks and source pixels publish together. */
export function NativePlaybackComposition({live,projectId,onFailure}:{live:Live;projectId:string;onFailure:(reason:string)=>void}){
 const state=useFrameState(),latest=useRef({live,state});latest.current={live,state};
 useNativeSourceWarmup(projectId,live.elements,state.frame,state.fps);
 const [slots,setSlots]=useState<Array<Snapshot|null>>([null,null]),[front,setFront]=useState<number|null>(null),[pending,setPending]=useState<number|null>(null);
 const request=useRef<{index:number;token:number;ready:boolean;started:number}|null>(null),sequence=useRef(0),alive=useRef(true),gate=useRef(Symbol('native scene'));
 const latency=useRef(40);
 const [waiting,setWaiting]=useState(true);
 const settle=useCallback((token:number)=>{
  const active=request.current;if(!alive.current||active?.token!==token)return;
  latency.current=Math.min(250,Math.max(16,latency.current*.7+(performance.now()-active.started)*.3));
  active.ready=true;setPending(null);
 },[]);
 const fail=useCallback((token:number,error:unknown)=>{
  if(!alive.current||request.current?.token!==token)return;
  request.current=null;latest.current.state.session.visualResources.delete(gate.current);
  console.warn("[Rust preview]",error);
  onFailure(error instanceof Error?error.message:String(error));
 },[onFailure]);
 useLayoutEffect(()=>{alive.current=true;return()=>{alive.current=false;state.session.visualResources.delete(gate.current);};},[state.session]);
 useLayoutEffect(()=>{
  const shown=front===null?null:slots[front];
  const matches=(shot:Snapshot|null)=>Boolean(shot&&shot.live===live&&shot.state.seekVersion===state.seekVersion&&shot.state.width===state.width&&shot.state.height===state.height);
  const shownCurrent=matches(shown);
  const hold=()=>state.session.visualResources.set(gate.current,'Preparing complete Rust scene');
  const release=()=>state.session.visualResources.delete(gate.current);
  const active=request.current;
  if(active){
   const shot=slots[active.index];
   const action=nativePresentationAction({frame:state.frame,preparedFrame:shot?.state.frame??state.frame,ready:active.ready,transportPlaying:Boolean(state.transportPlaying),current:matches(shot)});
   if(action==='present'){
    setFront(active.index);request.current=null;release();setWaiting(false);return;
   }
   if(action==='discard'){
    hold();
    // Finish the old source job before reusing its staging surface.
    if(!active.ready)return;
    request.current=null;
   }else{
    if(action==='buffer'||!shownCurrent)hold();else release();
    return;
   }
  }
  if(shownCurrent&&shown?.state.frame===state.frame&&!state.playing){release();return;}
  if(!shownCurrent)hold();
  const frame=nativePreparationFrame({frame:state.frame,durationInFrames:state.durationInFrames,fps:state.fps,playbackRate:state.playbackRate,latencyMs:latency.current,playing:state.playing,hasCurrentScene:shownCurrent});
  if(shownCurrent&&shown?.state.frame===frame){release();return;}
  try{
   for(const e of live.elements){const span=quantizeVisualFrameSpan(e.timeline_start,e.duration);if(e.type==='video_clip'&&frame>=span.startFrame&&frame<span.endFrame&&!resolveVideoPlaybackSource(e,e.source_url,false))throw Error('Standard preview required until this video’s verified proxy is ready.');}
   const index=front===0?1:0,token=++sequence.current;
   request.current={index,token,ready:false,started:performance.now()};
   setSlots(old=>{const next=[...old];next[index]={token,live,state:{...state,frame,absoluteFrame:frame}};return next;});setPending(index);
  }catch(error){release();onFailure(error instanceof Error?error.message:String(error));}
 },[state.frame,state.seekVersion,state.width,state.height,state.session,state.playing,state.transportPlaying,state.durationInFrames,state.fps,state.playbackRate,live,front,pending,slots,onFailure]);

 useEffect(()=>{
  if(pending===null){setWaiting(false);return;}
  const timer=setTimeout(()=>setWaiting(true),150);return()=>clearTimeout(timer);
 },[pending]);
 return <div data-native-preview-frame={front===null?undefined:slots[front]?.state.frame} style={{position:'absolute',inset:0,background:'black'}}>
  {slots.map((snapshot,index)=>snapshot&&<div key={index} aria-hidden={index!==front} style={{position:'absolute',inset:0,visibility:index===front?'visible':'hidden',opacity:index===front?1:0,pointerEvents:'none'}}><NativeStage snapshot={snapshot} projectId={projectId} pending={pending===index} onSettled={settle} onFailed={fail}/></div>)}
  {(front===null||waiting||(!state.transportPlaying&&slots[front]?.state.frame!==state.frame))&&<div role="status" style={{position:'absolute',top:12,right:12,padding:'8px 12px',borderRadius:"var(--edge-control)",background:'var(--popover)',color:'var(--popover-foreground)'}}>{front===null?'Starting Rust preview…':'Updating preview…'}</div>}
 </div>;
}
