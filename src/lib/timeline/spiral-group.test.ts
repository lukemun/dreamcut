import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spiralGroupSchema, spiralGroupTransform } from './spiral-group';
const recipe={origin_x:.5,origin_y:.3,start_seconds:1,duration_seconds:3,turns:3};
test('spiral is identity before its start and closes at canvas center',()=>{
 assert.deepEqual(spiralGroupTransform(recipe,0,1080,1920),{x:0,y:0,scale:1,rotation:0});
 const end=spiralGroupTransform(recipe,4,1080,1920);
 assert.equal(end.scale,0);assert.ok(Math.abs(end.x)<1e-8);assert.ok(Math.abs(end.y-384)<1e-8);
});
test('normal orientation is continuous, deterministic and perpendicular to the path',()=>{
 let last=spiralGroupTransform(recipe,1.4,1080,1920);
 for(let t=1.41;t<3.95;t+=.01){
  const pose=spiralGroupTransform(recipe,t,1080,1920), next=spiralGroupTransform(recipe,t+.00001,1080,1920);
  assert.ok(Math.abs(pose.rotation-last.rotation)<30);
  const rad=pose.rotation*Math.PI/180, dx=next.x-pose.x,dy=next.y-pose.y;
  assert.ok(Math.abs((Math.cos(rad)*dx+Math.sin(rad)*dy)/Math.hypot(dx,dy))<.001);
  assert.deepEqual(pose,spiralGroupTransform(recipe,t,1080,1920));last=pose;
 }
 assert.equal(spiralGroupSchema.safeParse({...recipe,duration_seconds:0}).success,false);
});
