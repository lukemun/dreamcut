import assert from "node:assert/strict";
import test from "node:test";

import {
  AUDIO_PEAK_ELEMENT_TYPES,
  chunkPeakPersistItems,
  clampPeakSample,
  extractMaxPeakSamples,
  PEAKS_PERSIST_MAX_ITEMS,
  selectMissingPeakSourceUrls,
} from "./peaks";

test("selectMissingPeakSourceUrls picks audio types without peaks and dedupes", () => {
  const urls = selectMissingPeakSourceUrls(
    [
      { type: "music", source_url: "/m/a.mp3" },
      { type: "music", source_url: "/m/a.mp3" },
      { type: "vo_segment", source_url: "/m/b.m4a" },
      { type: "sound_effect", source_url: "/m/c.wav", _peaks: [0.5] },
      { type: "vo_full", source_url: "" },
      { type: "vo_full", source_url: null },
    ],
    new Set(),
  );
  assert.deepEqual(urls, ["/m/a.mp3", "/m/b.m4a"]);
});

test("selectMissingPeakSourceUrls never selects video clips", () => {
  // video_clip renders waveforms when peaks exist (split/duplicate carry-over)
  // but the extractor and route cannot produce them; selecting them re-fires
  // the compute effect on every elements change without ever converging.
  assert.equal(AUDIO_PEAK_ELEMENT_TYPES.has("video_clip"), false);
  const urls = selectMissingPeakSourceUrls(
    [{ type: "video_clip", source_url: "/m/clip.mp4" }],
    new Set(),
  );
  assert.deepEqual(urls, []);
});

test("selectMissingPeakSourceUrls skips already-attempted sources", () => {
  const urls = selectMissingPeakSourceUrls(
    [
      { type: "music", source_url: "/m/a.mp3" },
      { type: "music", source_url: "/m/b.mp3" },
    ],
    new Set(["/m/a.mp3"]),
  );
  assert.deepEqual(urls, ["/m/b.mp3"]);
});

test("chunkPeakPersistItems splits at the route's schema cap", () => {
  const items = Array.from({ length: 45 }, (_, i) => i);
  const chunks = chunkPeakPersistItems(items);
  assert.deepEqual(chunks.map((chunk) => chunk.length), [20, 20, 5]);
  assert.equal(PEAKS_PERSIST_MAX_ITEMS, 20);
  assert.deepEqual(chunks.flat(), items);
  assert.deepEqual(chunkPeakPersistItems([]), []);
});

test("clampPeakSample clamps hot float32 samples into the schema range", () => {
  // decodeAudioData can return >1.0 on hot masters; unclamped values 400 the POST
  assert.equal(clampPeakSample(1.0231), 1);
  assert.equal(clampPeakSample(0.5), 0.5);
  assert.equal(clampPeakSample(0), 0);
  assert.equal(clampPeakSample(-0.2), 0);
  assert.equal(clampPeakSample(Number.NaN), 0);
});

test("extractMaxPeakSamples covers a non-divisible decoded-audio tail", () => {
  assert.deepEqual(extractMaxPeakSamples(new Float32Array([0, 0, 0, 0, 0.75]), 2), [0, 0.75]);
  assert.deepEqual(extractMaxPeakSamples(new Float32Array(), 2), []);
});
