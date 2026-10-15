import test from "node:test";
import assert from "node:assert/strict";
import { beatAnnotationSchema, projectHitAnnotation } from "./beat-annotations";
import { moveInstrumentHit, addManualInstrumentHit, instrumentControlTracks, instrumentIds, instrumentFilters, updateInstrumentFilters, updateSelectedInstrumentHits, instrumentAnnotation, instrumentHitKey, instrumentSettingsSchema, visibleInstrumentHits, type InstrumentResult } from "./instrument-analysis";

test("bulk hit actions change only the selected points and remove hidden candidates", () => {
  const first = instrumentHitKey("drums", 1), second = instrumentHitKey("bass", 2), untouched = instrumentHitKey("vocals", 3);
  const settings = instrumentSettingsSchema.parse({ selected: [], minimum_strength: 0, marked_hits: [first, untouched], manual_hits: [{ instrument: "bass", time_seconds: 2 }] });
  const marked = updateSelectedInstrumentHits(settings, [second], "mark");
  assert.deepEqual(marked.marked_hits, [first, untouched, second]);
  const unmarked = updateSelectedInstrumentHits(marked, [first, second], "unmark");
  assert.deepEqual(unmarked.marked_hits, [untouched]);
  assert.deepEqual(unmarked.excluded_hits, []);
  const removed = updateSelectedInstrumentHits(marked, [first, second], "remove");
  assert.deepEqual(removed.marked_hits, [untouched]);
  assert.deepEqual(removed.excluded_hits, [first, second]);
  assert.deepEqual(removed.manual_hits, []);
  assert.deepEqual(settings.marked_hits, [first, untouched]);
  const lane: InstrumentResult["lanes"][number] = { id: "drums", peaks: [], rms: 0, hits: [{ time_seconds: 1, strength: 1 }] };
  assert.deepEqual(visibleInstrumentHits(lane, removed, { candidates: true }), []);
});

test("marked hits are opt-in, reversible, and independent of candidate visibility", () => {
  const lane: InstrumentResult["lanes"][number] = { id: "drums", peaks: [], rms: 0, hits: [{ time_seconds: 1, strength: 0.2 }, { time_seconds: 2, strength: 1 }] };
  const legacy = instrumentSettingsSchema.parse({ selected: [], minimum_strength: 0 });
  assert.equal(visibleInstrumentHits(lane, legacy).length, 2);
  const marked = instrumentSettingsSchema.parse({ ...legacy, marked_hits: [instrumentHitKey("drums", 1)] });
  assert.deepEqual(visibleInstrumentHits(lane, marked).map(hit => hit.time_seconds), [1]);
  assert.equal(visibleInstrumentHits(lane, marked, { candidates: true }).length, 2);
  assert.deepEqual(visibleInstrumentHits(lane, { ...marked, minimum_strength: 0.9 }).map(hit => hit.time_seconds), [1]);
  assert.deepEqual(visibleInstrumentHits(lane, { ...marked, marked_hits: [] }), []);
  assert.equal(visibleInstrumentHits(lane, { ...marked, marked_hits: [] }, { candidates: true }).length, 2);
  assert.equal(visibleInstrumentHits({ ...lane, id: "bass" }, marked).length, 0);
  assert.equal(instrumentSettingsSchema.safeParse({ ...legacy, marked_hits: ["bad"] }).success, false);
});

test("density filters span full strength and retain strongest attacks per instrument", () => {
  const lane: InstrumentResult["lanes"][number] = { id: "other", peaks: [], rms: 0.1, hits: [{ time_seconds: 0.1, strength: 0.3 }, { time_seconds: 0.2, strength: 0.9 }, { time_seconds: 0.3, strength: 0.7 }, { time_seconds: 1.2, strength: 0.8 }] };
  const settings = instrumentSettingsSchema.parse({ selected: [], minimum_strength: 0 });
  assert.equal(visibleInstrumentHits(lane, settings).length, 4);
  assert.deepEqual(visibleInstrumentHits(lane, { ...settings, minimum_gap_seconds: 1 }).map(hit => hit.time_seconds), [0.2, 1.2]);
  assert.equal(visibleInstrumentHits(lane, { ...settings, minimum_strength: 0.95 }).length, 0);
  assert.deepEqual(visibleInstrumentHits(lane, { ...settings, minimum_strength: 1, manual_hits: [{ instrument: "other", time_seconds: 0.4 }] }).map(hit => hit.time_seconds), [0.4]);
  assert.equal(visibleInstrumentHits(lane, { ...settings, minimum_strength: 1, manual_hits: [{ instrument: "other", time_seconds: 0.4 }], excluded_hits: [instrumentHitKey("other", 0.4)] }).length, 0);
  assert.equal(instrumentSettingsSchema.safeParse({ ...settings, minimum_gap_seconds: -1 }).success, false);
  assert.equal(instrumentSettingsSchema.safeParse({ ...settings, minimum_gap_seconds: 6 }).success, false);
});

test("strongest percentage gives a bounded monotone selection even with tied scores", () => {
  const lane: InstrumentResult["lanes"][number] = { id: "other", peaks: [], rms: 0.1, hits: Array.from({ length: 100 }, (_, i) => ({ time_seconds: i / 10, strength: 1 })) };
  const settings = instrumentSettingsSchema.parse({ selected: [], minimum_strength: 0 });
  for (const percent of [0, 1, 10, 50, 100]) assert.equal(visibleInstrumentHits(lane, { ...settings, keep_strongest_percent: percent }).length, percent);
  assert.deepEqual(visibleInstrumentHits(lane, { ...settings, keep_strongest_percent: 2 }).map(hit => hit.time_seconds), [0, 0.1]);
  assert.equal(visibleInstrumentHits(lane, { ...settings, keep_strongest_percent: 2, excluded_hits: [instrumentHitKey("other", 0)] }).length, 1);
  assert.equal(instrumentSettingsSchema.safeParse({ ...settings, keep_strongest_percent: 101 }).success, false);
});

test("instrument hits retain simultaneous attacks, corrections, and source timing", () => {
  const base = beatAnnotationSchema.parse({ schema_version: 2, source_sha256: "a".repeat(64), recipe: "test", analyzed_at: "", source_duration_seconds: 4, tempo_bpm: 120, tempo_confirmed: false, beats_seconds: [1, 2], downbeats: "unknown", hits: [] });
  const result: InstrumentResult = { state: "ready", model: "htdemucs", source_sha256: base.source_sha256, sample_rate: 44100, sample_count: 176400, duration: 4, lanes: ["mix", "drums", "bass", "other", "vocals"].map(id => ({ id: id as InstrumentResult["lanes"][number]["id"], peaks: [0.1], rms: 0.1, hits: [{ time_seconds: 1, strength: 0.5 }] })) };
  const settings = instrumentSettingsSchema.parse({ selected: ["other"], minimum_strength: 0.1, excluded_hits: [instrumentHitKey("bass", 1)], manual_hits: [{ instrument: "other", time_seconds: 1.2 }] });
  const annotation = beatAnnotationSchema.parse(instrumentAnnotation(base, result, settings));
  assert.equal(annotation.schema_version === 2 && annotation.hits.filter(hit => hit.time_seconds === 1).length, 3);
  assert.equal(annotation.schema_version === 2 && annotation.hits.some(hit => hit.kind === "bass"), false);
  const projected = projectHitAnnotation({ timeline_start: 3, duration: 1, trim_start: 0.5, trim_end: 1.5, playback_rate: 2, props: {} }, annotation);
  assert.equal(projected.find(hit => hit.kind === "accompaniment" && hit.source_time === 1)?.time, 3.25);
  assert.equal(projected.find(hit => hit.source_time === 1.2)?.time, 3.35);
  assert.throws(() => instrumentAnnotation(base, { ...result, source_sha256: "b".repeat(64) }, settings), /match the source/);
});


test("selected track filters leave other instruments and snapshot hits intact", () => {
  const settings = instrumentSettingsSchema.parse({ selected: [], minimum_strength: 0, snapshot: { start: 0, end: 3, hits: [{ instrument: "drums", time_seconds: 1.5, strength: 0.4 }, { instrument: "vocals", time_seconds: 1.5, strength: 0.4 }] } });
  const lane: InstrumentResult["lanes"][number] = { id: "vocals", peaks: [], rms: 0, hits: [{ time_seconds: 1, strength: 0.3 }, { time_seconds: 2, strength: 0.8 }] };
  const next = instrumentSettingsSchema.parse(updateInstrumentFilters(settings, ["vocals"], { minimum_strength: 0.7 }));
  assert.deepEqual(visibleInstrumentHits(lane, next).map(hit => hit.time_seconds), [2]);
  assert.deepEqual(visibleInstrumentHits({ ...lane, id: "drums" }, next).map(hit => hit.time_seconds), [1.5]);
  assert.equal(instrumentFilters(next, "drums").minimum_strength, 0);
  assert.equal(instrumentFilters(next, "vocals").minimum_strength, 0.7);
  assert.equal(updateInstrumentFilters(next, [], { minimum_strength: 1 }), next);
  const multi = updateInstrumentFilters(next, ["vocals", "bass"], { keep_strongest_percent: 50 });
  assert.equal(instrumentFilters(multi, "vocals").minimum_strength, 0.7);
  assert.equal(instrumentFilters(multi, "bass").minimum_strength, 0);
  assert.equal(instrumentFilters(multi, "drums").keep_strongest_percent, 100);
  assert.equal(instrumentFilters(multi, "vocals").keep_strongest_percent, 50);
});


test("full mix enables all hit filters while isolated listening stays scoped and preserves marks", () => {
  const marked = instrumentHitKey("drums", 1);
  const settings = instrumentSettingsSchema.parse({ selected: [], minimum_strength: 0, marked_hits: [marked] });
  const fullMix = updateInstrumentFilters(settings, instrumentControlTracks(["mix"]), { keep_strongest_percent: 10 });
  for (const id of instrumentIds) assert.equal(instrumentFilters(fullMix, id).keep_strongest_percent, 10);
  assert.deepEqual(fullMix.marked_hits, [marked]);
  const isolated = updateInstrumentFilters(settings, instrumentControlTracks(["bass"]), { keep_strongest_percent: 50 });
  assert.equal(instrumentFilters(isolated, "bass").keep_strongest_percent, 50);
  assert.equal(instrumentFilters(isolated, "drums").keep_strongest_percent, 100);
  assert.deepEqual(instrumentControlTracks([]), []);
  assert.deepEqual(instrumentControlTracks(["mix", "bass"]), [...instrumentIds]);
});


test("manual hits survive strict detection filters, preserve legacy choices, and are idempotent", () => {
  const lane: InstrumentResult["lanes"][number] = { id: "drums", peaks: [], rms: 0, hits: [{ time_seconds: 1, strength: 1 }] };
  const legacy = instrumentSettingsSchema.parse({ selected: [], minimum_strength: 0 });
  const authored = addManualInstrumentHit(legacy, "drums", 2);
  assert.equal(authored.marked_hits, undefined);
  assert.deepEqual(visibleInstrumentHits(lane, authored).map(hit => hit.time_seconds), [1, 2]);
  const selected = addManualInstrumentHit({ ...legacy, marked_hits: [instrumentHitKey("bass", 1)], minimum_strength: 1, keep_strongest_percent: 0, excluded_hits: [instrumentHitKey("drums", 2)] }, "drums", 2);
  assert.deepEqual(visibleInstrumentHits(lane, selected).map(hit => hit.time_seconds), [2]);
  assert.deepEqual(selected.marked_hits, [instrumentHitKey("bass", 1), instrumentHitKey("drums", 2)]);
  assert.deepEqual(selected.excluded_hits, []);
  assert.equal(addManualInstrumentHit(selected, "drums", 2.00001).manual_hits.length, 1);
  for (const time of [NaN, Infinity, -1]) assert.throws(() => addManualInstrumentHit(legacy, "drums", time));
  assert.equal(instrumentSettingsSchema.safeParse(selected).success, true);
});


test("moving detected, snapshot and authored hits replaces originals and preserves other selections", () => {
  const lane: InstrumentResult["lanes"][number] = { id: "drums", peaks: [], rms: 0, hits: [{ time_seconds: 1, strength: 1 }, { time_seconds: 2, strength: 1 }] };
  const initial = instrumentSettingsSchema.parse({ selected: [], minimum_strength: 0, marked_hits: [instrumentHitKey("drums", 1), instrumentHitKey("drums", 2)], snapshot: { start: 0, end: 3, hits: [{ instrument: "drums", time_seconds: 1, strength: 1 }, { instrument: "drums", time_seconds: 2, strength: 1 }] } });
  const moved = instrumentSettingsSchema.parse(moveInstrumentHit(initial, "drums", 1, 1.25));
  assert.deepEqual(visibleInstrumentHits(lane, moved).map(hit => hit.time_seconds), [1.25, 2]);
  assert.deepEqual(visibleInstrumentHits(lane, moved, { candidates: true }).map(hit => hit.time_seconds), [1.25, 2]);
  assert.deepEqual(visibleInstrumentHits(lane, addManualInstrumentHit(moved, "drums", 1)).map(hit => hit.time_seconds), [1, 1.25, 2]);
  const again = moveInstrumentHit(moved, "drums", 1.25, 1.5);
  assert.equal(again.manual_hits.length, 1);
  assert.deepEqual(visibleInstrumentHits(lane, again).map(hit => hit.time_seconds), [1.5, 2]);
  const returned = moveInstrumentHit(again, "drums", 1.5, 1);
  assert.deepEqual(visibleInstrumentHits(lane, returned).map(hit => hit.time_seconds), [1, 2]);
  const merged = moveInstrumentHit(moved, "drums", 1.25, 2);
  assert.deepEqual(visibleInstrumentHits(lane, merged).map(hit => hit.time_seconds), [2]);
  assert.deepEqual(visibleInstrumentHits(lane, initial).map(hit => hit.time_seconds), [1, 2]);
  assert.equal(moveInstrumentHit(initial, "drums", 1, 1), initial);
  const nearDetected = moveInstrumentHit(initial, "drums", 1, 2.0004);
  assert.deepEqual(visibleInstrumentHits(lane, nearDetected).map(hit => hit.time_seconds), [2, 2.0004]);
  const unmarked = moveInstrumentHit({ ...initial, marked_hits: [] }, "drums", 1, 1.25);
  assert.deepEqual(unmarked.marked_hits, []);
  assert.deepEqual(visibleInstrumentHits(lane, unmarked, { candidates: true }).map(hit => hit.time_seconds), [1.25, 2]);
  assert.throws(() => moveInstrumentHit(initial, "drums", 1, NaN));
});
