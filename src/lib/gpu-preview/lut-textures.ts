/// <reference types="@webgpu/types" />
import {cubeLutRgbaBytes,type ParsedCubeLut} from '../timeline/cube-lut';
import {FrameStore,type FrameLease} from './frame-store';
export type GpuLutTexture={texture?:GPUTexture;rgba?:Uint8Array;size:number;domainMin:readonly number[];domainMax:readonly number[]};

/** Session-owned LUT textures. Callers supply immutable content identities and
 * hold a lease until their complete frame has been submitted. Loading belongs
 * to frame preparation, not synchronous command submission. */
export class GpuLutTextures {
 private readonly store:FrameStore<GpuLutTexture>;
 private closed=false;
 constructor(private readonly device:Pick<GPUDevice,'createTexture'|'queue'>,budgetBytes=4*1024*1024,private readonly cpuOnly=false){
  this.store=new FrameStore(budgetBytes);
 }
 get bytes(){return this.store.bytes;}
 acquireCached(contentKey:string){return this.store.acquire(contentKey,0); }
 acquire(contentKey:string,parsed:ParsedCubeLut):FrameLease<GpuLutTexture>{
  if(this.closed)throw Error('GPU LUT textures closed');
  if(!contentKey)throw Error('GPU LUT requires immutable content identity');
  const hit=this.store.acquire(contentKey,0);if(hit)return hit;
  const bytes=cubeLutRgbaBytes(parsed);
  if(bytes.byteLength>this.store.budgetBytes)throw Error('GPU LUT exceeds texture budget');
  // Reserve and evict before allocation, so replacement cannot temporarily
  // exceed the GPU byte budget. The synchronous upload cannot expose this slot.
  let texture:GPUTexture|undefined;
  if(!this.store.put({sourceKey:contentKey,timestampUs:0,durationUs:1,bytes:bytes.byteLength,
   value:{get texture(){return texture;},...(this.cpuOnly?{rgba:bytes}:{}),size:parsed.size,domainMin:[...parsed.domainMin],domainMax:[...parsed.domainMax]},release:()=>texture?.destroy()}))throw Error('GPU LUT texture budget is fully leased');
  try{
   if(this.cpuOnly)return this.store.acquire(contentKey,0)!;
   texture=this.device.createTexture({label:'DreamCut color LUT',dimension:'3d',
    size:[parsed.size,parsed.size,parsed.size],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST});
   this.device.queue.writeTexture({texture},bytes,{bytesPerRow:parsed.size*4,rowsPerImage:parsed.size},[parsed.size,parsed.size,parsed.size]);
  }catch(error){this.store.invalidate(contentKey);throw error;}
  return this.store.acquire(contentKey,0)!;
 }
 close(){if(this.closed)return;this.closed=true;this.store.close();}
}
