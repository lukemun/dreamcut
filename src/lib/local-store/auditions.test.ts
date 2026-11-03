import assert from "node:assert/strict";
import test from "node:test";

import {
  auditionManifestSchema,
  auditionCandidatesShareRecording,
  auditionPlaybackQueue,
  rejectAuditionCandidate,
  selectAuditionWinner,
  type AuditionManifest,
} from "@/lib/timeline/auditions";

const manifest: AuditionManifest = {
  schema_version: 1,
  project_id: "project",
  source_note: "Two performance passes from one canonical source.",
  updated_at: "2026-07-18T00:00:00.000Z",
  sections: [{
    id: "hook",
    order: 0,
    label: "Hook",
    script_text: "A hook",
    winner_candidate_id: null,
    candidates: ["one", "two", "three"].map((id, index) => ({
      id,
      take_id: `take-${index + 1}`,
      timeline_element_id: "00000000-0000-4000-8000-00000000000" + index,
      label_element_id: "10000000-0000-4000-8000-00000000000" + index,
      associated_element_ids: index === 0
        ? ["20000000-0000-4000-8000-000000000000"]
        : undefined,
      source_url: "/source.mp4",
      thumbnail_url: `/${id}.jpg`,
      source_start_seconds: index,
      source_end_seconds: index + 1,
      duration_seconds: 1,
      pass_label: "Pass A",
      source_label: `Take ${index + 1}`,
    })),
  }],
};

test("selectAuditionWinner records one winner without mutating the input", () => {
  const selected = selectAuditionWinner(manifest, "hook", "two", "2026-07-18T01:00:00.000Z");
  assert.equal(selected.sections[0]?.winner_candidate_id, "two");
  assert.equal(manifest.sections[0]?.winner_candidate_id, null);
});

test("audition manifests retain companion timeline elements such as music beds", () => {
  const parsed = auditionManifestSchema.parse(manifest);
  assert.deepEqual(
    parsed.sections[0]?.candidates[0]?.associated_element_ids,
    ["20000000-0000-4000-8000-000000000000"],
  );
});

test("selectAuditionWinner rejects a candidate from outside the section", () => {
  assert.throws(() => selectAuditionWinner(manifest, "hook", "missing"), /not in section/);
});

test("rejectAuditionCandidate removes one take and clears it as winner without mutating the input", () => {
  const selected = selectAuditionWinner(manifest, "hook", "two", "2026-07-18T01:00:00.000Z");
  const rejected = rejectAuditionCandidate(selected, "hook", "two", "2026-07-18T02:00:00.000Z");

  assert.deepEqual(rejected.sections[0]?.candidates.map((candidate) => candidate.id), ["one", "three"]);
  assert.equal(rejected.sections[0]?.winner_candidate_id, null);
  assert.equal(selected.sections[0]?.candidates.length, 3);
});

test("rejectAuditionCandidate preserves another winner and refuses to empty a section", () => {
  const selected = selectAuditionWinner(manifest, "hook", "one", "2026-07-18T01:00:00.000Z");
  const twoLeft = rejectAuditionCandidate(selected, "hook", "two", "2026-07-18T02:00:00.000Z");
  assert.equal(twoLeft.sections[0]?.winner_candidate_id, "one");

  const oneLeft = rejectAuditionCandidate(twoLeft, "hook", "three", "2026-07-18T03:00:00.000Z");
  assert.throws(
    () => rejectAuditionCandidate(oneLeft, "hook", "one"),
    /last audition candidate/,
  );
});

test("auditionPlaybackQueue can play a whole section or continue from one take", () => {
  const section = manifest.sections[0]!;
  assert.deepEqual(auditionPlaybackQueue(section), ["one", "two", "three"]);
  assert.deepEqual(auditionPlaybackQueue(section, "two"), ["two", "three"]);
});

test("audition continuity follows the original recording instead of derived clip URLs", () => {
  const first = manifest.sections[0]!.candidates[0]!;
  const derivedExcerpt = {
    ...manifest.sections[0]!.candidates[1]!,
    source_url: "/processed/ending.mov",
    source_label: first.source_label,
  };
  const otherRecording = {
    ...derivedExcerpt,
    source_recording_id: "camera-b",
  };
  const identifiedFirst = { ...first, source_recording_id: "camera-a" };

  assert.equal(auditionCandidatesShareRecording(first, derivedExcerpt), true);
  assert.equal(auditionCandidatesShareRecording(identifiedFirst, otherRecording), false);
});

test("audition manifests can retain omitted false starts as an assembly receipt", () => {
  const parsed = auditionManifestSchema.parse({
    ...manifest,
    exclusions: [{
      take_id: "take-0",
      section_id: "hook",
      source_start_seconds: 0,
      source_end_seconds: 0.8,
      transcript: "A hook that...",
      reason: "Clear false start; speech stops mid-clause.",
    }],
  });

  assert.equal(parsed.exclusions?.[0]?.take_id, "take-0");
});
