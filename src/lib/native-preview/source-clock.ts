import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const cache=new Map<string,number[]>(),pending=new Map<string,Promise<number[]>>();
const presentationEnds=new WeakMap<number[],number>();
const MAX_VALUES=4_000_000;let values=0;
export function sourceClockFromProbe(probe:any,kind:'packets'|'frames'):number[]{
 const origin=Number(probe.format?.start_time??0),items=probe[kind];
 if(!Number.isFinite(origin)||!Array.isArray(items)||!items.length||items.length>1_080_001)throw Error('Invalid native source clock');
 if(kind==='packets'&&items.some((entry:any)=>String(entry.flags??'').includes('D')))throw Error('Discarded packets require a decoded source clock');
 const times=items.map((entry:any)=>Number(entry[kind==='packets'?'pts_time':'best_effort_timestamp_time'])-origin);
 if(times.some(t=>!Number.isFinite(t)))throw Error('Invalid native source timestamp');
 if(kind==='packets')times.sort((a,b)=>a-b);
 if(times.some((t,i)=>i>0&&(kind==='packets'?t<=times[i-1]:t<times[i-1])))throw Error('Unordered native source clock');
 const declared=Number(probe.streams?.[0]?.nb_frames);
 if(kind==='packets'&&Number.isFinite(declared)&&declared!==times.length)throw Error('Ambiguous packet clock');
 let end=0;
 for(const entry of items){
  const duration=Number(entry.duration_time??entry.pkt_duration_time);
  const pts=Number(entry[kind==='packets'?'pts_time':'best_effort_timestamp_time'])-origin;
  if(Number.isFinite(duration)&&duration>0)end=Math.max(end,pts+duration);
 }
 presentationEnds.set(times,end);
 Object.freeze(times);
 return times;
}
/** Some reordered streams declare an end before their last displayed frame ends. */
export function nativeSourceDuration(times:number[],reportedDuration:number){
 return Math.max(reportedDuration,presentationEnds.get(times)??0);
}
export function nativeClockPosition(times:number[],time:number){
 let low=0,high=times.length;
 while(low<high){const mid=(low+high)>>>1;if(times[mid]<=time+.000001)low=mid+1;else high=mid;}
 const source_index=Math.max(0,low-1);
 return {source_index,source_pts:times[source_index]};
}
/** Bounded immutable timestamp indexes shared by staging workers, never decoder state. */
export async function nativeSourceClock(file:string,identity:string):Promise<number[]>{
 const key=`${file}:${identity}`,hit=cache.get(key);if(hit){cache.delete(key);cache.set(key,hit);return hit;}
 const existing=pending.get(key);if(existing)return existing;
 if(pending.size>=8)throw Error('Native source inspection limit reached');
 const job=(async()=>{
  const inspect=async(kind:'packet'|'frame')=>JSON.parse((await run('ffprobe',['-v','error','-select_streams','v:0','-show_entries',`${kind}=${kind==='packet'?'pts_time,duration_time,flags':'best_effort_timestamp_time,duration_time,pkt_duration_time'}:stream=codec_name,nb_frames:format=start_time`,'-of','json',file],{timeout:30000,maxBuffer:64*1024*1024})).stdout);
  let times:number[]|undefined;
  try{const probe=await inspect('packet');if(['h264','hevc','vp8','vp9','rawvideo','png','mjpeg'].includes(probe.streams?.[0]?.codec_name))times=sourceClockFromProbe(probe,'packets');}catch{/* Ambiguous packet clocks require the decoded-frame oracle. */}
  times??=sourceClockFromProbe(await inspect('frame'),'frames');
  while(cache.size>=64||values+times.length>MAX_VALUES){const first=cache.keys().next().value;if(first===undefined)break;values-=cache.get(first)!.length;cache.delete(first);}
  cache.set(key,times);values+=times.length;return times;
 })();pending.set(key,job);
 try{return await job;}finally{pending.delete(key);}
}
