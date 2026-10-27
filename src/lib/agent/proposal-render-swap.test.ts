import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { deriveProposalTimeline, type EditorAgentOperation } from "@/lib/agent/timeline-editor-agent-apply";
import { createProject, readTimeline, writeTimeline } from "@/lib/local-store/store";
import { projectDir } from "@/lib/local-store/paths";
import type { TimelineElement } from "@/components/studio/timeline/types";

process.env.TIMELINE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-render-swap-"));
const P = "render-swap";
const HIT = "44444444-4444-4444-8444-444444444444", SHOT = "55555555-5555-4555-8555-555555555555", MOTION = "66666666-6666-4666-8666-666666666666";
const media = (relative: string) => `/api/projects/${P}/media/${relative}`;
const sha = "a".repeat(64);

function element(id: string, type: TimelineElement["type"], source: string, duration: number, lane: string): TimelineElement {
  const now = "2026-10-12T00:00:00.000Z";
  return { id, project_id: P, type, source_url: source, props: { title: "Chart blips", source_duration_seconds: duration, source_start_seconds: 0, source_end_seconds: duration },
    beat_id: null, character_id: null, timeline_start: 1, duration, lane_key: lane, lane_index: 0, trim_start: 0, trim_end: 0, volume: 1, fade_in: 0, fade_out: 0,
    playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now } as TimelineElement;
}

createProject(P, "web");
writeTimeline(P, { elements: [element(HIT, "sound_effect", media("sounds/old-blips/old-blips.1111111111111111.wav"), 2.6, "sound_effect_0"),
  element(SHOT, "video_clip", media("talk.mp4"), 4, "visual_0"), element(MOTION, "video_clip", media("hyperframes/opener/opener.1111111111111111.webm"), 7, "visual_1")],
  transitions: [] }, "fixture");
fs.mkdirSync(path.join(projectDir(P), "preprocess", "sounds"), { recursive: true });
fs.writeFileSync(path.join(projectDir(P), "preprocess", "sounds", "chart-rise.json"), JSON.stringify({
  schema_version: 1, sound_id: "chart-rise", source: { project_relative_directory: "sounds/chart-rise", fingerprint_sha256: sha },
  parameters: { manifest_sha256: null, values_sha256: sha, values: {}, seed: 1 },
  output: { project_relative_path: "media/sounds/chart-rise/chart-rise.2222222222222222.wav", sha256: sha, duration_seconds: 2.7, sample_rate: 48000, channels: 2, peak: 0.9 },
  render: { renderer: "synth", rendered_at: "2026-10-12T00:00:00.000Z" } }));
fs.mkdirSync(path.join(projectDir(P), "media", "sounds", "chart-rise"), { recursive: true });
fs.writeFileSync(path.join(projectDir(P), "media", "sounds", "chart-rise", "chart-rise.2222222222222222.wav"), "");

test("a synthesized sound can be swapped for another, takes the new length and a new name", () => {
  const op = { element_id: HIT, patch: { source_url: media("sounds/chart-rise/chart-rise.2222222222222222.wav") }, props: { title: "Chart swell" } } as EditorAgentOperation;
  const swapped = deriveProposalTimeline(readTimeline(P), [op], P).timeline.elements.find(e => e.id === HIT)!;
  assert.equal(swapped.duration, 2.7);
  assert.equal(swapped.props?.source_end_seconds, 2.7);
  assert.equal(swapped.props?.title, "Chart swell");
});

test("another project's URL is refused even when this project has a render at the same path", () => {
  const foreign = { element_id: HIT, patch: { source_url: "/api/projects/other-project/media/sounds/chart-rise/chart-rise.2222222222222222.wav" } } as EditorAgentOperation;
  assert.throws(() => deriveProposalTimeline(readTimeline(P), [foreign], P), /has not been rendered/);
  const foreignMotion = { element_id: MOTION, patch: { source_url: "/api/projects/other-project/media/hyperframes/opener/opener.1111111111111111.webm" } } as EditorAgentOperation;
  assert.throws(() => deriveProposalTimeline(readTimeline(P), [foreignMotion], P), /not recorded in this project/);
});

test("unrendered or missing sounds, unrecorded motion renders and real footage cannot be swapped", () => {
  const unknown = { element_id: HIT, patch: { source_url: media("sounds/other/other.3333333333333333.wav") } } as EditorAgentOperation;
  assert.throws(() => deriveProposalTimeline(readTimeline(P), [unknown], P), /has not been rendered/);
  fs.renameSync(path.join(projectDir(P), "media", "sounds", "chart-rise", "chart-rise.2222222222222222.wav"), path.join(projectDir(P), "media", "sounds", "chart-rise", "moved.wav"));
  const missing = { element_id: HIT, patch: { source_url: media("sounds/chart-rise/chart-rise.2222222222222222.wav") } } as EditorAgentOperation;
  assert.throws(() => deriveProposalTimeline(readTimeline(P), [missing], P), /has not been rendered/, "a render whose file is gone is refused");
  const unrecorded = { element_id: MOTION, patch: { source_url: media("hyperframes/opener/opener.4444444444444444.webm") } } as EditorAgentOperation;
  assert.throws(() => deriveProposalTimeline(readTimeline(P), [unrecorded], P), /not recorded in this project/, "a motion render with no receipt is refused");
  const footage = { element_id: SHOT, patch: { source_url: media("other.mp4") } } as EditorAgentOperation;
  assert.throws(() => deriveProposalTimeline(readTimeline(P), [footage], P), /must preserve its synchronized media source/);
});
