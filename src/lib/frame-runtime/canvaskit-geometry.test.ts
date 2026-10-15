import test from 'node:test';
import assert from 'node:assert/strict';
import {canvasKitSourceMatrix} from '../gpu-preview/canvaskit-geometry';
import {quadToGpuTransform,orientedRectToGpuTransform} from '../gpu-preview/geometry';

function point(m:number[],x:number,y:number){const w=m[6]*x+m[7]*y+m[8];return [(m[0]*x+m[1]*y+m[2])/w,(m[3]*x+m[4]*y+m[5])/w];}
function near(actual:number[],expected:number[]){actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-8,`${actual} != ${expected}`));}
test('CanvasKit preserves all four projective tracking corners',()=>{
 const quad:[[number,number],[number,number],[number,number],[number,number]]=[[30,25],[280,40],[240,260],[60,220]];
 const matrix=canvasKitSourceMatrix(quadToGpuTransform(quad,320,300)!,640,480,320,300);
 [[0,0],[640,0],[640,480],[0,480]].forEach(([x,y],i)=>near(point(matrix,x,y),quad[i]));
 assert.notEqual(matrix[6],0,'Perspective denominator must survive conversion');
});
test('CanvasKit preserves source mirror and rotation rather than rotating the canvas',()=>{
 const matrix=canvasKitSourceMatrix(orientedRectToGpuTransform({x:20,y:40,width:100,height:60},320,300,{degrees:90,mirrorX:-1})!,100,60,320,300);
 near(point(matrix,0,0),[100,120]);near(point(matrix,100,60),[40,20]);
 near(point(matrix,50,30),[70,70]);
});
test('invalid geometry fails before any drawing can occur',()=>{
 assert.throws(()=>canvasKitSourceMatrix([],10,10,10,10),/Invalid/);
 assert.throws(()=>canvasKitSourceMatrix(Array(16).fill(0),0,10,10,10),/Invalid/);
 assert.throws(()=>canvasKitSourceMatrix(Array(16).fill(NaN),10,10,10,10),/Invalid/);
});
