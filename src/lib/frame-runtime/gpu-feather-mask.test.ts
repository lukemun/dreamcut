import test from 'node:test';
import assert from 'node:assert/strict';
import {gpuFeatherMask,gpuRotatedLineMask} from '../gpu-preview/feather-mask';

test('feather mask preserves untouched edges and uses composition pixels',()=>{
 assert.deepEqual(gpuFeatherMask({top:.2,right:.1,bottom:.2,left:.1},.1,100),[20,80,10,3]);
 assert.deepEqual(gpuFeatherMask({top:.4,right:0,bottom:0,left:0},.1,200),[80,200,20,1]);
 assert.deepEqual(gpuFeatherMask({top:0,right:0,bottom:.4,left:0},.1,200),[0,120,20,2]);
 assert.equal(gpuFeatherMask({top:0,right:.2,bottom:0,left:.2},.1,100),undefined);
});
test('feather width cannot cross the midpoint or replace a hard-mask identity',()=>{
 const mask={top:.4,right:0,bottom:.4,left:0};
 const value=gpuFeatherMask(mask,.5,100)!;
 assert.ok(Math.abs(value[2]-10)<1e-10);
 assert.equal(gpuFeatherMask(mask,0,100),undefined);
 assert.equal(gpuFeatherMask({top:.5,right:0,bottom:.5,left:0},.1,100),undefined);
 assert.throws(()=>gpuFeatherMask(mask,.1,0),/canvas/);
});


test('rotated line mask retains its canvas center boundary and reverses the opaque side',()=>{
 const mask={top:.5,right:0,bottom:0,left:0};
 const top=gpuRotatedLineMask(mask,.1,90,200,100)!;
 const bottom=gpuRotatedLineMask({...mask,top:0,bottom:.5},.1,90,200,100)!;
 const distance=(m:readonly number[],x:number,y:number)=>m[0]*x+m[1]*y-m[2];
 assert.ok(Math.abs(distance(top,100,50))<1e-10);
 assert.ok(distance(top,90,50)>9.99);
 assert.ok(distance(bottom,90,50)<-9.99);
 assert.equal(top[3],10);assert.equal(bottom[3],10);
 assert.equal(gpuRotatedLineMask(mask,0,35,200,100)?.[3],0);
 assert.equal(gpuRotatedLineMask(mask,.1,0,200,100),undefined);
 assert.equal(gpuRotatedLineMask({...mask,left:.1},.1,35,200,100),undefined);
 assert.equal(gpuRotatedLineMask({...mask,bottom:.1},.1,35,200,100),undefined);
 assert.throws(()=>gpuRotatedLineMask(mask,.1,35,0,100),/canvas/);
});

test('rounded crop radius follows the crop window shorter side and keeps square crops untouched',async()=>{
 const {gpuRoundedMask}=await import('../gpu-preview/feather-mask');
 // 1920x1080, 360 px square 40 px from the bottom-left corner.
 const mask={top:680/1080,right:1520/1920,bottom:40/1080,left:40/1920};
 const plan=gpuRoundedMask(mask,0,.5,1920,1080)!;
 plan.forEach((v,i)=>assert.ok(Math.abs(v-[220,860,180,180,180,0][i]!)<1e-9,`plan[${i}]`));
 // Wide crop: 0.25 roundness is a quarter of the shorter (height) side.
 assert.ok(Math.abs(gpuRoundedMask({top:.25,right:0,bottom:.25,left:0},0,.25,200,100)![4]-12.5)<1e-9);
 assert.equal(gpuRoundedMask(mask,0,0,1920,1080),undefined);
 assert.equal(gpuRoundedMask({top:.5,right:0,bottom:.5,left:0},0,.5,100,100),undefined);
 assert.throws(()=>gpuRoundedMask(mask,0,.5,0,100),/canvas/);
});
