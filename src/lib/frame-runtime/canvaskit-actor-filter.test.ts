import test from 'node:test';
import assert from 'node:assert/strict';
import type {CanvasKit} from 'canvaskit-wasm';
import {canvasKitActorPlan,canvasKitActorFilter} from '../gpu-preview/canvaskit-actor-filter';
test('outline radius follows shared morphology rounding and invalid effects fail',()=>{
 assert.equal(canvasKitActorPlan({outline:{radius:4.6,softness:.6,color:[1,1,1]}}).outline?.radius,5);
 assert.throws(()=>canvasKitActorPlan({glow:{strength:4,radius:12}}));
 assert.throws(()=>canvasKitActorPlan({blur:{x:NaN,y:0}}));
 assert.throws(()=>canvasKitActorPlan({outline:{radius:4,softness:.6,color:[-1,1,1]}}));
});
test('partially constructed filter graph releases every allocation on failure',()=>{
 let deleted=0;
 const kit={ImageFilter:{MakeDilate:()=>({delete(){deleted++;}}),MakeBlur:()=>{throw Error('GPU allocation failed');}},TileMode:{Decal:0}} as unknown as CanvasKit;
 assert.throws(()=>canvasKitActorFilter(kit,{outline:{radius:4,softness:.6,color:[1,1,1]}}),/GPU allocation failed/);
 assert.equal(deleted,1);
});
test('identity actor has no allocation and cleanup is repeatable',()=>{
 const result=canvasKitActorFilter({} as CanvasKit,{});
 assert.equal(result.filter,null);result.delete();result.delete();
});
