'use client';
import {useId,useLayoutEffect,useRef} from 'react';
import {useFrameState} from '@/lib/frame-runtime';
import {mediaTime} from '@/lib/frame-runtime/math';
import {Media,type MediaProps} from '@/lib/frame-runtime/media';
import {useNativeSources} from './NativeSourceProvider';
import {nativeSampleTime} from './source-time';
export function NativeSourceVideo(props:MediaProps){
 const state=useFrameState(),sources=useNativeSources()!,id=useId(),canvas=useRef<HTMLCanvasElement>(null);
 const trim=(props.trimBefore??props.startFrom??0)/state.fps,end=(props.trimAfter??props.endAt??Infinity)/state.fps;
 let time=props.sourceTimeSeconds??mediaTime(state.frame,state.fps,props.trimBefore??props.startFrom??0,props.playbackRate??1);
 if(props.loop&&Number.isFinite(end)&&end>trim)time=trim+Math.max(0,time-trim)%(end-trim);
 time=nativeSampleTime(Math.max(trim,Math.min(time,end-.00001)),end,state.fps,props.previewProxyFps??null);
 useLayoutEffect(()=>{
  if(state.premounted)return;
  // Each mounted instance owns a source clock, even when URL/title are shared.
  // Sharing by source made layered textures repeatedly seek one decoder backward.
  sources.sources.set(id,{id,decoderId:id,source:props.src,time,alpha:props.transparent===true||/\.webm(?:\?|$)/.test(props.src),loop:props.loop?{start:trim,end:Number.isFinite(end)?end:undefined}:undefined,canvas:canvas.current!});
  return()=>{sources.sources.delete(id);};
 },[sources,id,props.title,props.src,props.transparent,props.loop,trim,end,time,state.premounted]);
 return <><canvas ref={canvas} data-native-source="true" title={props.title} style={props.style}/>{state.rendering&&!props.muted&&<Media {...props} kind="audio" style={{display:'none'}}/>}</>;
}
