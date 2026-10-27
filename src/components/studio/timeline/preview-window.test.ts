import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPreviewWindow, previewWindow } from './preview-window';

test('only explicit two-ended fragments define a playback window', () => {
  assert.equal(previewWindow('/example.mp4#t=1'), null);
  assert.equal(previewWindow('/example.mp4#t=4,2'), null);
  assert.deepEqual(previewWindow('/example.mp4#t=2,4'), {start: 2, end: 4});
});
test('metadata, seeking, loop boundaries and disposal preserve the marked interval', () => {
  const target = new EventTarget();
  const video = Object.assign(target, {currentTime: 0, duration: 10, readyState: 0, paused: true, pause() {this.paused = true;}, play() {this.paused = false; return Promise.resolve();}});
  const dispose = bindPreviewWindow(video as unknown as HTMLVideoElement, {start: 2, end: 4}, true);
  target.dispatchEvent(new Event('loadedmetadata')); assert.equal(video.currentTime, 2);
  video.currentTime = 1; target.dispatchEvent(new Event('seeking')); assert.equal(video.currentTime, 2);
  video.currentTime = 4.1; target.dispatchEvent(new Event('timeupdate')); assert.equal(video.currentTime, 2);
  dispose(); video.currentTime = 0; target.dispatchEvent(new Event('seeking')); assert.equal(video.currentTime, 0);
});
