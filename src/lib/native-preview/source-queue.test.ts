import test from 'node:test';
import assert from 'node:assert/strict';
import {NativeSourceQueue} from './source-queue';

test('concurrent settles serialize decoder ownership; a failed request does not poison the next seek', async () => {
  const queue = new NativeSourceQueue();
  let unblock!: () => void;
  const firstFrame = new Promise<void>(resolve => { unblock = resolve; });
  const events: string[] = [];
  const first = queue.run(async () => { events.push('first'); await firstFrame; throw Error('decode failed'); });
  const second = queue.run(async () => { events.push('seek'); return 42; });
  const rejected = assert.rejects(first, /decode failed/);
  await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(events, ['first']);
  unblock();
  await rejected;
  assert.equal(await second, 42);
  assert.deepEqual(events, ['first', 'seek']);
});

test('release queued on unmount happens after in-flight decoding', async () => {
  const queue = new NativeSourceQueue();
  const events: string[] = [];
  let complete!: () => void;
  const frame = new Promise<void>(resolve => { complete = resolve; });
  const draw = queue.run(async () => { await frame; events.push('drawn'); });
  const release = queue.run(async () => { events.push('released'); });
  complete();
  await Promise.all([draw, release]);
  assert.deepEqual(events, ['drawn', 'released']);
});
