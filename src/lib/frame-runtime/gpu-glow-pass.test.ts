import test from 'node:test';
import assert from 'node:assert/strict';
import {glowMaskPlan} from '../gpu-preview/glow-pass';

test('wide halos reduce alpha with repeated bounded steps and retain matching UV extent',()=>{
 const plan=glowMaskPlan(384,640,42);
 assert.ok(plan.sigmaX<=4&&plan.sigmaY<=4);
 assert.equal(plan.width,38);assert.equal(plan.height,62);
 let w=384,h=640;for(const next of plan.reductions){assert.ok(next.width>=Math.ceil(w/2)||next.width===plan.width);assert.ok(next.height>=Math.ceil(h/2)||next.height===plan.height);w=next.width;h=next.height;}
 assert.equal(w,plan.width);assert.equal(h,plan.height);
 assert.equal(plan.passes,plan.reductions.length+2);
 assert.deepEqual(glowMaskPlan(320,180,0),{width:320,height:180,reductions:[],sigmaX:0,sigmaY:0,passes:2});
 assert.throws(()=>glowMaskPlan(0,180,2),/Invalid/);
 assert.throws(()=>glowMaskPlan(320,180,NaN),/Invalid/);
});

test('centered halo reductions preserve fractional scale and center through rounded textures',()=>{
 for(const [width,height,sigma] of [[396,396,42*320/1080],[321,569,20],[384,640,42]]){
  const plan=glowMaskPlan(width,height,sigma),scale=4/sigma;
  let w=width,h=height,totalX=1,totalY=1;
  for(const next of plan.reductions){
   assert.ok(next.drawWidth!>0&&next.drawWidth!<=next.width+2);
   assert.ok(next.drawHeight!>0&&next.drawHeight!<=next.height+2);
   totalX*=next.drawWidth!/w;totalY*=next.drawHeight!/h;
   w=next.width;h=next.height;
  }
  assert.ok(Math.abs(totalX-scale)<1e-12);
  assert.ok(Math.abs(totalY-scale)<1e-12);
  assert.ok(Math.abs(plan.uvScaleX!*plan.width-width*scale)<1e-12);
  assert.ok(Math.abs(plan.uvScaleY!*plan.height-height*scale)<1e-12);
  assert.ok(plan.uvScaleX!<=1&&plan.uvScaleY!<=1);
  assert.ok(Math.abs(plan.sigmaX-4)<1e-12);assert.ok(Math.abs(plan.sigmaY-4)<1e-12);
 }
});
