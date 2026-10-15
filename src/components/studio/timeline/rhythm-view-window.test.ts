import test from 'node:test';
import assert from 'node:assert/strict';
import { rhythmViewWindow, zoomRhythmView, readRhythmResponse } from './rhythm-view-window';

test('supports a precise end section, bounded pan and fractional-second zoom', () => {
  assert.deepEqual(rhythmViewWindow(36.2, 10, 0, 46.2), { start: 36.2, span: 10, end: 46.2 });
  assert.equal(rhythmViewWindow(45, 10, 0, 46.2).start, 36.2);
  const zoom = zoomRhythmView(36.2, 10, 0.5, 41.2, 0, 46.2);
  assert.deepEqual(zoom, { start: 38.7, span: 5, end: 43.7 });
  assert.equal(rhythmViewWindow(45.99, 0.01, 0, 46.2).span, 0.25);
});
test('view remains within trimmed source handles, including very short clips', () => {
  const view = rhythmViewWindow(0, Infinity, 14.45, 24.45);
  assert.deepEqual(view, { start: 14.45, span: 10, end: 24.45 });
  const small = rhythmViewWindow(9, 1, 3, 3.1);
  assert.equal(small.start, 3);
  assert.ok(Math.abs(small.end - 3.1) < 1e-8);
});
test('HTML server errors produce a readable retry error and JSON responses recover', async () => {
  await assert.rejects(readRhythmResponse(new Response('<!DOCTYPE html><h1>Error</h1>', { status: 500 })), /temporarily unavailable/);
  await assert.rejects(readRhythmResponse(new Response('{"error":"Missing source"}', { status: 422 })), /Missing source/);
  assert.deepEqual(await readRhythmResponse(new Response('{"state":"ready"}')), { state: 'ready' });
});
