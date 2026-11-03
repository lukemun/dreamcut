import test from 'node:test';
import assert from 'node:assert/strict';
import {gpuSpiralTransform} from '../gpu-preview/spiral-transform';
import {spiralGroupTransform} from '../timeline/spiral-group';
import {canvasKitBackdropProjectiveInverse} from '../gpu-preview/canvaskit-backdrop';
const recipe={origin_x:.2,origin_y:.8,start_seconds:.3,duration_seconds:1,turns:2};
test('spiral uses shared anchored CSS pose and local source clock, not a centered approximation',()=>{
 for(const time of [0,.3,.4,.8,1.2]){
  const result=gpuSpiralTransform(recipe,time,320,180)!,pose=spiralGroupTransform(recipe,time,320,180),m=result.matrix;
  assert.equal(result.hidden,false);const x=64,y=144;
  assert.ok(Math.abs(m[0]*x+m[1]*y+m[2]-(x+pose.x))<1e-8);
  assert.ok(Math.abs(m[3]*x+m[4]*y+m[5]-(y+pose.y))<1e-8);
  const inverse=canvasKitBackdropProjectiveInverse(m),px=m[0]*20+m[1]*35+m[2],py=m[3]*20+m[4]*35+m[5];
  assert.ok(Math.abs(inverse[0]*px+inverse[1]*py+inverse[2]-20)<1e-7);
 }
 assert.equal(gpuSpiralTransform(recipe,1.3,320,180)?.hidden,true);assert.equal(gpuSpiralTransform({...recipe,start_seconds:.1,duration_seconds:1.8},57/30,320,180)?.hidden,true);assert.equal(gpuSpiralTransform(undefined,0,320,180),undefined);
 assert.throws(()=>gpuSpiralTransform({...recipe,duration_seconds:0},0,320,180));
});
