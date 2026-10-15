import test from 'node:test';
import assert from 'node:assert/strict';
import {drawLutFrame,lutSourceScale} from '../remotion/LutCanvasFilter';
import {buildColorGradeFilterDescriptor,IDENTITY_COLOR_GRADE} from '../timeline/color-grade';
const lut={title:null,size:2,domainMin:[0,0,0] as const,domainMax:[1,1,1] as const,data:Array(24).fill(.5)};
const grade=buildColorGradeFilterDescriptor(IDENTITY_COLOR_GRADE,{includeIdentity:true})!;
test('LUT source sampling preserves wide and portrait media with centered contain geometry',()=>{
 assert.deepEqual(lutSourceScale(320,320,320,180),[1,.5625]);
 assert.deepEqual(lutSourceScale(320,320,180,320),[.5625,1]);
 assert.deepEqual(lutSourceScale(320,180,640,360),[1,1]);
 assert.deepEqual(lutSourceScale(320,180,320,180),[1,1]);
});
function fixture(fail?:string){
 const live=new Set<object>();let created=0;
 const create=()=>{const resource={};live.add(resource);created++;return resource;};
 const remove=(value:object)=>{assert.ok(live.delete(value),'resource destroyed once');};
 const gl=new Proxy({VERTEX_SHADER:1,FRAGMENT_SHADER:2,NO_ERROR:0,
  createShader:create,createProgram:create,createBuffer:create,createTexture:create,
  deleteShader:remove,deleteProgram:remove,deleteBuffer:remove,deleteTexture:remove,
  getShaderParameter:()=>fail!=='compile',getShaderInfoLog:()=> 'compile failed',getProgramParameter:()=>true,getUniformLocation:()=>({}),getAttribLocation:()=>0,getError:()=>0,
  texImage3D:()=>{if(fail==='upload')throw Error('upload failed');},
 } as Record<string,unknown>,{get(target,key){return key in target?target[String(key)]:()=>{};}});
 const canvas={width:8,height:8,getContext:()=>gl} as unknown as HTMLCanvasElement;
 return {canvas,live,get created(){return created;}};
}
test('Standard LUT frame releases temporary WebGL resources on every successful draw',()=>{
 const f=fixture();for(let i=0;i<4;i++){drawLutFrame(f.canvas,{} as HTMLCanvasElement,lut,grade,.5);assert.equal(f.live.size,0);}
 assert.equal(f.created,24);
});
test('Standard LUT upload and shader failures release partial allocations',()=>{
 for(const failure of ['upload','compile']){
  const f=fixture(failure);assert.throws(()=>drawLutFrame(f.canvas,{} as HTMLCanvasElement,lut,grade,1),/failed/);
  assert.equal(f.live.size,0);
 }
});
