import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveMediaScene } from './resolved-media-scene';
import { resolveColorGradeAtTime } from './color-grade';

test('semantic effect roles do not make otherwise analytic geometry unknown',()=>{
  const scene=resolveMediaScene({effect_role:'supporting_actor',media_scale:0.5},0,{width:1080,height:1920});
  assert.equal(scene.geometry_support,'analytic');
  assert.deepEqual(scene.unsupported,[]);
});

test('horizontal mirror reflects only source pixels and resets exactly', () => {
  const props = {media_scale: 1.2, media_offset_x: .15, media_offset_y: -.2};
  const original = resolveMediaScene(props, 0, {width:1080,height:1920});
  const mirrored = resolveMediaScene({...props,media_mirror:'horizontal'}, 0, {width:1080,height:1920});
  assert.equal(mirrored.styles.mirror.transform, 'rotate(0deg) scaleX(-1)');
  assert.deepEqual(mirrored.styles.translate, original.styles.translate);
  assert.deepEqual(mirrored.styles.scale, original.styles.scale);
  assert.deepEqual(mirrored.styles.outer, original.styles.outer);
  assert.deepEqual(resolveMediaScene({...props,media_mirror:'none'},0,{width:1080,height:1920}).styles,original.styles);
  assert.equal(mirrored.geometry_support,'unknown');
});

test('orientation rotates picture pixels without changing placement or source mirror',()=>{
 const scene=resolveMediaScene({media_orientation:'clockwise'},0,{width:1080,height:1920});
 assert.equal(scene.styles.mirror.transform,'rotate(90deg) scaleX(1)');
 assert.deepEqual(scene.styles.translate,{});
 assert.equal(resolveMediaScene({media_orientation:'counterclockwise'},0,{width:1080,height:1920}).styles.mirror.transform,'rotate(-90deg) scaleX(1)');
 assert.deepEqual(resolveMediaScene({media_orientation:'original'},0,{width:1080,height:1920}).styles.mirror,{});
});

test('the grade resolves on first read to the same value, and an unsupported grade still fails up front',()=>{
  const props={color_grade_model:'dreamcut-scene-v2',grade_contrast:1.2,grade_temperature:0.1};
  const scene=resolveMediaScene(props,0.5,{width:1080,height:1920});
  assert.deepEqual(scene.grade,resolveColorGradeAtTime(props,0.5));
  assert.equal(scene.grade,scene.grade);
  assert.throws(()=>resolveMediaScene({grade_contrast:1.2,color_grade_model:'unknown'},0,{width:1080,height:1920}),/Unsupported color grade model/);
});
