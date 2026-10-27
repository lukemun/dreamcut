import assert from "node:assert/strict";
import test from "node:test";

import { distributeChunks } from "./browser-renderer";
import { canvasEncoderCodec } from "./canvas-encoder";
import { exportWorkerCount, MAX_EXPORT_WORKERS } from "./export-parallelism";

const GiB = 1024 ** 3;

test("export pages follow the computer: about one per three cores, bounded by memory and the cap", () => {
  const hd = { width: 1920, height: 1080 };
  assert.equal(exportWorkerCount(hd, { cores: 18, memoryBytes: 48 * GiB, override: undefined }), 6);
  assert.equal(exportWorkerCount(hd, { cores: 8, memoryBytes: 16 * GiB, override: undefined }), 2);
  assert.equal(exportWorkerCount(hd, { cores: 2, memoryBytes: 8 * GiB, override: undefined }), 1);
  assert.equal(exportWorkerCount(hd, { cores: 64, memoryBytes: 256 * GiB, override: undefined }), MAX_EXPORT_WORKERS);
  // 4K pages need four times the memory.
  assert.equal(exportWorkerCount({ width: 3840, height: 2160 }, { cores: 18, memoryBytes: 16 * GiB, override: undefined }), 1);
  assert.equal(exportWorkerCount(hd, { cores: 18, memoryBytes: 48 * GiB, override: "3" }), 3);
});

test("chunks to draw are shared out as contiguous runs, one per page", () => {
  assert.deepEqual(distributeChunks([0, 1, 2, 3, 4, 5], 3), [[0, 1], [2, 3], [4, 5]]);
  assert.deepEqual(distributeChunks([3, 4, 9], 6), [[3], [4], [9]]);
  assert.deepEqual(distributeChunks([], 3), []);
  const all = distributeChunks(Array.from({ length: 51 }, (_, index) => index), 3);
  assert.deepEqual(all.flat(), Array.from({ length: 51 }, (_, index) => index));
  assert.ok(all.every((group) => group.length >= 17));
});

test("H.264 level fits the export: 4K at 30 fps on 5.1, 4K at 60 fps on 5.2", () => {
  assert.equal(canvasEncoderCodec(1920, 1080, 30), "avc1.640033");
  assert.equal(canvasEncoderCodec(2160, 3840, 30), "avc1.640033");
  assert.equal(canvasEncoderCodec(3840, 2160, 60), "avc1.640034");
  assert.throws(() => canvasEncoderCodec(7680, 4320, 30), /cannot encode/);
});
