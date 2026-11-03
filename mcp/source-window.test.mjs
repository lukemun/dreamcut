import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSemanticTrimOperations,
  buildSourceTrimPatch,
  createElementFromSourceWindow,
} from "./source-window.mjs";

const BASE_MEDIA = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "sound_effect",
  source_url: "/api/projects/fixture/media/sfx/impact.wav",
  timeline_start: 10,
  duration: 2,
  trim_start: 1,
  trim_end: 2,
  playback_rate: 1,
  props: { source_duration_seconds: 5 },
};

test("media creation derives duration and both reversible source handles", () => {
  const created = createElementFromSourceWindow({
    type: "sound_effect",
    source_url: BASE_MEDIA.source_url,
    timeline_start: 10,
    playback_rate: 2,
    props: { title: "Impact" },
  }, {
    source_start_seconds: 1,
    source_end_seconds: 4,
    source_duration_seconds: 5,
  });
  assert.equal(created.duration, 1.5);
  assert.equal(created.trim_start, 1);
  assert.equal(created.trim_end, 1);
  assert.equal(created.props.source_duration_seconds, 5);
});

test("media creation rejects caller-authored derived timing fields", () => {
  assert.throws(
    () => createElementFromSourceWindow({
      type: "music",
      timeline_start: 0,
      duration: 3,
    }, {
      source_start_seconds: 0,
      source_end_seconds: 3,
      source_duration_seconds: 5,
    }),
    /element.duration is derived/,
  );
});

test("head trim moves the timeline edge and preserves the source-out boundary", () => {
  assert.deepEqual(buildSourceTrimPatch(BASE_MEDIA, "head", 1.5), {
    timeline_start: 10.5,
    duration: 1.5,
    trim_start: 1.5,
    trim_end: 2,
  });
});

test("tail trim changes duration and preserves timeline start and source-in", () => {
  assert.deepEqual(buildSourceTrimPatch(BASE_MEDIA, "tail", 4), {
    timeline_start: 10,
    duration: 3,
    trim_start: 1,
    trim_end: 1,
  });
});

test("a hidden duration cap becomes an explicit tail trim without changing playback", () => {
  const implicit = { ...BASE_MEDIA, duration: 2.333333, trim_start: 0, trim_end: null, props: { source_duration_seconds: 4.865941 } };
  assert.deepEqual(buildSourceTrimPatch(implicit, "tail", 2.333333), {
    timeline_start: 10,
    duration: 2.333333,
    trim_start: 0,
    trim_end: 2.532608,
  });
});

test("raw partial trim patches fail closed as implicit slips", () => {
  assert.throws(
    () => assertSemanticTrimOperations([{
      element_id: BASE_MEDIA.id,
      patch: { trim_start: 1.5 },
    }]),
    /Implicit slip\/source truncation is not supported/,
  );
  assert.throws(
    () => assertSemanticTrimOperations([{
      element_id: BASE_MEDIA.id,
      patch: { timeline_start: 10, duration: 2, trim_start: 1.5 },
    }], { inProposal: true }),
    (error) => /Add trim_end to the patch for 00000000-0000-4000-8000-000000000001/.test(error.message)
      && !/element_trim/.test(error.message),
  );
  assert.doesNotThrow(() => assertSemanticTrimOperations([{
    element_id: BASE_MEDIA.id,
    patch: {
      timeline_start: 10.5,
      duration: 1.5,
      trim_start: 1.5,
      trim_end: 2,
    },
  }]));
});
