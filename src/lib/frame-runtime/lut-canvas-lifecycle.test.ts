import test from 'node:test';
import assert from 'node:assert/strict';
import {drawGradeFrame,gradeSourceScale,releaseGradeCanvas} from '../remotion/GradeCanvasFilter';
import {buildColorGradeFilterDescriptor,IDENTITY_COLOR_GRADE} from '../timeline/color-grade';
const lut={title:null,size:2,domainMin:[0,0,0] as const,domainMax:[1,1,1] as const,data:Array(24).fill(.5)};
const grade=buildColorGradeFilterDescriptor(IDENTITY_COLOR_GRADE,{includeIdentity:true})!;
test('grade source sampling preserves wide and portrait media with centered contain geometry',()=>{
 assert.deepEqual(gradeSourceScale(320,320,320,180),[1,.5625]);
 assert.deepEqual(gradeSourceScale(320,320,180,320),[.5625,1]);
 assert.deepEqual(gradeSourceScale(320,180,640,360),[1,1]);
 assert.deepEqual(gradeSourceScale(320,180,320,180),[1,1]);
});
function fixture(fail?:string){
 const live=new Set<object>();let created=0,lutUploads=0;
 const create=()=>{const resource={};live.add(resource);created++;return resource;};
 const remove=(value:object)=>{assert.ok(live.delete(value),'resource destroyed once');};
 const gl=new Proxy({VERTEX_SHADER:1,FRAGMENT_SHADER:2,NO_ERROR:0,TEXTURE_2D:10,TEXTURE_3D:11,
  createShader:create,createProgram:create,createBuffer:create,createTexture:create,
  deleteShader:remove,deleteProgram:remove,deleteBuffer:remove,deleteTexture:remove,
  getShaderParameter:()=>fail!=='compile',getShaderInfoLog:()=> 'compile failed',getProgramParameter:()=>true,getUniformLocation:()=>({}),getAttribLocation:()=>0,getError:()=>0,
  // The first 3D upload is the placeholder made with the canvas; the second is the creative LUT.
  texImage3D:()=>{if(fail==='upload'&&lutUploads===1)throw Error('upload failed');lutUploads++;},
 } as Record<string,unknown>,{get(target,key){return key in target?target[String(key)]:()=>{};}});
 const canvas={width:8,height:8,getContext:()=>gl} as unknown as HTMLCanvasElement;
 return {canvas,live,get created(){return created;},get lutUploads(){return lutUploads;}};
}
test('Standard grade keeps one program and texture set per canvas and frees them on release',()=>{
 const f=fixture();
 for(let i=0;i<4;i++)drawGradeFrame(f.canvas,{} as HTMLCanvasElement,grade,{parsed:lut,intensity:.5});
 // program + 2 shaders (deleted after link) + buffer + source, atlas and LUT textures
 assert.equal(f.created,7,'created once, reused across draws');
 assert.equal(f.lutUploads,2,'placeholder at creation, the cube once');
 assert.equal(f.live.size,5);
 releaseGradeCanvas(f.canvas);
 assert.equal(f.live.size,0);
 releaseGradeCanvas(f.canvas);
});
test('Standard grade shader and upload failures release partial allocations',()=>{
 for(const failure of ['upload','compile']){
  const f=fixture(failure);assert.throws(()=>drawGradeFrame(f.canvas,{} as HTMLCanvasElement,grade,{parsed:lut,intensity:1}),/failed/);
  assert.equal(f.live.size,0);
 }
});
