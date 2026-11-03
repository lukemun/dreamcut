import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { timelineRevision, validateEditorAgentProposalAgainstProject } from "@/lib/agent/timeline-editor-agent-apply";
import { createProject, readTimeline, writeTimeline, type TimelineFile } from "@/lib/local-store/store";
import { assertGpuWriteAdmissible, gpuWriteAdmissionIssues, GpuWriteAdmissionError } from "./gpu-write-admission";

/**
 * GPU-first rule for agent-authored writes
 * (docs/architecture/playback-rendering.md#gpu-first-feature-rule): proposals and
 * agent_workspace direct mutations may not introduce content Browser GPU cannot draw.
 */
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gpu-write-admission-"));
process.env.TIMELINE_PROJECTS_DIR = root;
const LEASE_FILENAME = ".agent-mcp-write.json"; // mcp/proposal-gate.mjs AGENT_WRITE_LEASE_FILENAME

const VIDEO = "11111111-1111-4111-8111-111111111111";
const CAPTION = "22222222-2222-4222-8222-222222222222";
const SPLIT = "33333333-3333-4333-8333-333333333333";

function element(id: string, overrides: Partial<TimelineElement> = {}): TimelineElement {
  const now = "2026-10-09T00:00:00.000Z";
  return {
    id, project_id: "fixture", type: "video_clip", source_url: "/api/projects/x/media/shot.mp4",
    props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 4, lane_key: "visual_0",
    lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now,
    ...overrides,
  };
}
const caption = (props: Record<string, unknown> = {}) => element(CAPTION, {
  type: "caption_text", source_url: null, lane_key: "captions_0", props: { text: "Hello", ...props },
});
const timeline = (...elements: TimelineElement[]): TimelineFile => ({ elements, transitions: [] });

test("an unsupported prop on a written element is rejected with an actionable message", () => {
  const before = timeline(element(VIDEO));
  for (const prop of ["glass_lens_magnification", "legacy_unadmitted_effect"]) {
    const after = timeline(element(VIDEO, { props: { [prop]: prop === "glass_lens_magnification" ? 2 : true } }));
    assert.throws(() => assertGpuWriteAdmissible(before, after, "Test write"), (error: unknown) => {
      assert.ok(error instanceof GpuWriteAdmissionError);
      assert.equal(error.status, 422);
      assert.equal(error.issues[0].capability, `property:${prop}`);
      assert.match(error.message, new RegExp(`video_clip ${VIDEO} uses property:${prop}, which Browser GPU cannot draw yet`));
      assert.match(error.message, /use a supported alternative or extend the GPU renderer first/);
      return true;
    }, prop);
  }
});

test("bookkeeping props and source-preparation-only gaps are admitted", () => {
  // A still with no prepared source reports only a `source` issue; preparation is checked separately.
  const after = timeline(
    element(VIDEO, { props: { editorial_note: "agent pick", label: "Hero", split_from_id: VIDEO, source_probe_fps: 30 } }),
    element(SPLIT, { type: "still", source_url: null, timeline_start: 4 }),
    caption({ caption_review_only: false, caption_source_text: "Hello" }),
  );
  assert.deepEqual(gpuWriteAdmissionIssues(timeline(), after), []);
});

test("legacy gaps already on the timeline never block an unrelated write", () => {
  const legacy = element(VIDEO, { props: { legacy_unadmitted_effect: true } });
  const before = timeline(legacy);
  // Retiming the legacy clip and adding a supported caption introduces nothing new.
  assert.deepEqual(gpuWriteAdmissionIssues(before, timeline({ ...legacy, duration: 3 }, caption())), []);
  // Splitting legacy content carries its existing gap; it is not a new one.
  const split = element(SPLIT, { timeline_start: 3, duration: 1, props: { legacy_unadmitted_effect: true, split_from_id: VIDEO } });
  assert.deepEqual(gpuWriteAdmissionIssues(before, timeline({ ...legacy, duration: 3 }, split)), []);
  // A new gap on the same legacy element is still reported.
  const worse = { ...legacy, props: { ...legacy.props, glass_lens_magnification: 2 } };
  assert.deepEqual(gpuWriteAdmissionIssues(before, timeline(worse)).map(issue => issue.capability), ["property:glass_lens_magnification"]);
});

test("proposal validation (create, preflight, batch and approval) rejects a non-GPU option", () => {
  const projectId = "gpu-proposal";
  createProject(projectId, "web");
  writeTimeline(projectId, timeline(element(VIDEO)), "fixture");
  const proposal = (props: Record<string, unknown>) => ({
    schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId), mode: "workshop",
    decision: "propose", summary: "GPU fixture.", assumptions: [], unresolved_gaps: [],
    caps: { max_mutations: 24, requested_mutations: 2, max_renders: 0 },
    options: [{ id: "only", label: "Only", recommended: true, summary: "GPU fixture.", requested_mutations: 2,
      operations: [{ element_id: VIDEO, props }] }],
  });
  // A grid matte without its prepared source mask cannot be drawn by CanvasKit. (Caption
  // word presets on media are admitted: both renderers share the animation frame.)
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(proposal({ grid_matte_cell_size: 90, grid_matte_coverage: 2 }), 24, projectId),
    /Proposal option only rejected: video_clip .* uses grid-matte, which Browser GPU cannot draw yet/,
  );
  assert.doesNotThrow(() => validateEditorAgentProposalAgainstProject(proposal({ animationIn: "word_pop", animationInDuration: 0.4 }), 24, projectId));
  assert.doesNotThrow(() => validateEditorAgentProposalAgainstProject(proposal({ animationIn: "fade", animationInDuration: 0.4 }), 24, projectId));
});

test("leased agent_workspace writes are admitted at the safe-write layer; human writes are not gated", () => {
  const projectId = "gpu-workspace";
  createProject(projectId, "web", "GPU workspace", { agentWorkspace: true });
  const lease = path.join(root, projectId, LEASE_FILENAME);
  const leased = (run: () => void) => {
    fs.writeFileSync(lease, JSON.stringify({ tool: "element_props_patch", expires_at_ms: Date.now() + 60_000 }));
    try { run(); } finally { fs.rmSync(lease, { force: true }); }
  };
  leased(() => writeTimeline(projectId, timeline(element(VIDEO, { props: { editorial_note: "ok" } })), "element_create"));
  leased(() => assert.throws(
    () => writeTimeline(projectId, timeline(element(VIDEO, { props: { glass_lens_magnification: 2 } })), "element_props_patch"),
    (error: unknown) => error instanceof GpuWriteAdmissionError && /Agent workspace write element_props_patch rejected/.test(error.message),
  ));
  assert.equal(readTimeline(projectId).elements[0].props?.glass_lens_magnification, undefined, "a rejected write leaves the timeline unchanged");
  // An unleased write is the human's (and revokes the grant); it is not an agent write.
  writeTimeline(projectId, timeline(element(VIDEO, { props: { glass_lens_magnification: 2 } })), "element_props_patch");
  assert.equal(readTimeline(projectId).elements[0].props?.glass_lens_magnification, 2);
});

test("a new video-filled title is admitted with its verified fill preview, and refused without one", () => {
  const sourceUrl = "/api/projects/x/media/sources/song.mp4", previewUrl = "/api/projects/x/media/.prepared/song/preview.mp4";
  const title = caption({ text: "LOSER", styleVariant: "image_fill", animationIn: "write_on", mediaFillVideoUrl: sourceUrl, mediaFillVideoPreviewUrl: previewUrl });
  const before = timeline(), after = timeline(title);
  const verified = { contract: "preview-proxy-v1", url: previewUrl, ok: true, width: 960, height: 394, quality: "detail" };
  const prepare = () => ({ sourceUrl, previewUrl, alpha: false, validation: verified });
  assert.deepEqual(gpuWriteAdmissionIssues(before, after, prepare), []);
  // Without server evidence, or with an unverified proxy, the fill cannot prove its preview source.
  assert.deepEqual(gpuWriteAdmissionIssues(before, after).map(issue => issue.capability), ["caption-fill-source"]);
  assert.deepEqual(gpuWriteAdmissionIssues(before, after, () => ({ ...prepare(), validation: { ...verified, ok: false } })).map(issue => issue.capability), ["caption-fill-source"]);
  assert.deepEqual(gpuWriteAdmissionIssues(before, after, () => null).map(issue => issue.capability), ["caption-fill-source"]);
});
