import test from 'node:test';
import assert from 'node:assert/strict';
import {morphologySteps,outlinePassPlan} from '../gpu-preview/outline-pass';

test('morphology rounds the layer-space radius and bounds both linear and sparse work',()=>{
 assert.deepEqual(morphologySteps(.49),[]);assert.deepEqual(morphologySteps(.5),[1]);
 assert.deepEqual(morphologySteps(14),[14]);assert.deepEqual(morphologySteps(32),[14,14,4]);
 for(const radius of [0,1,15,32,127,256,400]){
  const steps=morphologySteps(radius);let applied=0;
  for(const step of steps){assert.ok(step>0);assert.ok(applied===0?step<=14:step<=applied);applied+=step;}
  assert.equal(applied,Math.min(256,Math.round(radius)));
 }
 assert.throws(()=>morphologySteps(NaN),/Invalid/);assert.throws(()=>morphologySteps(-1),/Invalid/);
});

test('outline padding retains filter support plus the later directional-blur input',()=>{
 assert.deepEqual(outlinePassPlan(3.2,.2,{x:4,y:2}),{steps:[3],softness:.2,padX:16,padY:10,passes:5});
 assert.deepEqual(outlinePassPlan(.1,.2),{steps:[],softness:.2,padX:1,padY:1,passes:3});
 assert.throws(()=>outlinePassPlan(2,Infinity),/Invalid/);
 assert.throws(()=>outlinePassPlan(2,42),/Invalid/);
});
