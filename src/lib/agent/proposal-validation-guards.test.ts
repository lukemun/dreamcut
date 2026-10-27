import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  applyEditorAgentProposal,
  timelineRevision,
  validateEditorAgentProposalAgainstProject,
} from "@/lib/agent/timeline-editor-agent-apply";
import { createProject, readTimeline, writeTimeline } from "@/lib/local-store/store";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { writePreparation, PREPARATION_RECIPE } from "@/lib/local-store/media-preparation";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-editor-validation-guards-"));
process.env.TIMELINE_PROJECTS_DIR = root;

const ELEMENT_A = "11111111-1111-4111-8111-111111111111";
const ELEMENT_B = "22222222-2222-4222-8222-222222222222";
const CREATED = "33333333-3333-4333-8333-333333333333";

function element(id: string, overrides: Partial<TimelineElement> = {}): TimelineElement {
  const now = "2026-08-13T00:00:00.000Z";
  return {
    id, project_id: "fixture", type: "video_clip", source_url: "/api/projects/x/media/shot.mp4",
    props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 4, lane_key: "visual_0",
    lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now,
    ...overrides,
  };
}

/** Two back-to-back visuals on one lane: 0–4s and 4–8s. */
function seed(projectId: string) {
  createProject(projectId, "web");
  writeTimeline(projectId, {
    elements: [element(ELEMENT_A), element(ELEMENT_B, { timeline_start: 4 })],
    transitions: [],
  }, "fixture");
  return timelineRevision(projectId);
}

function head(projectId: string, revision: string, operations: unknown[], requested = 1) {
  return {
    schema_version: 2,
    project_id: projectId,
    expected_revision: revision,
    mode: "workshop",
    decision: "propose",
    summary: "Guard fixture.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 24, requested_mutations: requested, max_renders: 0 },
    options: [{
      id: "only",
      label: "Only option",
      recommended: true,
      summary: "Guard fixture.",
      requested_mutations: requested,
      operations,
    }],
  };
}

test("a created visual is quantized onto the 30fps grid", async () => {
  const projectId = "guard-create-quantization";
  const revision = seed(projectId);
  // This test exercises timeline quantization; supply the upstream preparation receipt.
  const sourcePath = path.join(root, projectId, "media", "insert.mp4");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, "source-fixture");
  fs.writeFileSync(path.join(path.dirname(sourcePath), "preview.mp4"), "proxy-fixture");
  const stat = fs.statSync(sourcePath);
  writePreparation(projectId, { recipe: PREPARATION_RECIPE, source: "insert.mp4", size: stat.size, mtime: stat.mtimeMs,
    state: "ready", render: "insert.mp4", preview: "preview.mp4", duration: 5, alpha: false });
  // 1.017s and 1.611s are both off the 1/30 grid.
  const raw = head(projectId, revision, [{
    element_id: CREATED,
    create_visual: {
      type: "video_clip",
      source_url: "/api/projects/guard-create-quantization/media/insert.mp4",
      timeline_start: 9.017,
      source_duration_seconds: 5,
      source_start_seconds: 0,
      source_end_seconds: 1.611,
      lane_key: "visual_0",
      lane_index: 0,
      recolor_color: "#ff630f",
      recolor_amount: 1,
      recolor_preserve_shading: 0,
    },
  }], 11);

  const validated = validateEditorAgentProposalAgainstProject(raw, 24, projectId);
  await applyEditorAgentProposal(validated, 24);

  const created = readTimeline(projectId).elements.find((entry) => entry.id === CREATED);
  assert.ok(created, "the visual was created");
  assert.equal(created.props.recolor_color, "#ff630f");
  assert.equal(created.props.recolor_amount, 1);
  assert.equal(created.props.recolor_preserve_shading, 0);
  const frames = (value: number) => value * 30;
  assert.equal(Math.abs(frames(created.timeline_start) - Math.round(frames(created.timeline_start))) < 1e-9, true,
    `timeline_start ${created.timeline_start} is not frame-aligned`);
  assert.equal(Math.abs(frames(created.duration) - Math.round(frames(created.duration))) < 1e-9, true,
    `duration ${created.duration} is not frame-aligned`);
});

test("a patch that slides a clip onto its neighbour is refused", () => {
  const projectId = "guard-move-overlap";
  const revision = seed(projectId);
  // B lives at 4–8s; moving A to 2s makes it run 2–6s, straight through B.
  const raw = head(projectId, revision, [{
    element_id: ELEMENT_A,
    patch: { timeline_start: 2 },
  }]);

  assert.throws(
    () => validateEditorAgentProposalAgainstProject(raw, 24, projectId),
    /Visual overlap on visual_0/,
  );
});

test("a move that lands flush against a neighbour is allowed", () => {
  const projectId = "guard-move-flush";
  const revision = seed(projectId);
  // A shortened to 2s and B pulled back to meet it exactly at 2s: touching, not overlapping.
  const raw = head(projectId, revision, [
    { element_id: ELEMENT_A, patch: { duration: 2 } },
    { element_id: ELEMENT_B, patch: { timeline_start: 2 } },
  ], 2);

  const validated = validateEditorAgentProposalAgainstProject(raw, 24, projectId);
  assert.equal(validated.options[0]!.operations.length, 2);
});

test("moving a clip to a free span on the same lane stays allowed", () => {
  const projectId = "guard-move-free-span";
  const revision = seed(projectId);
  const raw = head(projectId, revision, [{
    element_id: ELEMENT_A,
    patch: { timeline_start: 12 },
  }]);

  const validated = validateEditorAgentProposalAgainstProject(raw, 24, projectId);
  assert.equal(validated.options[0]!.operations[0]!.patch?.timeline_start, 12);
});
