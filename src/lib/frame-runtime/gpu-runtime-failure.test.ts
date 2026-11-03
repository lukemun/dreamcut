import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuPreviewRuntime} from '../gpu-preview/runtime';
import {GpuFrameController} from '../gpu-preview/frame-controller';
import {FrameStore} from '../gpu-preview/frame-store';
import {FrameLookahead} from '../gpu-preview/lookahead';

test('an active frame exceeding the decode cache rejects for fallback and releases its pins', async () => {
  const frames = new GpuFrameController(new FrameStore<VideoFrame>(10));
  const released: string[] = [];
  // Exercise the production readiness path with deterministic decoded frames;
  // no GPU submission should be attempted for this incomplete picture.
  const runtime = Object.assign(Object.create(GpuPreviewRuntime.prototype), {elements:[],fps:30,
    frames, scope: 'fixture', closed: false, decodeAbort: new AbortController(),
    sourceBytes: new Map(), lookahead: new FrameLookahead(),
    imageLookahead: new FrameLookahead(), resourceAbort: new AbortController(),
    scene: () => ({layers: ['background', 'foreground'].map(id => ({
      kind: 'video', element: {id}, source: {key: id}, timeUs: 0,
    }))}),
    provider: {decode: async (source: {key: string}, _times: number[], _signal: AbortSignal, offer: (frame: unknown) => void) => {
      offer({sourceKey: source.key, timestampUs: 0, durationUs: 33333, bytes: 10,
        value: {displayWidth: 1, displayHeight: 1}, release: () => released.push(source.key)});
    }},
    compositor: {draw: () => assert.fail('An incomplete picture must not be submitted')},
  }) as GpuPreviewRuntime;
  try {
    await assert.rejects(runtime.present(0, 'first-seek'), /complete picture.*budget/);
    assert.equal(runtime.lastPresentation, undefined);
    assert.equal(frames.cache({sourceKey: 'replacement', timestampUs: 0, durationUs: 33333,
      bytes: 10, value: {} as VideoFrame, release() {}}), true, 'Failed picture must release cache pins');
    assert.deepEqual(released.sort(), ['background', 'foreground']);
  } finally { frames.close(); }
});

test('presentation attributes shared lookahead waits and submits only the complete frame', async () => {
  const frames = new GpuFrameController(new FrameStore<VideoFrame>(100));
  const lookahead = new FrameLookahead();
  let finish!: () => void;
  let draws = 0;
  const runtime = Object.assign(Object.create(GpuPreviewRuntime.prototype), {elements:[],fps:30,
    frames, scope: 'fixture', closed: false, seekKey: 'current', decodeAbort: new AbortController(),
    sourceBytes: new Map(), lookahead, imageLookahead: new FrameLookahead(),
    scene: () => ({layers: [{kind: 'video', element: {id: 'picture'}, source: {key: 'source'}, timeUs: 0}]}),
    provider: {decode: () => assert.fail('Shared lookahead should satisfy the request')},
    compositor: {draw: () => { draws++; }},
  }) as GpuPreviewRuntime;
  lookahead.start(new Map([['source', [0]]]), async (_source, _times, _signal, ready) => {
    await new Promise<void>(resolve => { finish = resolve; });
    frames.cache({sourceKey: 'source', timestampUs: 0, durationUs: 33333, bytes: 4,
      value: {displayWidth: 1, displayHeight: 1} as VideoFrame, release() {}});
    ready(0, 33333);
  });
  // Override drawing conversion, which otherwise needs a fully authored scene.
  const originalSubmit = frames.submit.bind(frames);
  frames.submit = (packet) => originalSubmit(packet, () => { draws++; });
  try {
    const pending = runtime.present(0, 'current');
    await Promise.resolve();
    assert.equal(draws, 0);
    finish();
    assert.equal(await pending, true);
    assert.equal(draws, 1);
    assert.deepEqual(runtime.lastPresentation?.videoDecodes, []);
    const waits = runtime.lastPresentation?.lookaheadWaits;
    assert.equal(waits?.length, 1);
    assert.equal(waits?.[0].sourceKey, 'source');
    assert.equal(waits?.[0].ready, true);
    assert.ok((waits?.[0].waitMs ?? -1) >= 0);
  } finally { lookahead.cancel(); frames.close(); }
});
