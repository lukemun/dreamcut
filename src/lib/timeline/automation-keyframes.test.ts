import assert from "node:assert/strict";
import test from "node:test";

import {
  collectElementAutomationTimes,
  elementAutomationValuesAtTime,
  hasElementAutomationMoments,
  volumeAutomationPointIndexAtTime,
  VOLUME_ENVELOPE_FIELD,
} from "./automation-keyframes";

test("volume envelopes appear as clip automation without generic keyframes", () => {
  const element = {
    duration: 10,
    volume: 0,
    props: {
      volume_envelope: [
        { time_seconds: 0, volume: 0 },
        { time_seconds: 4, volume: 0.5 },
        { time_seconds: 10, volume: 0.2 },
      ],
    },
  };

  assert.equal(hasElementAutomationMoments(element), true);
  assert.deepEqual(collectElementAutomationTimes(element), [0, 4, 10]);
  assert.deepEqual(elementAutomationValuesAtTime(element, 4), [{
    field: VOLUME_ENVELOPE_FIELD,
    value: 0.5,
    ease: "linear",
    interpolationLocked: true,
  }]);
  assert.equal(volumeAutomationPointIndexAtTime(element, 4), 1);
});

test("generic and volume automation at the same time share one moment", () => {
  const element = {
    duration: 5,
    volume: 1,
    props: {
      keyframes: {
        media_scale: [{ t: 2, v: 1.5 }],
      },
      volume_envelope: [
        { time_seconds: 0, volume: 1 },
        { time_seconds: 2, volume: 0.4 },
        { time_seconds: 5, volume: 1 },
      ],
    },
  };

  assert.deepEqual(collectElementAutomationTimes(element), [0, 2, 5]);
  assert.deepEqual(elementAutomationValuesAtTime(element, 2).map(({ field }) => field), [
    "media_scale",
    VOLUME_ENVELOPE_FIELD,
  ]);
});

test("clips without stored automation do not expose a keyframe banner", () => {
  assert.equal(hasElementAutomationMoments({ duration: 5, volume: 0.8, props: null }), false);
});
