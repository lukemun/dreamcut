"use client";
import {useEffect,useMemo,useRef,useState,useSyncExternalStore} from 'react';
import {type PreparedPreviewInput,type PreparedPreviewStatus} from '@/lib/timeline/prepared-preview';
import {activePreviewRun,prioritizePreviewRanges} from '@/lib/timeline/preview-cache-plan';
import {PreparedPreviewPool} from './prepared-preview-pool';
async function request(project:string,method:string,id?:string,body?:unknown){
  const response=await fetch(`/api/projects/${encodeURIComponent(project)}/prepared-preview${id?`?id=${id}`:''}`,{method,cache:'no-store',...(body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
  const result=await response.json();if(!response.ok)throw new Error(result.error??'Preview preparation failed');return result;
}
/** Picture identities retain their lease while another proposal is being compared. */
export function usePreparedPlayback(projectId:string,input:PreparedPreviewInput,enabled:boolean) {
  const [pool]=useState(()=>new PreparedPreviewPool({start:(project,owner,input,sequence)=>request(project,'POST',undefined,{owner,input,sequence}),status:(project,id)=>request(project,'GET',id),cancel:(project,id)=>request(project,'DELETE',id)}));
  useSyncExternalStore(pool.subscribe,pool.snapshot,pool.snapshot);
  useEffect(()=>{if(!enabled)pool.dispose();},[enabled,pool]);
  const key=pool.key(projectId,input),lifetime=useRef(0);
  // Debounce only a genuinely new picture. Returning to a retained version is
  // ready synchronously and neither releases its URL nor restarts its decoder.
  const everRequested=useRef(false);
  useEffect(()=>{
    if(!enabled)return;
    pool.retainPending([key]);
    if(pool.get(key)){pool.ensure(projectId,input);return;}
    const timer=setTimeout(()=>{everRequested.current=true;pool.ensure(projectId,input);},everRequested.current?180:0);
    return()=>clearTimeout(timer);
  },[key,enabled,pool,projectId]);
  useEffect(()=>{lifetime.current++;return()=>{const generation=++lifetime.current;queueMicrotask(()=>{if(lifetime.current===generation)pool.dispose();});};},[pool]);
  const status:PreparedPreviewStatus|null=enabled?pool.get(key):null;
  return {status,blocked:enabled&&status?.state!=='ready',retry:()=>pool.retry(key)};
}

export type PreparedPlaybackBlock={range:[number,number];url?:string;status:PreparedPreviewStatus|null};
/** Retain a few complete proposal variants, schedule nearby hotspots before distant ones. */
export function usePreparedPlaybackBlocks(projectId:string,input:PreparedPreviewInput,ranges:[number,number][],frame:number,enabled:boolean,prepareWholeEffect=false) {
  const [pool]=useState(()=>new PreparedPreviewPool({start:(project,owner,input,sequence)=>request(project,'POST',undefined,{owner,input,sequence}),status:(project,id)=>request(project,'GET',id),cancel:(project,id)=>request(project,'DELETE',id)},64));
  useSyncExternalStore(pool.subscribe,pool.snapshot,pool.snapshot);
  useEffect(()=>{if(!enabled)pool.dispose();},[enabled,pool]);
  const requests=useMemo(()=>ranges.map(range=>({...input,frameRange:range})),[input,ranges]);
  const keys=useMemo(()=>requests.map(value=>pool.key(projectId,value)),[requests,pool,projectId]);
  const identity=useMemo(()=>JSON.stringify(keys),[keys]),lifetime=useRef(0),everRequested=useRef(false);
  useEffect(()=>{
    if(!enabled)return;
    pool.retainPending(keys);
    const ordered=prioritizePreviewRanges(ranges,frame).map(index=>requests[index]);
    const start=()=>{everRequested.current=true;ordered.forEach(value=>pool.ensure(projectId,value));};
    if(keys.every(key=>pool.get(key))){start();return;}
    const timer=setTimeout(start,everRequested.current?180:0);return()=>clearTimeout(timer);
  },[identity,enabled,projectId,pool]);
  useEffect(()=>{lifetime.current++;return()=>{const generation=++lifetime.current;queueMicrotask(()=>{if(lifetime.current===generation)pool.dispose();});};},[pool]);
  const priorityBucket=Math.floor(frame/Math.max(1,input.fps));
  useEffect(()=>{if(enabled)pool.prioritize(prioritizePreviewRanges(ranges,frame).map(index=>keys[index]));},[identity,priorityBucket,enabled,pool]);
  const blocks:PreparedPlaybackBlock[]=ranges.map((range,index)=>{const status=enabled?pool.get(keys[index]):null;return {range,status,url:status?.state==='ready'?status.url:undefined};});
  const active=blocks.find(block=>frame>=block.range[0]&&frame<=block.range[1]);
  const required=prepareWholeEffect?activePreviewRun(ranges,frame).map(index=>blocks[index]):active?[active]:[];
  const blocking=required.find(block=>!block.url);
  const pending=blocks.filter(block=>!block.url);
  const status=blocking?blocking.status:pending[0]?.status??blocks[0]?.status??null;
  return {blocks,status,blocked:enabled&&!!blocking,retry:()=>pending.forEach(block=>{const index=blocks.indexOf(block);pool.retry(keys[index]);})};
}
