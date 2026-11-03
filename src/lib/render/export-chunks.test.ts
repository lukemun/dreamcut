import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ExportChunkStore, exportChunks } from "./export-chunks";

const caption = (id: string, start: number, text: string) => ({
  id, project_id: "p", type: "caption_text", source_url: null, timeline_start: start, duration: 1.5, lane_key: "captions_0", lane_index: 0,
  trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1, props: { text, fontSizePx: 72 },
});
const input = (second: string) => ({ width: 1920, height: 1080, fps: 30, durationInFrames: 180,
  inputProps: { elements: [caption("a", 0, "First"), caption("b", 4, second)] as never[], laneOrderKeys: ["captions_0"] } });
const picture = { width: 1920, height: 1080, fps: 30, bitrate: 10_000_000, codec: "avc1.640033" };

test("a chunk's fingerprint changes only where its own frames changed, or when export settings change", () => {
  const before = exportChunks(input("Second"), [0, 179], "http://127.0.0.1:3123", picture);
  assert.deepEqual(before.map((chunk) => chunk.range), [[0, 59], [60, 119], [120, 179]]);
  assert.ok(before.every((chunk) => chunk.pictureKey && chunk.audioKey));
  assert.deepEqual(exportChunks(input("Second"), [0, 179], "http://127.0.0.1:3123", picture), before);
  // Editing the caption at 4 s (frames 120–164) leaves the first two chunks reusable.
  const edited = exportChunks(input("Changed"), [0, 179], "http://127.0.0.1:3123", picture);
  assert.equal(edited[0]!.pictureKey, before[0]!.pictureKey);
  assert.equal(edited[1]!.pictureKey, before[1]!.pictureKey);
  assert.notEqual(edited[2]!.pictureKey, before[2]!.pictureKey);
  // A different export size reuses nothing.
  const bigger = exportChunks(input("Second"), [0, 179], "http://127.0.0.1:3123", { ...picture, width: 3840, height: 2160 });
  assert.ok(bigger.every((chunk, index) => chunk.pictureKey !== before[index]!.pictureKey));
});

test("only content-checked chunks are reused, and an export keeps just the chunks it used", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "export-chunks-"));
  try {
    const store = new ExportChunkStore(directory);
    const kept = store.file("kept", "h264"), stale = store.file("stale", "h264");
    for (const file of [kept, stale]) { fs.writeFileSync(`${file}.pending`, "bytes"); store.commit(`${file}.pending`, file); }
    assert.equal(store.valid(kept), true);
    fs.writeFileSync(stale, "changed");
    assert.equal(store.valid(stale), false);
    store.retain(new Set([kept]));
    assert.deepEqual(fs.readdirSync(directory).sort(), ["kept.h264", "kept.h264.json"]);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
