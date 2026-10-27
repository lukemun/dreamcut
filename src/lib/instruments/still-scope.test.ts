import test from 'node:test';
import assert from 'node:assert/strict';
import { scopeStillRequest } from './still-scope';
import { stillCacheKey } from './still-cache';
import type { BrowserStillOptions } from '../render/browser-renderer';

const early = { id: 'early', type: 'video_clip', lane_key: 'visual_0', timeline_start: 0, duration: 2, source_url: '/early.mp4', props: {} };
const later = { ...early, id: 'later', timeline_start: 3, source_url: '/later.mp4' };
const request: BrowserStillOptions = { baseUrl: 'http://localhost:3123', width: 320, height: 180, durationInFrames: 151, frame: 30, output: 'out.png', inputProps: { elements: [early, later], laneOrderKeys: ['visual_0'] } };
const key = (r: BrowserStillOptions) => stillCacheKey(scopeStillRequest(r), 'runtime', 'bytes');

test('local edit invalidates one sampled window instead of all three; key projection never mutates render input', () => {
  const edited = { ...request, inputProps: { ...request.inputProps, elements: [early, { ...later, props: { media_scale: 1.2 } }] } };
  const frames = [0, 30, 120];
  assert.equal(frames.filter(frame => key({ ...request, frame }) !== key({ ...edited, frame })).length, 1);
  assert.equal(request.inputProps.elements.length, 2);
  assert.equal(scopeStillRequest(request).inputProps.elements.length, 1);
});

test('clock boundaries, active sources, lane order and global inputs invalidate', () => {
  assert.equal(scopeStillRequest({ ...request, frame: 89 }).inputProps.elements.length, 1);
  for (const changed of [{ width: 640 }, { inputProps: { ...request.inputProps, laneOrderKeys: ['other'] } },
    { inputProps: { ...request.inputProps, elements: [{ ...early, source_url: '/replacement.mp4' }, later] } }]) {
    assert.notEqual(key(request), key({ ...request, ...changed }));
  }
});

test('unknown effects, transitions, cross-row bindings and nonstandard clocks retain full dependencies', () => {
  for (const element of [{ ...later, transition_in: {} }, { ...later, props: { gravity_drop_after_text_id: 'early' } }, { ...later, props: { future_effect: true } }, { ...later, compound: {} }]) {
    const coupled = { ...request, inputProps: { elements: [early, element] } };
    assert.equal(scopeStillRequest(coupled), coupled);
  }
});

test('scoping measures windows in the request frame rate', () => {
  const at60 = (frame: number) => scopeStillRequest({ ...request, fps: 60, durationInFrames: 301, frame }).inputProps.elements.map(el => el.id);
  // 1 s and 3.17 s at 60 fps: only the clip on screen is a dependency.
  assert.deepEqual(at60(60), ['early']);
  assert.deepEqual(at60(190), ['later']);
  // The same frame number at 30 fps is a different moment (6.3 s, after both clips).
  assert.deepEqual(scopeStillRequest({ ...request, frame: 190, durationInFrames: 301 }).inputProps.elements.map(el => el.id), []);
});
