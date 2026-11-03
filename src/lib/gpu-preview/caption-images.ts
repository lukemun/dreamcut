import {FrameStore,type FrameLease} from './frame-store';

/** Reject oversized image headers before invoking the browser decoder. */
export function captionImageDimensions(data:Uint8Array,type:string){
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength);
 if(type==='image/png'&&data.length>=33&&[137,80,78,71,13,10,26,10].every((value,i)=>data[i]===value)&&view.getUint32(8)===13&&view.getUint32(12)===0x49484452){
  for(let offset=8;offset+12<=data.length;){
   const length=view.getUint32(offset);if(length>data.length-offset-12)throw Error('Truncated caption PNG');
   if(view.getUint32(offset+4)===0x6163544c)throw Error('Animated caption images require a prepared still');
   offset+=length+12;
  }
  return {width:view.getUint32(16),height:view.getUint32(20)};
 }
 if(type==='image/jpeg'&&data[0]===255&&data[1]===216){
  for(let offset=2;offset<data.length;){
   if(data[offset++]!==255)break;
   while(data[offset]===255)offset++;
   const marker=data[offset++];if(marker===0xd9||marker===0xda)break;
   if(marker===0x01||(marker>=0xd0&&marker<=0xd7))continue;
   if(offset+2>data.length)break;const length=view.getUint16(offset);
   if(length<2||offset+length>data.length)break;
   if([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf].includes(marker)&&length>=8)return {width:view.getUint16(offset+5),height:view.getUint16(offset+3)};
   offset+=length;
  }
 }
 throw Error('Caption image requires a valid PNG or JPEG header');
}

/** Self-contained image bytes for browser-shaped text rasters. Session-owned,
 * streamed under a per-source cap and retained under a separate byte budget. */
export class GpuCaptionImages {
 private readonly store:FrameStore<string>;
 private readonly pending=new Map<string,Promise<void>>();
 private readonly abort=new AbortController();
 private active=0;
 private queue:Array<()=>void>=[];
 constructor(budgetBytes=16*1024*1024,private readonly sourceLimit=4*1024*1024,private readonly timeoutMs=15000){if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw Error('Invalid caption image timeout');if(!Number.isSafeInteger(sourceLimit)||sourceLimit<1)throw Error('Invalid caption image source budget');this.store=new FrameStore(budgetBytes);}
 get bytes(){return this.store.bytes;}
 private async fetch(url:string){
  if(this.active>=2)await new Promise<void>(resolve=>this.queue.push(resolve));
  else this.active++;
  const deadline=new AbortController();
  const timer=setTimeout(()=>deadline.abort(new DOMException('Caption image fetch timed out','TimeoutError')),this.timeoutMs);
  try{
   const signal=AbortSignal.any([this.abort.signal,deadline.signal]);signal.throwIfAborted();
   const response=await globalThis.fetch(url,{signal,cache:'no-store'});
   const type=response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
   if(!response.ok||!type||!['image/png','image/jpeg'].includes(type)){
    await response.body?.cancel();throw Error('Caption image is unavailable or has an unsupported format');
   }
   if(Number(response.headers.get('content-length'))>this.sourceLimit){await response.body?.cancel();throw Error('Caption image exceeds its encoded budget');}
   const reader=response.body?.getReader();if(!reader)throw Error('Caption image response has no body');
   let total=0;const chunks:Uint8Array[]=[];
   try{for(;;){signal.throwIfAborted();const item=await reader.read();if(item.done)break;total+=item.value.byteLength;if(total>this.sourceLimit)throw Error('Caption image exceeds its encoded budget');chunks.push(item.value);}}
   finally{await reader.cancel();reader.releaseLock();}
   signal.throwIfAborted();
   const data=new Uint8Array(total);let offset=0;for(const chunk of chunks){data.set(chunk,offset);offset+=chunk.length;}
   const dimensions=captionImageDimensions(data,type);
   if(dimensions.width<1||dimensions.height<1||dimensions.width*dimensions.height*4>16*1024*1024)throw Error('Caption image exceeds its decoded budget');
   const blob=new Blob([data],{type});const bitmap=await createImageBitmap(blob);
   try{if(bitmap.width*bitmap.height*4>16*1024*1024)throw Error('Caption image exceeds its decoded budget');}finally{bitmap.close();}
   signal.throwIfAborted();
   let binary='';for(let i=0;i<data.length;i+=16384)binary+=String.fromCharCode(...data.subarray(i,i+16384));
   const value=`data:${type};base64,${btoa(binary)}`;
   if(!this.store.put({sourceKey:url,timestampUs:0,durationUs:1,bytes:value.length*2,value,release(){}}))throw Error('Caption image cache budget exceeded or session closed');
  }finally{clearTimeout(timer);const next=this.queue.shift();if(next)next();else this.active--;}
 }
 async acquire(url:string,signal:AbortSignal):Promise<FrameLease<string>>{
  signal.throwIfAborted();this.abort.signal.throwIfAborted();
  const hit=this.store.acquire(url,0);if(hit)return hit;
  let pending=this.pending.get(url);
  if(!pending){pending=this.fetch(url).finally(()=>this.pending.delete(url));this.pending.set(url,pending);}
  await pending;signal.throwIfAborted();
  const lease=this.store.acquire(url,0);if(!lease)throw Error('Caption image could not be retained');return lease;
 }
 close(){this.abort.abort();this.store.close();}
}
