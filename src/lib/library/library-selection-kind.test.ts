import {test} from 'node:test';
import assert from 'node:assert/strict';
import {libraryKindForSource} from './library-selection-kind';
test('selection pills name audio, video and pictures correctly', () => {
  assert.equal(libraryKindForSource('sources/interview take 4.m4a'), 'Audio');
  assert.equal(libraryKindForSource('sources/clip.MOV'), 'Video');
  assert.equal(libraryKindForSource('sources/photo.HEIC'), 'Image');
  assert.equal(libraryKindForSource('catalog:abc', 'video_clip'), 'Video');
  assert.equal(libraryKindForSource('sources/odd.mov', 'still'), 'Image', 'a known asset type wins over the extension');
});
