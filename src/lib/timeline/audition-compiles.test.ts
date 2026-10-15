import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import type { AuditionManifest } from "@/lib/timeline/auditions";

import { assembleAuditionSelection, auditionCompileContractSchema, auditionCompileJobSchema } from "./audition-compiles";

const contract = {
  schema_version: 1 as const,
  strategy: "agent_timeline_assembly" as const,
  target_project_id: "selected-cut",
  target_title: "Selected cut",
  objective: "Assemble the selected timeline without generating media.",
  input_files: [],
  backend: "codex" as const,
  model: "gpt-5.6-sol",
  effort: "high" as const,
  require_all_sections: true,
  gap_seconds: 0.5,
  include_editorial_labels: false,
  allow_existing_target: true,
  caps: { max_external_calls: 0 as const, max_renders: 0 as const, max_timeline_mutations: 24 },
};

const element = (id: string, start: number, candidateId: string): TimelineElement => ({
  id,
  project_id: "audition",
  type: "video_clip",
  source_url: `/media/${candidateId}.mp4`,
  props: { audition_section_id: candidateId.split("-")[0], audition_candidate_id: candidateId },
  beat_id: null,
  voice_clip_id: null,
  character_id: null,
  timeline_start: start,
  duration: 2,
  lane_key: "visual_0",
  lane_index: 0,
  trim_start: 0,
  trim_end: 2,
  volume: 1,
  fade_in: 0,
  fade_out: 0,
  playback_rate: 1,
  position_locked: false,
  removed_at: null,
  removed_reason: null,
  created_at: "2026-07-19T00:00:00.000Z",
  updated_at: "2026-07-19T00:00:00.000Z",
});

const manifest: AuditionManifest = {
  schema_version: 1,
  project_id: "audition",
  source_note: "fixture",
  updated_at: "2026-07-19T00:00:00.000Z",
  sections: [
    {
      id: "hook", order: 0, label: "Hook", script_text: "Hook line", winner_candidate_id: "hook-b",
      candidates: [{ id: "hook-b", take_id: "take-2", timeline_element_id: "64130e56-6de6-47b7-a057-e3ba43634f56", label_element_id: "a48f81f4-72f8-42d0-b773-4617f42bb0f5", source_url: "/media/hook-b.mp4", thumbnail_url: "/media/hook-b.jpg", source_start_seconds: 0, source_end_seconds: 2, duration_seconds: 2, pass_label: "Warm", source_label: "B" }],
    },
    {
      id: "close", order: 1, label: "Close", script_text: "Close line", winner_candidate_id: "close-a",
      candidates: [{ id: "close-a", take_id: "take-1", timeline_element_id: "35d1a881-7cf5-46dc-ac0d-fe3063b821cc", label_element_id: "ab276d1f-d44f-4868-8841-361e7d1fd5ed", source_url: "/media/close-a.mp4", thumbnail_url: "/media/close-a.jpg", source_start_seconds: 0, source_end_seconds: 2, duration_seconds: 2, pass_label: "Clear", source_label: "A" }],
    },
  ],
};

test("agent assembly contracts hard-block generation and rendering", () => {
  assert.equal(auditionCompileContractSchema.parse(contract).gap_seconds, 0.5);
  assert.throws(() => auditionCompileContractSchema.parse({ ...contract, caps: { ...contract.caps, max_external_calls: 1 } }));
  assert.throws(() => auditionCompileContractSchema.parse({ ...contract, caps: { ...contract.caps, max_renders: 1 } }));
  assert.throws(() => auditionCompileContractSchema.parse({ ...contract, gap_seconds: 11 }));
});

test("selected winners are assembled section-by-section without generation", () => {
  const source = {
    elements: [
      element("64130e56-6de6-47b7-a057-e3ba43634f56", 8, "hook-b"),
      element("35d1a881-7cf5-46dc-ac0d-fe3063b821cc", 18, "close-a"),
    ],
    transitions: [],
  };
  let id = 0;
  const result = assembleAuditionSelection(manifest, source, "selected-cut", contract, () => `00000000-0000-4000-8000-${String(++id).padStart(12, "0")}`);
  assert.deepEqual(result.selected_candidate_ids, ["hook-b", "close-a"]);
  assert.deepEqual(result.timeline.elements.map((item) => item.timeline_start), [0, 2.5]);
  assert.ok(result.timeline.elements.every((item) => item.project_id === "selected-cut"));
  assert.ok(result.timeline.elements.every((item) => item.props?.audition_compilation === true));
});

test("compile jobs preserve the confirmed immutable selection snapshot", () => {
  const now = new Date().toISOString();
  const parsed = auditionCompileJobSchema.parse({
    schema_version: 1,
    id: "9f08c94b-ae7d-43b9-b317-d8bfc15d5d79",
    status: "queued",
    audition_project_id: "voice-audition",
    target_project_id: "selected-cut",
    selection_revision: now,
    selections: [{ section_id: "hook", section_label: "Hook", script_text: "Locked line", candidate_id: "take-b", source_label: "B", pass_label: "Warm", source_url: "/media/b.mp4", timeline_element_id: "64130e56-6de6-47b7-a057-e3ba43634f56" }],
    contract,
    confirmed: true,
    created_at: now,
    started_at: null,
    completed_at: null,
    run_dir: null,
    result_path: null,
    outcome: null,
    summary: null,
    review_url: null,
    error: null,
  });
  assert.equal(parsed.selections[0]?.candidate_id, "take-b");
  assert.throws(() => auditionCompileJobSchema.parse({ ...parsed, confirmed: false }));
});
