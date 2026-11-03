import assert from "node:assert/strict";
import test from "node:test";
import { referenceAnalysisSchema } from "./reference-analysis";
const unknown = { value: null, basis: "unknown", evidence: ["source.mp4#t=0,1"], limitations: ["Not inspected"] };
function fixture(): any {
  return { schema_version: 1, scope: "video",
    source: { file: "source.mp4", sha256: "a".repeat(64), width: 1080, height: 1920, fps: 30,
      frame_manifest: "frames.json", convention: "zero-based half-open; PTS from manifest", frame_count: 60, duration_seconds: 2 },
    analysis_interval: [0,60], coverage: { inspected_intervals: [], continuous_playback: false, audio_listened: false, limitations: ["Pending inspection"] },
    sections: [{ id: "intro", interval: [0,30], purpose: "Opening", status: "uninspected", pacing: unknown, text: unknown, audio: unknown, shot_order: [], evidence: ["source.mp4#t=0,1"] },
      { id: "body", interval: [30,60], purpose: "Body", status: "uninspected", pacing: unknown, text: unknown, audio: unknown, shot_order: [], evidence: ["source.mp4#t=1,2"] }],
    shots: [], text_presence: "uninspected", typography: null, effects: [], occurrences: [], adaptation: { revision: 1, direction_refs: [], decisions: [], intentional_differences: [], unresolved: [] } };
}
function withEffect() {
  const f = fixture();
  f.effects = [{ id: "reveal", name: "Expanding window", components: ["mask expansion"], interval: [0,30], evidence: ["frames.png"], coverage: f.coverage,
    layers: [{ id: "window", role: "background aperture", z_order: 0, states: [{ interval: [0,30], bounds: null, geometry: unknown, crop_and_mask: unknown, opacity_and_color: unknown, motion: unknown, blur: unknown, easing: unknown, evidence: ["frames.png"] }] }],
    cues: [], transitions: [], sound: [], text_presence: "uninspected", typography: null, limitations: ["Partial"] }];
  f.occurrences = [{ id: "first", interval: [0,30], effect_id: "reveal", layer_ids: ["window"], role: "opening", evidence: ["frames.png"] },
    { id: "again", interval: [40,60], effect_id: "reveal", layer_ids: ["window"], role: "callback", evidence: ["later.png"] }];
  return f;
}
test("whole reference accounts for ordinary and uninspected sections, with repeated reusable effects", () => {
  assert.ok(referenceAnalysisSchema.safeParse(fixture()).success);
  assert.ok(referenceAnalysisSchema.safeParse(withEffect()).success);
});
test("full-video route rejects truncated coverage, gaps, overlaps and duplicate sections", () => {
  for (const mutate of [
    (f: any)=>{ f.analysis_interval=[0,30]; f.sections.pop(); },
    (f: any)=>{ f.sections[1].interval=[31,60]; },
    (f: any)=>{ f.sections[1].interval=[29,60]; },
    (f: any)=>{ f.sections[1].id="intro"; },
  ]) { const f=fixture(); mutate(f); assert.equal(referenceAnalysisSchema.safeParse(f).success,false); }
  const f=fixture(); f.scope="effect"; f.analysis_interval=[30,60]; f.sections.shift();
  assert.ok(referenceAnalysisSchema.safeParse(f).success);
});
test("occurrences require valid effect/layer links and visible text requires typography", () => {
  for (const mutate of [
    (f: any)=>{ f.occurrences[0].effect_id="missing"; },
    (f: any)=>{ f.occurrences[0].layer_ids=["missing"]; },
    (f: any)=>{ f.effects[0].text_presence="present"; },
    (f: any)=>{ f.effects[0].layers[0].states[0].interval=[0,31]; },
    (f: any)=>{ f.effects[0].layers[0].states[0].motion={...unknown,limitations:[]}; },
  ]) { const f=withEffect(); mutate(f); assert.equal(referenceAnalysisSchema.safeParse(f).success,false); }
});
