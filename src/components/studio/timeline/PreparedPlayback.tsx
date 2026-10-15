"use client";
import {NativePlaybackComposition} from './NativePlaybackComposition';
import {FrameContext,Sequence,useFrameState} from "@/lib/frame-runtime";
import type {PreparedPlaybackBlock} from "./usePreparedPlayback";
import {memo,useMemo,type ComponentProps} from 'react';
import {Video} from '@/lib/frame-runtime/media';
import {GpuPlaybackComposition} from './GpuPlaybackComposition';
import {TimelineComposition} from '@/lib/remotion/TimelineComposition';
import {Button} from '@/components/ui/button';
import type {PreparedPreviewStatus} from '@/lib/timeline/prepared-preview';

export function PreparedPlaybackComposition({live,projectId,url,blocks,overlayCaptions=false,nativeProjectId,onNativeFailure,gpu,onGpuFailure}:{live:ComponentProps<typeof TimelineComposition>;projectId?:string;url?:string;blocks?:PreparedPlaybackBlock[];overlayCaptions?:boolean;nativeProjectId?:string;onNativeFailure?:(reason:string)=>void;gpu?:boolean;onGpuFailure?:(reason:string)=>void}) {
  if(gpu&&onGpuFailure)return <GpuPlaybackComposition live={live} projectId={projectId} onFailure={onGpuFailure}/>;
  if(blocks)return <PreparedBlockComposition live={live} blocks={blocks} overlayCaptions={overlayCaptions} nativeProjectId={nativeProjectId} onNativeFailure={onNativeFailure}/>;
  if(nativeProjectId&&onNativeFailure)return <NativePlaybackComposition live={live} projectId={nativeProjectId} onFailure={onNativeFailure}/>;
  return url ? <><Video src={url} title="prepared-complete-picture" playbackRate={1} volume={1} pauseWhenBuffering style={{width:'100%',height:'100%',objectFit:'contain'}}/>{overlayCaptions && <TimelineComposition {...live} captionOverlayOnly/>}</> : <TimelineComposition {...live}/>;
}

const ParkedTimelineComposition=memo(TimelineComposition);
function PreparedBlockComposition({live,blocks,overlayCaptions,nativeProjectId,onNativeFailure}:{live:ComponentProps<typeof TimelineComposition>;blocks:PreparedPlaybackBlock[];overlayCaptions:boolean;nativeProjectId?:string;onNativeFailure?:(reason:string)=>void}) {
  const state=useFrameState();
  const active=blocks.find(block=>state.frame>=block.range[0]&&state.frame<=block.range[1]&&block.url);
  // Keep the ordinary decoder mounted, warming the first live frame after the
  // block while hidden. It does not recompute the expensive animation underneath.
  const parkedState=useMemo(()=>{const frame=Math.min(state.durationInFrames-1,(active?.range[1]??0)+1);return {...state,frame,absoluteFrame:frame,seekVersion:0,playing:false,transportPlaying:false,premounted:true,frozen:true};},[active?.range[1],state.session,state.durationInFrames,state.width,state.height,state.fps,state.muted,state.volume,state.playbackRate,state.rendering]);
  const liveState=active?parkedState:state;
  return <>
    <div style={{position:'absolute',inset:0,visibility:active?'hidden':'visible',opacity:active?0:1}}><FrameContext.Provider value={liveState}>{nativeProjectId&&onNativeFailure?<NativePlaybackComposition live={live} projectId={nativeProjectId} onFailure={onNativeFailure}/>:<ParkedTimelineComposition {...live}/>}</FrameContext.Provider></div>
    {blocks.filter(block=>block.url).map(block=><Sequence key={`${block.range[0]}:${block.range[1]}`} from={block.range[0]} durationInFrames={block.range[1]-block.range[0]+1} premountFor={state.fps}>
      <Video src={block.url!} title="prepared-picture-block" playbackRate={1} volume={1} pauseWhenBuffering style={{width:'100%',height:'100%',objectFit:'contain'}}/>
    </Sequence>)}
    {active && overlayCaptions && <TimelineComposition {...live} captionOverlayOnly/>}
  </>;
}

export function PreparedPlaybackStatus({status,onRetry}:{status:PreparedPreviewStatus|null;onRetry:()=>void}) {
  const failed=status?.state==='failed'||status?.state==='cancelled', ready=status?.state==='ready';
  const queued=status?.state==='queued';
  const percent=Math.max(0,Math.min(100,Math.round((status?.progress??0)*100)));
  const help=failed?status.error:queued?'Queued':'Preparing frames';
  return <div data-prepared-playback-state={status?.state??'needs-update'} hidden={ready}
    title={help} style={{position:'absolute',top:12,right:12,zIndex:35,maxWidth:'calc(100% - 24px)',
      background:'var(--popover, #202630)',color:'var(--popover-foreground, #fff)',padding:'8px 12px',borderRadius:10,
      border:'1px solid var(--border, #526071)',boxShadow:'0 3px 14px rgba(0,0,0,.25)',fontSize:13,fontWeight:600,fontVariantNumeric:'tabular-nums',
      pointerEvents:failed?'auto':'none'}}>
    {!ready && (failed ? <Button size="sm" variant="ghost" onClick={onRetry}
      aria-label={`Retry preview${status.error?`: ${status.error}`:''}`}
      style={{color:'inherit',background:'transparent',textShadow:'inherit'}}>Retry preview</Button>
      : queued ? <span role="status">Queued</span>
      : <span role="progressbar" aria-label="Preparing preview" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>Preparing · {percent}%</span>)}
  </div>;
}
