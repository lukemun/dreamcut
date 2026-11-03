import assert from 'node:assert/strict';
import test from 'node:test';
import {readMaskInsetProps, resolveMaskInsetAtTime, commitMaskInsetAtTime, ellipseMaskGeometry, maskInsetStyle} from './media-transform';
import {resolveMediaScene} from './resolved-media-scene';
import {evaluateGpuScene} from '../gpu-preview/scene';
import {gpuSceneDraws} from '../gpu-preview/scene-draws';
import {canvasKitMaskPlan} from '../gpu-preview/canvaskit-masks';
import type {CompositionElement} from '../render/composition-adapters';

test('ellipse recovery bounds remain outside the canvas through static and animated edits', () => {
  const props={mask_shape:'ellipse',mask_inset:[.4,.2,.2,-.7]};
  const mask=readMaskInsetProps(props);
  assert.equal(mask.left,-.7);
  const committed=commitMaskInsetAtTime(props,0,{...mask,left:-.8});
  assert.equal(readMaskInsetProps(committed).left,-.8);
  const keyed={...props,keyframes:{mask_inset:[{t:0,v:[.4,.2,.2,-.7]},{t:2,v:[.4,.2,.2,-.9]}]}};
  assert.equal(resolveMaskInsetAtTime(keyed,1).left,-.8);
  const edited=commitMaskInsetAtTime(keyed,1,{...mask,left:-.6});
  assert.equal(resolveMaskInsetAtTime(edited,1).left,-.6);
  const g=ellipseMaskGeometry(mask,.01,0,{width:1000,height:1000});
  assert.ok(g.cx-g.rx<0,'mask extends beyond left canvas');
  assert.ok(((0-g.cx)/g.rx)**2<1,'left canvas remains inside ellipse at its centre height');
  assert.equal(maskInsetStyle(mask,.01,0,{width:1000,height:1000},0,'ellipse').clipPath,undefined);
});

test('rectangle masks retain bounded legacy interpretation', () => {
  assert.equal(readMaskInsetProps({mask_inset:[.4,.2,.2,-.7]}).left,0);
  assert.equal(resolveMaskInsetAtTime({mask_inset:[.4,.2,.2,-.7]},0).left,0);
});

test('animated off-canvas ellipse reaches Standard scene and GPU draw without a rectangular crop', () => {
  const props = {
    mask_shape: 'ellipse', mask_feather: .015, mask_line_rotation: 10,
    keyframes: {mask_inset: [{t: 0, v: [.43, .28, .24, -.7]}, {t: 2, v: [.43, .28, .24, -.9]}]},
  };
  const element: CompositionElement = {
    id: 'ellipse-test', type: 'video_clip', source_url: '/fixture.mp4',
    timeline_start: 0, duration: 3, lane_key: 'visual_0', lane_index: 0,
    volume: 0, trim_start: 0, trim_end: null, playback_rate: 1, fade_in: 0, fade_out: 0, props,
  };
  const canvas = {width: 1080, height: 1920};
  const standard = resolveMediaScene(props, 1, canvas);
  assert.equal(standard.mask.left, -.8);
  assert.equal(standard.styles.outer.clipPath, undefined);
  assert.match(decodeURIComponent(String(standard.styles.outer.maskImage)), /<ellipse /);
  const scene = evaluateGpuScene([element], [], 30, canvas.width, canvas.height, 'media1', 30, true);
  const layer = scene.layers[0];
  assert.equal(layer.kind, 'video');
  if (layer.kind !== 'video') throw new Error('Expected video layer');
  assert.equal(layer.mask.left, -.8);
  const draws = gpuSceneDraws(scene, new Map([[element.id, {
    sourceKey: layer.source.key, timestampUs: layer.timeUs, durationUs: 33334,
    value: {displayWidth: 1080, displayHeight: 1920} as VideoFrame,
  }]]), () => undefined);
  const draw = draws[0];
  assert.ok('ellipseMask' in draw && draw.ellipseMask);
  const geometry = ellipseMaskGeometry(standard.mask, .015, 10, canvas);
  assert.deepEqual(draw.ellipseMask, [geometry.cx, geometry.cy, geometry.rx, geometry.ry, Math.PI / 18, geometry.feather]);
  const plan = canvasKitMaskPlan(draw, canvas.width, canvas.height);
  assert.deepEqual(plan.feather, [geometry.cx, geometry.cy, geometry.rx, geometry.ry, 3, Math.PI / 18, geometry.feather, 0]);
  assert.ok(geometry.cx - geometry.rx < 0);
});
