import {getStoredItem} from '@/lib/persisted-key';
/** Local preparation hints only: never cached pixels or render authority.
 * One origin-wide bounded journal; stores hashes and numeric costs, no media/text. */
type Sample={frame:number;costMs:number;observations:number};
type Entry={key:string;updatedAt:number;samples:Sample[]};
const STORAGE_KEY='dreamcut.gpu-replay-costs.v1';
export async function gpuReplayProfile(projectId:string,inputs:unknown,storage:Pick<Storage,'getItem'|'setItem'>){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({version:1,projectId,inputs})));
 const key=Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
 const read=():Entry[]=>{try{const raw=JSON.parse(getStoredItem(storage,STORAGE_KEY)??'[]');return Array.isArray(raw)?raw.filter((e:Entry)=>e&&typeof e.key==='string'&&Number.isFinite(e.updatedAt)&&Array.isArray(e.samples)).slice(-12):[];}catch{return [];}};
 const samples=new Map<number,Sample>();
 for(const sample of read().find(e=>e.key===key)?.samples??[]){if(Number.isSafeInteger(sample.frame)&&sample.frame>=0&&Number.isFinite(sample.costMs)&&sample.costMs>0&&Number.isSafeInteger(sample.observations)&&sample.observations>0)samples.set(sample.frame,sample);if(samples.size>=256)break;}
 let timer:ReturnType<typeof setTimeout>|undefined;
 const ranked=()=>[...samples.values()].sort((a,b)=>b.costMs-a.costMs||a.frame-b.frame);
 const flush=()=>{if(timer)clearTimeout(timer);timer=undefined;try{const entries=read().filter(e=>e.key!==key);entries.push({key,updatedAt:Date.now(),samples:ranked().slice(0,256)});storage.setItem(STORAGE_KEY,JSON.stringify(entries.slice(-12)));}catch{/* Quota/private mode must not break playback. */}};
 return {seeds:(capacity:number)=>ranked().slice(0,capacity).map(s=>[s.frame,s.costMs] as const),
  record(frame:number,costMs:number){const prior=samples.get(frame);samples.set(frame,{frame,costMs:Math.max(costMs,prior?.costMs??0),observations:(prior?.observations??0)+1});if(samples.size>256)samples.delete(ranked().at(-1)!.frame);if(!timer)timer=setTimeout(flush,1000);},
  close(){if(timer)flush();},key};
}
