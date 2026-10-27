import assert from "node:assert/strict";
import test from "node:test";

import {
  assertLaneCompatibleWithElementType,
  isLaneCompatibleWithElementType,
} from "./lanes";

test("audio element types use editor-visible numbered lane families", () => {
  assert.equal(isLaneCompatibleWithElementType("music", "music_3"), true);
  assert.equal(isLaneCompatibleWithElementType("sound_effect", "sound_effect_2"), true);
  assert.equal(isLaneCompatibleWithElementType("vo_segment", "audio_narrator"), true);
  assert.equal(isLaneCompatibleWithElementType("music", "music_reference_crime_scene"), false);
  assert.equal(isLaneCompatibleWithElementType("sound_effect", "sound_effect_impacts"), false);
});

test("incompatible lanes fail before a playable but invisible clip is persisted", () => {
  assert.throws(
    () => assertLaneCompatibleWithElementType("music", "music_reference_crime_scene"),
    /not visible\/editable/,
  );
});
