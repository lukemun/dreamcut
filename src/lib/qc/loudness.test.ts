import assert from "node:assert/strict";
import test from "node:test";

import { LOUDNESS_TOLERANCE_LU, loudnessReport, timelineExpectsAudio } from "@/lib/qc/loudness";
import { LOUDNESS_TARGETS } from "@/lib/qc/standards";

const YT = LOUDNESS_TARGETS.youtube!;

test("a hot mix for shorts is warned with the sourced target cited", () => {
  const report = loudnessReport("shorts", { integratedLufs: -8, truePeakDbfs: -1.5 }, true);
  assert.equal(report.ok, true, "hot-but-unclipped is a warning, not a blocker — the platform normalizes down");
  assert.equal(report.applied?.key, "youtube");
  const warning = report.findings.find((finding) => finding.code === "integrated_above_target");
  assert.ok(warning);
  assert.equal(warning.severity, "warning");
  assert.match(warning.message, /6\.0 LU above/);
  assert.match(warning.message, new RegExp(String(YT.lufs)));
});

test("true peak above the sourced ceiling blocks", () => {
  const report = loudnessReport("shorts", { integratedLufs: -14, truePeakDbfs: -0.2 }, true);
  assert.equal(report.ok, false);
  const blocker = report.findings.find((finding) => finding.code === "true_peak_over_ceiling");
  assert.equal(blocker?.severity, "blocker");
});

test("within tolerance reports a single info finding", () => {
  const report = loudnessReport(
    "shorts",
    { integratedLufs: YT.lufs! + LOUDNESS_TOLERANCE_LU - 0.1, truePeakDbfs: YT.truePeakDb - 0.5 },
    true,
  );
  assert.equal(report.ok, true);
  assert.deepEqual(report.findings.map((finding) => finding.code), ["loudness_within_target"]);
});

test("platforms without a published figure are reported, never gated", () => {
  for (const target of ["tiktok", "reels", "feed", "web"] as const) {
    const report = loudnessReport(target, { integratedLufs: -5, truePeakDbfs: 0 }, true);
    assert.equal(report.ok, true, `${target} must not gate on an unsourced number`);
    assert.equal(report.applied, null);
    assert.deepEqual(report.findings.map((finding) => finding.code), ["no_published_target"]);
  }
});

test("expected audio with unmeasurable loudness blocks; none expected is informational", () => {
  const missing = { integratedLufs: NaN, truePeakDbfs: NaN };
  const withAudio = loudnessReport("shorts", missing, true);
  assert.equal(withAudio.ok, false);
  assert.equal(withAudio.findings[0]?.severity, "blocker");
  const silent = loudnessReport("shorts", missing, false);
  assert.equal(silent.ok, true);
  assert.equal(silent.findings[0]?.severity, "info");
});

test("timelineExpectsAudio requires an unmuted, audible, live explicit-audio element", () => {
  const base = { type: "music", lane_key: "music_0", volume: 1, removed_at: null as string | null };
  assert.equal(timelineExpectsAudio([base], []), true);
  assert.equal(timelineExpectsAudio([{ ...base, volume: 0 }], []), false);
  assert.equal(timelineExpectsAudio([{ ...base, removed_at: "2026-07-22T00:00:00Z" }], []), false);
  assert.equal(timelineExpectsAudio([base], ["music_0"]), false);
  // A silent video_clip does not promise a mix.
  assert.equal(timelineExpectsAudio([{ ...base, type: "video_clip", lane_key: "visual_0" }], []), false);
});
