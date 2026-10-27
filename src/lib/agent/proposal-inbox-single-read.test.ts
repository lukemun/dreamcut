import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { timelineRevision, validateEditorAgentProposalAgainstProject } from "@/lib/agent/timeline-editor-agent-apply";
import { proposalBaseValues, proposalElementFingerprints } from "@/lib/agent/proposal-staleness";
import { readProposal, saveProposal } from "@/lib/local-store/proposals";
import { createProject, readTimeline, writeTimeline } from "@/lib/local-store/store";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { GET as listRoute } from "../../app/api/projects/[projectId]/timeline/proposals/route";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-inbox-single-read-"));
process.env.TIMELINE_PROJECTS_DIR = root;
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

const CARD_CLIP = "11111111-1111-4111-8111-111111111111";
const OTHER_CLIP = "22222222-2222-4222-8222-222222222222";

function element(id: string, overrides: Partial<TimelineElement> = {}): TimelineElement {
  const now = "2026-10-10T00:00:00.000Z";
  return {
    id, project_id: "fixture", type: "video_clip", source_url: "/api/projects/x/media/shot.mp4",
    props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 4, lane_key: "visual_0",
    lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now,
    ...overrides,
  };
}

/** Counts reads of the project's timeline.json while `run` runs. */
async function timelineReads(projectId: string, run: () => Promise<unknown>) {
  const target = path.resolve(root, projectId, "timeline.json");
  const original = fs.readFileSync;
  let reads = 0;
  fs.readFileSync = ((file: fs.PathOrFileDescriptor, ...rest: unknown[]) => {
    if (typeof file === "string" && path.resolve(file) === target) reads += 1;
    return (original as (...args: unknown[]) => unknown)(file, ...rest);
  }) as typeof fs.readFileSync;
  try { await run(); } finally { fs.readFileSync = original; }
  return reads;
}

test("the inbox reads the timeline once after a human edit and reports against that read", async () => {
  const projectId = "inbox-single-read";
  createProject(projectId, "web");
  writeTimeline(projectId, { elements: [element(CARD_CLIP), element(OTHER_CLIP, { timeline_start: 4 })], transitions: [] }, "fixture");
  const proposal = validateEditorAgentProposalAgainstProject({
    schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId), mode: "workshop", decision: "propose",
    summary: "Tighten it.", assumptions: [], unresolved_gaps: [], caps: { max_mutations: 24, requested_mutations: 1, max_renders: 0 },
    options: [{ id: "tighten", label: "Tighten", recommended: true, summary: "Shorter.", requested_mutations: 1,
      operations: [{ element_id: CARD_CLIP, patch: { duration: 3 } }] }],
  }, 24, projectId);
  const record = saveProposal(projectId, proposal, { touchedFingerprints: proposalElementFingerprints(readTimeline(projectId), proposal),
    touchedBaseValues: proposalBaseValues(readTimeline(projectId), proposal) });

  // A human edit to a clip the card does not touch: the card is carried onto the new revision.
  const timeline = readTimeline(projectId);
  writeTimeline(projectId, { ...timeline, elements: timeline.elements.map(row => row.id === OTHER_CLIP ? { ...row, volume: 0.5 } : row) }, "fixture");
  const revision = createHash("sha256").update(fs.readFileSync(path.join(root, projectId, "timeline.json"))).digest("hex");

  let body: { revision: string; details: Record<string, { stale: boolean; review: { playback_range?: unknown }[] }> } | undefined;
  const reads = await timelineReads(projectId, async () => {
    const response = await listRoute(new Request(`http://localhost/api/projects/${projectId}/timeline/proposals?include=pending_details`),
      { params: Promise.resolve({ projectId }) });
    body = await response.json();
  });
  assert.equal(reads, 1);
  assert.equal(body!.revision, revision);
  assert.equal(readProposal(projectId, record.proposal_id).proposal.expected_revision, revision);
  const detail = body!.details[record.proposal_id]!;
  assert.equal(detail.stale, false);
  assert.ok(detail.review[0]?.playback_range, "the card's preview derived onto the frozen snapshot");
});
