/// <reference types="@webgpu/types" />
import type {ColorGradeFilterDescriptor} from '../timeline/color-grade';
import {GPU_GRADE_TRANSFER_BYTES,gpuGradeTransferTables} from './color-grade';
/** At most one small byte-transfer table set per admitted layer. Identity stages
 * share a dummy binding; unchanged descriptors avoid repeat uploads. */
export class GpuGradeTables {
 readonly identity:GPUBuffer;
 private slots:Array<{key:string;buffer:GPUBuffer}|undefined>=[];
 private closed=false;
 constructor(private readonly device:Pick<GPUDevice,'createBuffer'|'queue'>){
  this.identity=device.createBuffer({size:16,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
  try{device.queue.writeBuffer(this.identity,0,new Float32Array(4));}catch(error){this.identity.destroy();throw error;}
 }
 prepare(grades:readonly (ColorGradeFilterDescriptor|null|undefined)[],glows:readonly number[]=grades.map(()=>0)){
  if(this.closed)throw Error('GPU grade tables closed');
  if(glows.length!==grades.length||!glows.every(v=>Number.isFinite(v)&&v>=0&&v<=3))throw Error('Invalid GPU glow transfer');
  if(grades.length>64)throw Error('Too many GPU grade layers');
  for(let i=grades.length;i<this.slots.length;i++)this.slots[i]?.buffer.destroy();
  this.slots.length=grades.length;
  return grades.map((grade,i)=>{
   const old=this.slots[i];
   const glow=glows[i];
   if(!grade&&!glow){old?.buffer.destroy();this.slots[i]=undefined;return this.identity;}
   const key=JSON.stringify([grade,glow]);
   if(old?.key===key)return old.buffer;
   const values=gpuGradeTransferTables(grade,glow);
   if(values.byteLength!==GPU_GRADE_TRANSFER_BYTES||!values.every(Number.isFinite))throw Error('Invalid GPU grade table');
   const buffer=this.device.createBuffer({size:GPU_GRADE_TRANSFER_BYTES,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST});
   try{this.device.queue.writeBuffer(buffer,0,values);}catch(error){buffer.destroy();throw error;}
   old?.buffer.destroy();this.slots[i]={key,buffer};return buffer;
  });
 }
 get bytes(){return (this.closed?0:16)+this.slots.filter(Boolean).length*GPU_GRADE_TRANSFER_BYTES;}
 close(){if(this.closed)return;this.closed=true;this.identity.destroy();for(const slot of this.slots)slot?.buffer.destroy();this.slots=[];}
}
