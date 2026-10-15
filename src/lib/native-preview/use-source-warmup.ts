'use client';
import {useEffect,useRef} from 'react';
import type {CompositionElement} from '../render/composition-adapters';
import {nativeWarmupSources} from './warmup-plan';
export function useNativeSourceWarmup(projectId:string,elements:CompositionElement[],frame:number,fps:number){
 const warmed=useRef(new Set<string>()),session=useRef(crypto.randomUUID()),bucket=Math.floor(frame/fps*4)/4;
 useEffect(()=>{warmed.current.clear();},[projectId,elements]);
 useEffect(()=>{
  const sources=nativeWarmupSources(elements,bucket,warmed.current);if(!sources.length)return;
  const abort=new AbortController();
  void fetch(`/api/projects/${encodeURIComponent(projectId)}/native-frames`,{method:'POST',signal:abort.signal,headers:{'content-type':'application/json'},body:JSON.stringify({session:session.current,maxDimension:16,frames:[],warmSources:sources})}).then(response=>{
   if(response.ok&&!abort.signal.aborted){for(const source of sources){if(warmed.current.size>=64)warmed.current.delete(warmed.current.values().next().value!);warmed.current.add(source);}}
  }).catch(()=>{});
  return()=>abort.abort();
 },[projectId,elements,bucket]);
}
