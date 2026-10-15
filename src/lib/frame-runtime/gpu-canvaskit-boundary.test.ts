import test from 'node:test';
import assert from 'node:assert/strict';
import type {CanvasKit,Canvas} from 'canvaskit-wasm';
import {canvasKitBoundaryPlan,canvasKitClipBoundary,canvasKitDrawBoundaryWash} from '../gpu-preview/canvaskit-boundary';
import {accentTransitionFrame} from '../timeline/accent-transitions';

test('shared accent gradients become bounded CSS-angle shader geometry',()=>{
 for(const p of [0,.25,.5,.75,1]){
  const accent=accentTransitionFrame('film_burn',p,{accent_strength:.8});
  const {wash}=canvasKitBoundaryPlan({boundaryWash:{opacity:accent.washOpacity,background:accent.background}},320,180);
  assert.ok(wash);assert.deepEqual(wash.positions,[0,.23,.48,.62,1]);assert.equal(wash.colors.length,5);
  assert.ok([...wash.start,...wash.end].every(Number.isFinite));assert.equal(wash.opacity,accent.washOpacity);
 }
 const horizontal=canvasKitBoundaryPlan({boundaryWash:{opacity:1,background:'linear-gradient(90deg, #000000 0%, #ffffff 100%)'}},320,180).wash!;
 assert.ok(Math.abs(horizontal.start[0])<1e-9);assert.ok(Math.abs(horizontal.start[1]-90)<1e-9);assert.ok(Math.abs(horizontal.end[0]-320)<1e-9);
});

test('unsupported wash payloads and reversed clips reject before publication',()=>{
 for(const background of ['red','url(https://example.com/a.png)','linear-gradient(90deg, red 0%, blue 100%)','linear-gradient(90deg, #000000 90%, #ffffff 0%)'])assert.throws(()=>canvasKitBoundaryPlan({boundaryWash:{opacity:1,background}},320,180));
 assert.throws(()=>canvasKitBoundaryPlan({boundaryWash:{opacity:NaN,background:'#ffffff'}},320,180));
 assert.throws(()=>canvasKitBoundaryPlan({boundaryClip:[10,0,5,20]},320,180));
});

test('wash is full canvas with its own opacity and resources release after draw failure',()=>{
 const calls:unknown[][]=[];let deletes=0;
 class Paint{setAlphaf(v:number){calls.push(['alpha',v]);}setColor(){ }setShader(){ }delete(){deletes++;}}
 const kit={Paint,Color:(...v:number[])=>v,LTRBRect:(...v:number[])=>v,ClipOp:{Intersect:1},TileMode:{Clamp:1},Shader:{MakeLinearGradient:()=>({delete(){deletes++;}})}} as unknown as CanvasKit;
 const canvas={drawRect:(rect:unknown)=>{calls.push(['rect',rect]);},clipRect:(...args:unknown[])=>calls.push(['clip',...args])} as unknown as Canvas;
 const plan=canvasKitBoundaryPlan({boundaryClip:[80,0,320,180],boundaryWash:{opacity:.4,background:'#ffffff'}},320,180);
 canvasKitClipBoundary(kit,canvas,plan);canvasKitDrawBoundaryWash(kit,canvas,plan,320,180);
 assert.deepEqual(calls.find(call=>call[0]==='rect'),['rect',[0,0,320,180]]);assert.ok(calls.some(call=>call[0]==='alpha'&&call[1]===.4));assert.equal(deletes,1);
 const gradient=canvasKitBoundaryPlan({boundaryWash:{opacity:1,background:'linear-gradient(90deg, #000000 0%, #ffffff 100%)'}},320,180);
 const broken={drawRect(){throw Error('draw failure');}} as unknown as Canvas;
 assert.throws(()=>canvasKitDrawBoundaryWash(kit,broken,gradient,320,180),/draw failure/);assert.equal(deletes,3);
});
