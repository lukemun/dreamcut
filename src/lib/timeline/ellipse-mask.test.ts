import assert from 'node:assert/strict';
import test from 'node:test';
import {ellipseMaskGeometry,maskInsetStyle} from './media-transform';
import {canvasKitMaskPlan} from '../gpu-preview/canvaskit-masks';

test('non-square ellipse preserves independent radii and rotated geometry across render plans',()=>{
 const mask={top:.2,right:.1,bottom:.4,left:.3};
 const g=ellipseMaskGeometry(mask,.02,30,{width:1080,height:1920});
 assert.ok(Math.abs(g.rx-324)<1e-8);assert.ok(Math.abs(g.ry-384)<1e-8);
 assert.ok(Math.abs(g.cx-648)<1e-8);assert.ok(Math.abs(g.cy-768)<1e-8);
 assert.ok(Math.abs(g.feather-38.4/324)<1e-8);
 const style=maskInsetStyle(mask,.02,30,{width:1080,height:1920},.5,'ellipse');
 assert.equal(style.clipPath,undefined,'rotated ellipse must not be cut by unrotated rectangle');
 const svg=decodeURIComponent(style.maskImage!);
 assert.match(svg,/<ellipse /);assert.match(svg,/rotate\(30 /);
 assert.doesNotMatch(svg,/<rect /);
 const plan=canvasKitMaskPlan({ellipseMask:[g.cx,g.cy,g.rx,g.ry,Math.PI/6,g.feather],featherMask:[0,1920,38.4,1]},1080,1920);
 assert.deepEqual(plan.feather,[g.cx,g.cy,g.rx,g.ry,3,Math.PI/6,g.feather,0]);
});
test('ellipse softness is bounded; existing rectangles preserve their contract',()=>{
 const mask={top:.4,right:.4,bottom:.4,left:.4};
 assert.equal(ellipseMaskGeometry(mask,.5,500,{width:100,height:200}).feather,1);
 assert.equal(ellipseMaskGeometry(mask,0,500,{width:100,height:200}).rotation,180);
 assert.deepEqual(maskInsetStyle(mask,0,0,{width:100,height:200},0,'rectangle'),{clipPath:'inset(40% 40% 40% 40%)'});
 assert.throws(()=>canvasKitMaskPlan({ellipseMask:[0,0,-1,3,0,0]},100,200),/Invalid CanvasKit ellipse/);
});


test('collapsed ellipse bounds produce a transparent mask plan instead of crashing', () => {
 for (const mask of [{top:.6,bottom:.5,left:0,right:0},{top:0,bottom:0,left:.5,right:.5}]) {
  const g=ellipseMaskGeometry(mask,0,0,{width:1080,height:1920});
  const plan=canvasKitMaskPlan({ellipseMask:[g.cx,g.cy,g.rx,g.ry,0,g.feather]},1080,1920);
  assert.ok(plan.feather);
  assert.ok(plan.feather[2]===0||plan.feather[3]===0);
 }
});
