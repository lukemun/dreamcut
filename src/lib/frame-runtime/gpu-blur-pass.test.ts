import test from 'node:test';
import assert from 'node:assert/strict';
import {gaussianBlurPlan,gaussianBlurUniforms} from '../gpu-preview/blur-pass';

test('isolated blur includes transparent padding and keeps per-pass kernels bounded',()=>{
  const small=gaussianBlurPlan(320,180,4,2);
  assert.deepEqual(small,{reductions:[],padX:12,padY:6,extentWidth:344,extentHeight:192,width:344,height:192,sigmaX:4,sigmaY:2,innerScaleX:320/344,innerScaleY:180/192});
  for(const sigma of [0,.01,1,20,40,41,300,1080]){
    const plan=gaussianBlurPlan(1080,1920,sigma,sigma/2);
    assert.ok(plan.sigmaX<=4&&plan.sigmaY<=4);
    let width=plan.extentWidth,height=plan.extentHeight;
    for(const step of plan.reductions){assert.ok(step.width>=width/2&&step.height>=height/2);assert.ok(step.width<=width&&step.height<=height);width=step.width;height=step.height;}
    assert.equal(width,plan.width);assert.equal(height,plan.height);
    const x=gaussianBlurUniforms(plan.sigmaX,false),y=gaussianBlurUniforms(plan.sigmaY,true);
    assert.ok(x[2]<=123&&y[2]<=123);assert.equal(x.byteLength,544);
    assert.equal(x[0],1);assert.equal(y[1],1);
    const weights=x.slice(4);let sum=weights[0];for(let i=1;i<=x[2];i++)sum+=2*weights[i];
    assert.ok(Math.abs(sum-1)<1e-6,'constant premultiplied color must remain constant');
  }
});
test('blur plans reject invalid geometry and kernels instead of emitting invalid GPU work',()=>{
  for(const sigma of [-1,NaN,Infinity])assert.throws(()=>gaussianBlurPlan(100,100,sigma,1));
  assert.throws(()=>gaussianBlurPlan(0,100,1,1));
  assert.throws(()=>gaussianBlurPlan(100,100,1e308,1),/safe geometry/);
  assert.throws(()=>gaussianBlurUniforms(42,false));
  assert.deepEqual([...gaussianBlurUniforms(0,false).slice(0,6)],[1,0,0,0,1,0]);
});
