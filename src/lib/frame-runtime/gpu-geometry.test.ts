import test from 'node:test';import assert from 'node:assert/strict';
import {quadToGpuTransform,rectToGpuTransform,orientedRectToGpuTransform} from '../gpu-preview/geometry';
import {quadMatrix,quadMatrixValues,type SurfaceQuad} from '../timeline/surface-track';
function project(m:number[],x:number,y:number){const w=m[3]*x+m[7]*y+m[15];return [(m[0]*x+m[4]*y+m[12])/w,(m[1]*x+m[5]*y+m[13])/w];}
test('source mirror occurs before rotation and preserves translated center',()=>{
 const rect={x:20,y:30,width:40,height:20};
 const rotate=orientedRectToGpuTransform(rect,100,100,{degrees:90,mirrorX:1})!;
 const both=orientedRectToGpuTransform(rect,100,100,{degrees:90,mirrorX:-1})!;
 const close=(actual:number[],expected:number[])=>actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-10));
 close(project(rotate,-1,1),[0,.6]);
 close(project(both,-1,1),[0,-.2]);
 close(project(both,0,0),[-.2,.2]);
 assert.deepEqual(orientedRectToGpuTransform(rect,100,100,{degrees:0,mirrorX:1}),rectToGpuTransform(rect,100,100));
});
test('GPU tracked quad reproduces all authored projective corners',()=>{
 const q:SurfaceQuad=[[11,7],[82,18],[94,90],[5,70]],m=quadToGpuTransform(q,100,100)!;
 [[-1,1],[1,1],[1,-1],[-1,-1]].forEach(([x,y],i)=>{const actual=project(m,x,y);assert.ok(Math.abs(actual[0]-(q[i][0]/50-1))<1e-10);assert.ok(Math.abs(actual[1]-(1-q[i][1]/50))<1e-10);});
 assert.deepEqual(quadMatrix(q,1)!.slice(9,-1).split(',').map(Number),quadMatrixValues(q,1));
});
test('rect mapping preserves letterbox dimensions and rejects collapsed planes',()=>{
 const m=rectToGpuTransform({x:0,y:25,width:100,height:50},100,100)!;
 assert.deepEqual(project(m,-1,1),[-1,.5]);assert.deepEqual(project(m,1,-1),[1,-.5]);
 assert.equal(rectToGpuTransform({x:0,y:0,width:0,height:0},100,100),null);
 assert.throws(()=>quadToGpuTransform([[0,0],[1,0],[1,1],[0,1]],0,100),/dimensions/);
});

test('rounded tracked-text storage preserves fractional CSS plane corners and interior glyph positions',()=>{
 const q:SurfaceQuad=[[11,7],[82,18],[94,90],[5,70]];
 const logical=[135.008,89.783] as const,stored=logical.map(Math.ceil);
 const expected=quadToGpuTransform(q,100,100)!;
 const actual=quadToGpuTransform(q,100,100,[stored[0]/logical[0],stored[1]/logical[1]])!;
 for(const [u,v] of [[0,0],[1,0],[1,1],[0,1],[.42,.57]]){
  const point=project(actual,2*u*logical[0]/stored[0]-1,1-2*v*logical[1]/stored[1]);
  const target=project(expected,2*u-1,1-2*v);
  point.forEach((value,i)=>assert.ok(Math.abs(value-target[i])<1e-10));
 }
 assert.throws(()=>quadToGpuTransform(q,100,100,[0,1]),/texture extent/);
 assert.throws(()=>quadToGpuTransform(q,100,100,[1,NaN]),/texture extent/);
});

test('whole-actor animation rotates in pixel space on a portrait canvas and moves its center',async()=>{
 const {groupGpuTransform,gpuGroupParameters}=await import('../gpu-preview/geometry');
 const base=rectToGpuTransform({x:20,y:80,width:60,height:40},100,200)!;
 const group={width:100,height:200,scale:.5,translateX:10,translateY:20,rotateZDeg:90};
 const m=groupGpuTransform(base,group);
 const close=(actual:number[],expected:number[])=>actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-10));
 close(project(m,0,0),[.2,-.2]);
 close(project(m,-1,1),[.4,-.05]);
 close(project(m,1,-1),[0,-.35]);
 const packed=gpuGroupParameters(group);
 assert.equal(packed[0],.5);assert.equal(packed[3],1);assert.deepEqual(packed.slice(4),[10,20,100,200]);
 assert.strictEqual(groupGpuTransform(base,{...group,scale:1,translateX:0,translateY:0,rotateZDeg:0}),base,'Identity must preserve the exact source matrix');
 assert.throws(()=>gpuGroupParameters({...group,scale:0}),/Invalid/);
 assert.throws(()=>gpuGroupParameters({...group,width:Infinity}),/Invalid/);
});
