'use client';
import {createContext,useContext,useLayoutEffect,useRef,type ReactNode} from 'react';
import {useFrameState} from '@/lib/frame-runtime';
import {decodeFramePacket} from './frame-packet';
import {NativeSourceQueue} from './source-queue';
import {collectNativeSourceBatches} from './source-batches';
type Source={id:string;decoderId:string;source:string;time:number;alpha:boolean;loop?:{start:number;end?:number};canvas:HTMLCanvasElement};
type Sources={sources:Map<string,Source>};
export const NativeSourcesContext=createContext<Sources|null>(null);
/** Settled frame source stage, before any effect draws. Export never falls back. */
export function NativeSourceProvider({projectId,children}:{projectId:string;children:ReactNode}){
 const state=useFrameState(),session=useRef(crypto.randomUUID()),owner=useRef<Sources>({sources:new Map()}),flight=useRef(new NativeSourceQueue()),lease=useRef(0);
 useLayoutEffect(()=>{
  const key=`native-sources:${session.current}`,generation=++lease.current;
  state.session.sourceDraws.set(key,()=>{
   const work=flight.current.run(async()=>{
   const sources=[...owner.current.sources.values()];if(!sources.length)return;
   for(const source of sources){if(/^https?:/.test(source.source)&&new URL(source.source).origin!==window.location.origin)throw Error('Rust decoding requires imported local media');}
   const decoded=await collectNativeSourceBatches(sources,async batch=>{
   const response=await fetch(`/api/projects/${encodeURIComponent(projectId)}/native-frames`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({session:session.current,rendering:state.rendering,maxDimension:Math.min(4096,Math.max(16,state.width,state.height)),frames:batch.map(({id,decoderId,source,time,alpha,loop})=>({id,decoderId,loop,source:source.startsWith('http')?new URL(source).pathname:source,time,alpha}))})});
   if(!response.ok)throw Error(await response.text());
   return decodeFramePacket(new Uint8Array(await response.arrayBuffer()),batch.map(s=>s.id));
   });
   // Validate every context before changing any source surface.
   const contexts=sources.map(s=>{const ctx=s.canvas.getContext('2d');if(!ctx)throw Error('Native source canvas unavailable');return ctx;});
   for(let i=0;i<decoded.length;i++){const f=decoded[i],canvas=sources[i].canvas;if(canvas.width!==f.width)canvas.width=f.width;if(canvas.height!==f.height)canvas.height=f.height;contexts[i].putImageData(new ImageData(new Uint8ClampedArray(f.pixels.buffer as ArrayBuffer,f.pixels.byteOffset,f.pixels.byteLength),f.width,f.height),0,0);canvas.dataset.nativeSourceTime=String(sources[i].time);}
   });return work;
  });return()=>{
   state.session.sourceDraws.delete(key);
   void flight.current.run(async()=>{
    // StrictMode cleanup/re-setup keeps the same lease alive.
    if(lease.current!==generation)return;
    await fetch(`/api/projects/${encodeURIComponent(projectId)}/native-frames`,{method:'DELETE',headers:{'content-type':'application/json'},body:JSON.stringify({session:session.current}),keepalive:true}).catch(()=>{});
   });
  };
 },[projectId,state.session,state.width,state.height,state.rendering]);
 return <NativeSourcesContext.Provider value={owner.current}>{children}</NativeSourcesContext.Provider>;
}
export const useNativeSources=()=>useContext(NativeSourcesContext);
