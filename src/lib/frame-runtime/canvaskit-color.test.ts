import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasKitColorMatrices} from '../gpu-preview/canvaskit-color';
import {recolorMatrix} from '../timeline/recolor';
function apply(m:number[],c:number[]){return [0,1,2,3].map(r=>m[r*5+4]+c.reduce((sum,v,i)=>sum+m[r*5+i]*v,0));}
test('recolor precedes white flash and preserves fractional alpha',()=>{
 const matrices=canvasKitColorMatrices(recolorMatrix({color:'#ff0000',amount:1,preserveShading:false}),.5);
 const result=matrices.reduce((c,m)=>apply(m,c),[0,.2,.8,.3]);
 assert.deepEqual(result,[1,.5,.5,.3]);
});
test('identity adds no filter; full flash changes RGB without filling transparency',()=>{
 assert.deepEqual(canvasKitColorMatrices(recolorMatrix({color:'#fff',amount:0,preserveShading:false}),0),[]);
 assert.deepEqual(apply(canvasKitColorMatrices(undefined,1)[0],[.2,.4,.6,0]),[1,1,1,0]);
});
test('invalid color effects reject before drawing',()=>{
 for(const flash of [NaN,Infinity,-1,2])assert.throws(()=>canvasKitColorMatrices(undefined,flash));
 const matrix=recolorMatrix({color:'#ff0000',amount:1,preserveShading:false});matrix[18]=0;
 assert.throws(()=>canvasKitColorMatrices(matrix),/alpha-preserving/);
});
