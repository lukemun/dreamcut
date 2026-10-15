"use client";
/** Synthetic runtime instrument. Never reads or changes a project. */
import {isAudioElementType} from '@/lib/timeline/animation-presets';
import {useCallback,useEffect,useRef,useState} from 'react';
import {flushSync} from 'react-dom';
import {Player,type PlayerRef} from '@/lib/frame-runtime/player';
import {GpuPlaybackComposition} from '@/components/studio/timeline/GpuPlaybackComposition';
import {NativePlaybackComposition} from '@/components/studio/timeline/NativePlaybackComposition';
import {nativePreviewAudioElements} from '@/lib/native-preview/preview-audio';
import {TimelineComposition} from '@/lib/remotion/TimelineComposition';
import {TimelinePreviewAudioMixer} from '@/components/studio/timeline/TimelinePreviewAudioMixer';
import type {CompositionElement} from '@/lib/render/composition-adapters';
type Config={gpu?:boolean;width?:number;height?:number;nativeProjectId?:string;elements:CompositionElement[];durationInFrames:number;mixed?:boolean;laneOrderKeys?:string[]};
type WaitEvent={type:"waiting"|"resume";atMs:number;frame:number;gpuFrame:number|null;mediaReady:Array<{time:number;ready:number;seeking:boolean}>};
declare global {interface Window {__dreamcutPlayback?: {load(config:Config):void;play():void;pause():void;seek(frame:number):void;rate(value:number):void;snapshot():{frame:number;playing:boolean;nodes:number;loads:number;seeks:number;waits:number;resumes:number;waitEvents:WaitEvent[];gpuFrame:number|null;gpuPresentation:unknown;nativeFrame:number|null;nativeError:string|null;media:Array<{time:number;rate:number;seeks:number;ready:number;seeking:boolean;paused:boolean}>}}}}
export default function PlaybackProof(){
 const [config,setConfig]=useState<Config|null>(null), player=useRef<PlayerRef>(null), root=useRef<HTMLDivElement>(null);
 const [attachedPlayer,setAttachedPlayer]=useState<PlayerRef|null>(null);
 const attach=useCallback((value:PlayerRef|null)=>{player.current=value;setAttachedPlayer(value);},[]);
 const [nativeError,setNativeError]=useState<string|null>(null);
 const seekCounts=useRef(new WeakMap<EventTarget,number>());
 const waitEvents=useRef<WaitEvent[]>([]);
 const counters=useRef({loads:0,seeks:0,waits:0,resumes:0});
 useEffect(()=>{
  const recordWait=(type:WaitEvent['type'])=>{
   const state=window.__dreamcutPlayback?.snapshot();if(!state)return;
   waitEvents.current.push({type,atMs:performance.now(),frame:state.frame,gpuFrame:state.gpuFrame,mediaReady:state.media.map(({time,ready,seeking})=>({time,ready,seeking}))});
   if(waitEvents.current.length>64)waitEvents.current.shift();
  };
  const load=()=>counters.current.loads++,seek=(event:Event)=>{counters.current.seeks++;if(event.target)seekCounts.current.set(event.target,(seekCounts.current.get(event.target)??0)+1);};
  document.addEventListener('loadstart',load,true);document.addEventListener('seeking',seek,true);
  window.__dreamcutPlayback={
   load:value=>{setNativeError(null);flushSync(()=>setConfig(null));counters.current={loads:0,seeks:0,waits:0,resumes:0};waitEvents.current=[];flushSync(()=>setConfig(value));
    player.current!.addEventListener('waiting',()=>{counters.current.waits++;recordWait('waiting');});player.current!.addEventListener('resume',()=>{counters.current.resumes++;recordWait('resume');});},
   rate:value=>player.current!.setPlaybackRate(value),
   play:()=>player.current!.play(),pause:()=>player.current!.pause(),seek:frame=>player.current!.seekTo(frame),
   snapshot:()=>({frame:player.current?.getCurrentFrame()??0,playing:player.current?.isPlaying()??false,nodes:root.current?.querySelectorAll('video').length??0,...counters.current,waitEvents:[...waitEvents.current],gpuFrame:root.current?.querySelector('[data-gpu-preview-frame]')?.getAttribute('data-gpu-preview-frame')!=null?Number(root.current?.querySelector('[data-gpu-preview-frame]')?.getAttribute('data-gpu-preview-frame')):null,gpuPresentation:JSON.parse(root.current?.querySelector('[data-gpu-presentation]')?.getAttribute('data-gpu-presentation')??'null'),nativeFrame:root.current?.querySelector('[data-native-preview-frame]')?.getAttribute('data-native-preview-frame')!=null?Number(root.current?.querySelector('[data-native-preview-frame]')?.getAttribute('data-native-preview-frame')):null,nativeError:root.current?.querySelector('[data-native-error]')?.textContent??null,media:[...root.current?.querySelectorAll<HTMLMediaElement>('video')??[],...root.current?.querySelectorAll<HTMLMediaElement>('audio')??[]].map(v=>({time:v.currentTime,rate:v.playbackRate,seeks:seekCounts.current.get(v)??0,ready:v.readyState,seeking:v.seeking,paused:v.paused}))})
  };
  return()=>{delete window.__dreamcutPlayback;document.removeEventListener('loadstart',load,true);document.removeEventListener('seeking',seek,true);};
 },[]);
 const live=config?{elements:(config.mixed||config.gpu)?config.elements.filter(e=>!isAudioElementType(e.type)):config.elements,laneOrderKeys:config.laneOrderKeys??['visual_0'],externalAudioPreview:Boolean(config.gpu||config.nativeProjectId||config.mixed)}:null;
 return <div ref={root}>{nativeError&&<div data-native-error>{nativeError}</div>}{config&&(config.gpu||config.mixed||config.nativeProjectId)&&<TimelinePreviewAudioMixer elements={config.gpu||config.nativeProjectId?nativePreviewAudioElements(config.elements):config.elements} player={attachedPlayer}/>}{config&&<Player ref={attach} component={(config.gpu?GpuPlaybackComposition:config.nativeProjectId?NativePlaybackComposition:TimelineComposition) as typeof TimelineComposition} inputProps={(config.gpu?{live,onFailure:setNativeError}:config.nativeProjectId?{live,projectId:config.nativeProjectId,onFailure:setNativeError}:live) as any} compositionWidth={config.width??160} compositionHeight={config.height??160} durationInFrames={config.durationInFrames} fps={30} style={{width:config.width?360:160,height:(config.width?360:160)*(config.height??160)/(config.width??160)}}/>}</div>;
}
