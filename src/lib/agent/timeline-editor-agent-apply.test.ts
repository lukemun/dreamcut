import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { writePreparation } from "@/lib/local-store/media-preparation";

import {
  applyEditorAgentProposal,
  deriveProposalTimeline,
  editorAgentPropsSchema,
  editorAgentCapabilities,
  inspectEditorAgentProject,
  mergeBatchLaneOrderKeys,
  previewEditorAgentProposal,
  timelineRevision,
  validateEditorAgentProposal,
  proposalWarnings,
  validateEditorAgentProposalAgainstProject,
  defaultReviewControls,
  withDefaultReviewControls,
} from "@/lib/agent/timeline-editor-agent-apply";
import { reviewOperation } from "@/lib/agent/proposal-review";
import { projectHistoryDir, projectMediaDir, projectSourceManifestPath } from "@/lib/local-store/paths";
import { appendCustomCutout } from "@/lib/local-store/custom-cutouts";
import { ANIMATED_TRANSFORM_PRECISION, clampMediaOffset, clampMediaScale, resolveMaskInsetAtTime } from "@/lib/timeline/media-transform";
import { readKeyframeMap } from "@/lib/timeline/keyframes";
import { resolveCaptionAnchorLayout, resolveCaptionProps } from "@/lib/timeline/captions";
import { createProject, readMetadata, readTimeline, writeTimeline } from "@/lib/local-store/store";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { speedStepDuration, timelineTimeToSourceTime } from "@/lib/timeline/speed-steps";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-editor-agent-apply-"));
process.env.TIMELINE_PROJECTS_DIR = root;

test("proposal props expose bounded benchmark-card rotation", () => {
  assert.equal(editorAgentPropsSchema.parse({ benchmarkRotationDeg: -4 }).benchmarkRotationDeg, -4);
  assert.equal(editorAgentPropsSchema.parse({ maxWidth: 1 }).maxWidth, 1);
  assert.deepEqual(
    editorAgentPropsSchema.parse({ sticker_outline: true, sticker_outline_width: 10 }),
    { sticker_outline: true, sticker_outline_width: 10 },
  );
  assert.throws(() => editorAgentPropsSchema.parse({ sticker_outline: true, sticker_outline_width: 33 }));
  assert.throws(() => editorAgentPropsSchema.parse({ benchmarkRotationDeg: 9 }));
  assert.deepEqual(
    editorAgentPropsSchema.parse({ benchmarkStackLayout: { kind: "upper_canvas_pile", index: 16, total: 17 } }).benchmarkStackLayout,
    { kind: "upper_canvas_pile", index: 16, total: 17 },
  );
  assert.deepEqual(
    editorAgentPropsSchema.parse({ benchmarkStackLayout: { kind: "upper_canvas_cover", index: 16, total: 17 } }).benchmarkStackLayout,
    { kind: "upper_canvas_cover", index: 16, total: 17 },
  );
  assert.deepEqual(
    editorAgentPropsSchema.parse({ benchmarkStackLayout: { kind: "featured_benchmark_stack", index: 2, total: 3 } }).benchmarkStackLayout,
    { kind: "featured_benchmark_stack", index: 2, total: 3 },
  );
  assert.throws(() => editorAgentPropsSchema.parse({ benchmarkStackLayout: { kind: "upper_canvas_pile", index: 17, total: 17 } }));
});

test("proposal props permit bounded caption edge bleed", () => {
  assert.deepEqual(editorAgentPropsSchema.parse({ absX: -0.2, absY: 1.2 }), { absX: -0.2, absY: 1.2 });
  assert.throws(() => editorAgentPropsSchema.parse({ absX: -0.51 }));
  assert.throws(() => editorAgentPropsSchema.parse({ absY: 1.51 }));
});

function preparedVideoFixture(projectId: string, source: string, duration: number, alpha = false) {
  const file = path.join(projectMediaDir(projectId), source);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "fixture video");
  const preview = source + ".preview.mp4";
  fs.writeFileSync(path.join(projectMediaDir(projectId), preview), "fixture proxy");
  const stat = fs.statSync(file);
  writePreparation(projectId, { recipe: "editor-media-v1", source, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview, render: source, duration, alpha });
}

function element(id = "11111111-1111-4111-8111-111111111111"): TimelineElement {
  const now = "2026-07-13T00:00:00.000Z";
  return {
    id, project_id: "fixture", type: "video_clip", source_url: null, props: { existing: true }, beat_id: null,
    character_id: null, timeline_start: 0, duration: 2, lane_key: "visual_0", lane_index: 0,
    trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now,
  };
}

test("letter fall is native text only and keeps all delayed releases inside its clip", async () => {
  const projectId = "letter-fall-contract";
  const caption = {...element(), project_id: projectId, type: "caption_text" as const, lane_key: "captions_0",
    props: {text:"Goulash"}};
  createProject(projectId,"web");
  writeTimeline(projectId,{elements:[caption],transitions:[]},"fixture");
  const raw = proposal(projectId,timelineRevision(projectId),{
    operations:[{element_id:caption.id,props:{letter_fall_start_seconds:1,letter_fall_seconds:.45,letter_fall_stagger_seconds:.04}}],
    caps:{max_mutations:3,requested_mutations:3,max_renders:0},
  });
  // Browser GPU (CanvasKit) draws letter fall from the shared owner, so the GPU-first
  // write admission accepts it (docs/architecture/playback-rendering.md#gpu-first-feature-rule).
  assert.doesNotThrow(()=>validateEditorAgentProposalAgainstProject(raw,3,projectId));
  const late = proposal(projectId,timelineRevision(projectId),{
    operations:[{element_id:caption.id,props:{letter_fall_start_seconds:1.8,letter_fall_seconds:.45,letter_fall_stagger_seconds:.04}}],
    caps:{max_mutations:3,requested_mutations:3,max_renders:0},
  });
  assert.throws(()=>validateEditorAgentProposalAgainstProject(late,3,projectId),/finish within/);
  // The derivation contract (shared by preview and approval) still bounds delayed releases.
  const derived=deriveProposalTimeline(readTimeline(projectId),[{element_id:caption.id,props:{letter_fall_start_seconds:1,letter_fall_seconds:.45,letter_fall_stagger_seconds:.04}}] as Parameters<typeof deriveProposalTimeline>[1],projectId);
  assert.equal(derived.timeline.elements[0]!.props?.letter_fall_seconds,.45);
  assert.throws(()=>deriveProposalTimeline(readTimeline(projectId),[{element_id:caption.id,props:{letter_fall_start_seconds:1.8}}] as Parameters<typeof deriveProposalTimeline>[1],projectId),/finish within/);
});

test("batch lane-order merge keeps lanes introduced by an earlier selected proposal", () => {
  assert.deepEqual(mergeBatchLaneOrderKeys(
    ["captions_9", "captions_0", "visual_15", "visual_14", "visual_10", "visual_9", "visual_0"],
    ["captions_9", "captions_0", "visual_9", "visual_0"],
  ), ["captions_9", "captions_0", "visual_15", "visual_14", "visual_10", "visual_9", "visual_0"]);
});

test("layered caption graphics may move across registered stack lanes while video keeps the tight lane guard", () => {
  const caption = {
    ...element(),
    type: "caption_text" as const,
    lane_key: "captions_1",
    lane_index: 1,
    props: { text: "Benchmark card" },
  };
  createProject("caption-stack-lane-delta", "web");
  writeTimeline("caption-stack-lane-delta", { elements: [caption], transitions: [] }, "fixture");
  const captionMove = proposal("caption-stack-lane-delta", timelineRevision("caption-stack-lane-delta"), {
    operations: [{ element_id: caption.id, patch: { lane_key: "captions_17", lane_index: 17 } }],
    caps: { max_mutations: 2, requested_mutations: 2, max_renders: 0 },
  });
  assert.doesNotThrow(() => validateEditorAgentProposalAgainstProject(captionMove, 2, "caption-stack-lane-delta"));

  createProject("video-lane-delta", "web");
  writeTimeline("video-lane-delta", { elements: [element()], transitions: [] }, "fixture");
  const videoMove = proposal("video-lane-delta", timelineRevision("video-lane-delta"), {
    operations: [{ element_id: element().id, patch: { lane_key: "visual_17", lane_index: 17 } }],
    caps: { max_mutations: 2, requested_mutations: 2, max_renders: 0 },
  });
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(videoMove, 2, "video-lane-delta"),
    /lane_index change exceeds the per-operation delta cap of 4/,
  );
});

function proposal(projectId: string, revision: string, overrides: Record<string, unknown> = {}) {
  const result = {
    schema_version: 1,
    project_id: projectId,
    expected_revision: revision,
    mode: "workshop",
    decision: "propose",
    summary: "Move and scale the selected visual.",
    assumptions: [],
    operations: [{
      element_id: "11111111-1111-4111-8111-111111111111",
      patch: { timeline_start: 1 },
      props: { media_scale: 1.25 },
    }],
    unresolved_gaps: [],
    caps: { max_mutations: 3, requested_mutations: 2, max_renders: 0 },
    ...overrides,
  };
  if (!("caps" in overrides)) {
    const operations = result.operations as Array<{ patch?: Record<string, unknown>; props?: Record<string, unknown>; clear_patch?: unknown[]; clear_props?: unknown[] }>;
    result.caps.requested_mutations = operations.reduce((sum, operation) => sum
      + Object.keys(operation.patch ?? {}).length + Object.keys(operation.props ?? {}).length
      + (operation.clear_patch?.length ?? 0) + (operation.clear_props?.length ?? 0), 0);
  }
  return result;
}

test("inspect returns a content revision and active project snapshot", () => {
  createProject("inspect", "web");
  writeTimeline("inspect", { elements: [element()], transitions: [] }, "fixture");
  const result = inspectEditorAgentProject("inspect");
  assert.match(result.revision, /^[0-9a-f]{64}$/);
  assert.equal(result.elements.length, 1);
});

test("semantic visual layout resolves named safe-grid motion without agent-authored coordinates", () => {
  createProject("semantic-layout", "web");
  writeTimeline("semantic-layout", { elements: [element()], transitions: [] }, "fixture");
  const raw = proposal("semantic-layout", timelineRevision("semantic-layout"), {
    operations: [{
      element_id: element().id,
      props: {
        semanticLayout: {
          slot: "upper_right",
          size: "supporting",
          motion: {
            from_slot: "center",
            to_slot: "upper_right",
            start_seconds: 1,
            duration_seconds: 0.5,
            ease: "easeInOut",
          },
        },
      },
    }],
  });
  const validated = validateEditorAgentProposalAgainstProject(raw, 3, "semantic-layout");
  const preview = previewEditorAgentProposal(validated);
  const props = preview.timeline.elements[0]!.props as Record<string, unknown>;
  assert.equal(props.media_scale, 0.38);
  assert.equal(props.media_offset_x, 0);
  assert.deepEqual((props.semantic_layout as Record<string, unknown>).slot, "upper_right");
  assert.deepEqual((props.keyframes as Record<string, unknown>).media_offset_x, [
    { t: 0, v: 0, ease: "hold" },
    { t: 1, v: 0, ease: "easeInOut" },
    { t: 1.5, v: 0.6, ease: "hold" },
  ]);
  const review = reviewOperation(readTimeline("semantic-layout"), validated.options[0]!.operations[0]!);
  assert.equal(review.action, "Arrange visual");
  assert.match(review.changes[0]!.after, /center → upper_right/);
});

test("native graphic text can be proposed without replacing the speech-caption rail", () => {
  const projectId = "graphic-text-create";
  createProject(projectId, "reels");
  writeTimeline(projectId, { elements: [element()], transitions: [] }, "fixture");
  const createText = {
    text: "GPT-6 ASTRA",
    title: "OpenAI model label",
    timeline_start: 1.2,
    duration_seconds: 3.4,
    lane_key: "captions_18",
    lane_index: 18,
    positionPreset: "top_right",
    fontPreset: "anton",
    fontSizePx: 92,
    styleVariant: "bold_outline",
    maxWidth: 0.42,
    textAlign: "left",
    textColor: "#ffffff",
    animationIn: "pop",
    animationOut: "fade",
    animationInDuration: 0.12,
    animationOutDuration: 0.16,
  } as const;
  const mutationCount = Object.keys(createText).length;
  const raw = proposal(projectId, timelineRevision(projectId), {
    caps: { max_mutations: mutationCount, requested_mutations: mutationCount, max_renders: 0 },
    operations: [{
      element_id: "77777777-7777-4777-8777-777777777777",
      create_text: createText,
    }],
  });
  const validated = validateEditorAgentProposalAgainstProject(raw, mutationCount, projectId);
  const preview = previewEditorAgentProposal(validated);
  const label = preview.timeline.elements.find((entry) => entry.id === "77777777-7777-4777-8777-777777777777")!;
  assert.equal(label.type, "caption_text");
  assert.equal(label.props?.text, "GPT-6 ASTRA");
  assert.equal(label.props?.singleLine, true);
  assert.equal(label.props?.graphic_text_role, "native_label");
  assert.equal(reviewOperation(readTimeline(projectId), validated.options[0]!.operations[0]!).action, "Add graphic text");

  const overlap = structuredClone(raw);
  overlap.operations.push({
    element_id: "88888888-8888-4888-8888-888888888888",
    create_text: { ...createText, text: "FABLE 5.1" },
  });
  overlap.caps.max_mutations = mutationCount * 2;
  overlap.caps.requested_mutations = mutationCount * 2;
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(overlap, mutationCount * 2, projectId),
    /Overlapping graphic text requires a separate caption lane/,
  );
});

test("crowd layout resolves each person into a separate staggered fan position", () => {
  createProject("crowd-layout", "web");
  writeTimeline("crowd-layout", { elements: [element()], transitions: [] }, "fixture");
  const raw = proposal("crowd-layout", timelineRevision("crowd-layout"), {
    operations: [{
      element_id: element().id,
      props: { crowdLayout: { region: "upper_left_fan", index: 7, total: 10 } },
    }],
  });
  const validated = validateEditorAgentProposalAgainstProject(raw, 3, "crowd-layout");
  const preview = previewEditorAgentProposal(validated);
  const props = preview.timeline.elements[0]!.props as Record<string, unknown>;
  assert.equal(props.media_scale, 0.21);
  assert.equal(props.media_offset_x, -0.26);
  assert.equal(props.media_offset_y, -0.38);
  assert.deepEqual(props.crowd_layout, { schema_version: 1, region: "upper_left_fan", index: 7, total: 10 });
  const review = reviewOperation(readTimeline("crowd-layout"), validated.options[0]!.operations[0]!);
  assert.equal(review.action, "Arrange visual");
  assert.match(review.changes[0]!.after, /upper_left_fan · 8\/10/);

  const withRawCoordinates = structuredClone(raw);
  withRawCoordinates.operations[0]!.props.media_scale = 0.5;
  withRawCoordinates.caps.max_mutations = 2;
  withRawCoordinates.caps.requested_mutations = 2;
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(withRawCoordinates, 2, "crowd-layout"),
    /Crowd layout cannot be combined with raw visual coordinates/,
  );

  const tight = proposal("crowd-layout", timelineRevision("crowd-layout"), {
    operations: [{
      element_id: element().id,
      props: { crowdLayout: { region: "upper_center_cluster", index: 7, total: 10 } },
    }],
  });
  const tightPreview = previewEditorAgentProposal(
    validateEditorAgentProposalAgainstProject(tight, 3, "crowd-layout"),
  );
  assert.deepEqual(tightPreview.timeline.elements[0]!.props?.crowd_layout, {
    schema_version: 1,
    region: "upper_center_cluster",
    index: 7,
    total: 10,
  });
});

test("new still visuals use semantic grid placement instead of agent-authored coordinates", () => {
  createProject("semantic-create", "web");
  writeTimeline("semantic-create", { elements: [element()], transitions: [] }, "fixture");
  const operation = {
    element_id: "99999999-0000-4000-8000-000000000001",
    create_visual: {
      type: "still",
      source_url: "/api/projects/semantic-create/media/sources/woman.png",
      title: "Illustrated woman",
      timeline_start: 1,
      duration_seconds: 2,
      lane_key: "visual_1",
      lane_index: 1,
      has_alpha: true,
      semanticLayout: { slot: "center_left", size: "peer" },
    },
  };
  const raw = proposal("semantic-create", timelineRevision("semantic-create"), {
    operations: [operation],
    caps: { max_mutations: 9, requested_mutations: 9, max_renders: 0 },
  });
  const validated = validateEditorAgentProposalAgainstProject(raw, 9, "semantic-create");
  const preview = previewEditorAgentProposal(validated);
  const created = preview.timeline.elements.find((candidate) => candidate.id === operation.element_id)!;
  assert.equal(created.props?.media_scale, 0.48);
  assert.equal(created.props?.media_offset_x, -0.6);
  assert.equal(created.props?.media_offset_y, 0);
  assert.equal((created.props?.semantic_layout as Record<string, unknown>).slot, "center_left");

  const withCoordinates = structuredClone(raw);
  withCoordinates.operations[0]!.create_visual!.media_offset_x = -0.4;
  withCoordinates.caps.max_mutations = 10;
  withCoordinates.caps.requested_mutations = 10;
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(withCoordinates, 10, "semantic-create"),
    /semantic layout cannot be combined with raw visual coordinates/,
  );
});

test("validated apply uses shared patch semantics and writes one bracketed history entry", async () => {
  createProject("apply", "web");
  writeTimeline("apply", { elements: [element()], transitions: [] }, "fixture");
  const beforeHistory = fs.readdirSync(projectHistoryDir("apply")).length;
  const result = await applyEditorAgentProposal(proposal("apply", timelineRevision("apply")), 3);
  const updated = readTimeline("apply").elements[0]!;
  assert.equal(result.mutation_count, 2);
  assert.equal(result.operation_count, 1);
  assert.equal(updated.timeline_start, 1);
  assert.equal(updated.props?.existing, true);
  assert.equal(updated.props?.media_scale, 1.25);
  // One write, bracketed by explicit before/after snapshots so the editor can
  // surface the approval as a single visible Undo entry.
  assert.equal(fs.readdirSync(projectHistoryDir("apply")).length, beforeHistory + 3);
});

test("proposal volume patches keep scalar gain and the render envelope synchronized", async () => {
  createProject("mute-video-audio", "web");
  const video = {
    ...element(),
    project_id: "mute-video-audio",
    source_url: "/api/projects/mute-video-audio/media/take.mp4",
    props: {
      volume_envelope: [
        { time_seconds: 0, volume: 1 },
        { time_seconds: 1, volume: 1.2 },
        { time_seconds: 2, volume: 1 },
      ],
    },
  };
  writeTimeline("mute-video-audio", { elements: [video], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "mute-video-audio",
    expected_revision: timelineRevision("mute-video-audio"),
    mode: "workshop",
    decision: "propose",
    summary: "Move narration to one continuous audio authority.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    options: [{
      id: "mute-embedded",
      label: "Mute embedded audio",
      recommended: true,
      summary: "Silence the embedded copy.",
      requested_mutations: 1,
      operations: [{ element_id: video.id, patch: { volume: 0 } }],
    }],
  } as const;

  await applyEditorAgentProposal(raw, 1);
  const updated = readTimeline("mute-video-audio").elements[0]!;
  assert.equal(updated.volume, 0);
  assert.deepEqual(updated.props?.volume_envelope, [
    { time_seconds: 0, volume: 0 },
    { time_seconds: 2, volume: 0 },
  ]);
});

test("proposal props can author an explicit editable volume envelope", async () => {
  createProject("duck-music-envelope", "web");
  const music = {
    ...element(),
    project_id: "duck-music-envelope",
    type: "music" as const,
    lane_key: "music_0",
    source_url: "/api/projects/duck-music-envelope/media/score.ogg",
    duration: 6,
    props: {},
  };
  writeTimeline("duck-music-envelope", { elements: [music], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "duck-music-envelope",
    expected_revision: timelineRevision("duck-music-envelope"),
    mode: "workshop",
    decision: "propose",
    summary: "Duck music beneath narration.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    options: [{
      id: "duck",
      label: "Duck music",
      recommended: true,
      summary: "Keep the music present beneath the voice.",
      requested_mutations: 1,
      operations: [{
        element_id: music.id,
        props: {
          volume_envelope: [
            { time_seconds: 0, volume: 0 },
            { time_seconds: 1, volume: 0.14 },
            { time_seconds: 5.5, volume: 0.14 },
            { time_seconds: 6, volume: 0 },
          ],
        },
      }],
    }],
  } as const;

  await applyEditorAgentProposal(raw, 1);
  const updated = readTimeline("duck-music-envelope").elements[0]!;
  assert.deepEqual(updated.props?.volume_envelope, [
    { time_seconds: 0, volume: 0 },
    { time_seconds: 1, volume: 0.14 },
    { time_seconds: 5.5, volume: 0.14 },
    { time_seconds: 6, volume: 0 },
  ]);
});

test("a speech clip playing its prepared copy syncs to cutouts of the archival take", async () => {
  // Editor playback copies live under .prepared/<recipe>/<archival sha>/; the clip's authority is the managed take.
  const projectId = "speech-visual-prepared-copy";
  createProject(projectId, "web");
  const take = Buffer.from("managed take bytes");
  const takeHash = createHash("sha256").update(take).digest("hex");
  fs.mkdirSync(path.join(projectMediaDir(projectId), "sources"), { recursive: true });
  fs.writeFileSync(path.join(projectMediaDir(projectId), "sources/take.mov"), take);
  fs.writeFileSync(projectSourceManifestPath(projectId), JSON.stringify({ assets: [{ media_path: "sources/take.mov", storage_mode: "managed_copy", source_sha256: takeHash }] }));
  const speechFor = (hashInPath: string) => ({
    ...element("11111111-1111-4111-8111-111111111111"),
    project_id: projectId,
    source_url: `/api/projects/${projectId}/media/.prepared/editor-media-v1/${hashInPath}/job/render.mov`,
    duration: 20,
    trim_start: 10,
    trim_end: 8,
    playback_rate: 1,
    props: { source_duration_seconds: 38, archival_source_url: `/api/projects/${projectId}/media/sources/take.mov` },
  });
  const cutout = {
    ...element("22222222-2222-4222-8222-222222222222"),
    project_id: projectId,
    source_url: `/api/projects/${projectId}/media/cutouts/talking-head.webm`,
    timeline_start: 8,
    duration: 5,
    playback_rate: 1,
    lane_key: "visual_2",
    lane_index: 2,
    props: { source_duration_seconds: 5, custom_cutout_receipt: { source_sha256: takeHash, source_interval_seconds: [18, 23] } },
  };
  const proposal = () => ({
    schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId), mode: "workshop", decision: "propose",
    summary: "Sync picture to the prepared speech clip.", assumptions: [], unresolved_gaps: [],
    caps: { max_mutations: 4, requested_mutations: 4, max_renders: 0 },
    options: [{ id: "sync", label: "Sync", recommended: true, summary: "Sync.", requested_mutations: 4,
      operations: [{ element_id: cutout.id, sync_speech_visual: { source_element_id: "11111111-1111-4111-8111-111111111111", source_sha256: takeHash, source_start_seconds: 18, source_end_seconds: 23 } }] }],
  });
  writeTimeline(projectId, { elements: [speechFor(takeHash), cutout], transitions: [] }, "fixture");
  const synced = previewEditorAgentProposal(validateEditorAgentProposalAgainstProject(proposal(), 4, projectId)).timeline.elements.find(entry => entry.id === cutout.id)!;
  assert.equal(synced.timeline_start, 8);
  // A prepared copy whose path names a different original does not inherit the take's authority.
  writeTimeline(projectId, { elements: [speechFor("b".repeat(64)), cutout], transitions: [] }, "fixture");
  assert.throws(() => previewEditorAgentProposal(validateEditorAgentProposalAgainstProject(proposal(), 4, projectId)), /source hashes must match/);
});

test("speech-derived visuals share the audible source clock and reject orphan retiming", async () => {
  const projectId = "speech-visual-sync";
  const sourceHash = "a".repeat(64);
  createProject(projectId, "web");
  const speech = {
    ...element("11111111-1111-4111-8111-111111111111"),
    project_id: projectId,
    duration: 20,
    trim_start: 10,
    trim_end: 8,
    playback_rate: 1.08,
    props: { source_sha256: sourceHash, source_duration_seconds: 39.6 },
  };
  const cutout = {
    ...element("22222222-2222-4222-8222-222222222222"),
    project_id: projectId,
    source_url: `/api/projects/${projectId}/media/cutouts/talking-head.webm`,
    timeline_start: 8,
    duration: 5,
    playback_rate: 1,
    lane_key: "visual_2",
    lane_index: 2,
    props: {
      source_duration_seconds: 5,
      custom_cutout_receipt: {
        source_sha256: sourceHash,
        source_interval_seconds: [18, 23],
      },
    },
  };
  writeTimeline(projectId, { elements: [speech, cutout], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: projectId,
    expected_revision: timelineRevision(projectId),
    mode: "workshop",
    decision: "propose",
    summary: "Synchronize the talking-head picture.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 4, requested_mutations: 4, max_renders: 0 },
    options: [{
      id: "sync-picture",
      label: "Sync picture",
      recommended: true,
      summary: "Bind picture to speech.",
      requested_mutations: 4,
      operations: [{
        element_id: cutout.id,
        sync_speech_visual: {
          source_element_id: speech.id,
          source_sha256: sourceHash,
          source_start_seconds: 18,
          source_end_seconds: 23,
        },
      }],
    }],
  } as const;
  const validated = validateEditorAgentProposalAgainstProject(raw, 4, projectId);
  const preview = previewEditorAgentProposal(validated);
  const synced = preview.timeline.elements.find((entry) => entry.id === cutout.id)!;
  assert.equal(synced.timeline_start, 7.4);
  assert.equal(synced.duration, 4.633333333333334);
  assert.equal(synced.playback_rate, 1.08);
  assert.equal(synced.voice_clip_id, speech.id);
  assert.equal((synced.props as Record<string, any>).speech_sync_binding.source_playback_rate, 1.08);

  await applyEditorAgentProposal(validated, 4);
  const replacementPath = "cutouts/talking-head-refined.webm";
  const previewPath = "cutouts/talking-head-preview.webm";
  fs.mkdirSync(path.join(projectMediaDir(projectId), "cutouts"), { recursive: true });
  fs.writeFileSync(path.join(projectMediaDir(projectId), previewPath), "preview-fixture");
  appendCustomCutout(projectId, {
    cutout_id: "33333333-3333-4333-8333-333333333333",
    recipe_id: "sam2-custom-cutout/v2",
    rgb_source_strategy: "direct-source-decode",
    source_relative_path: "sources/talking-head.mp4",
    source_sha256: sourceHash,
    source_interval_seconds: [18, 23],
    prompt_seconds: 20,
    prompt_frame: 60,
    positive_points_normalized: [{ x: 0.5, y: 0.5 }],
    negative_points_normalized: [],
    output_relative_path: replacementPath,
    preview: { relative_path: previewPath, sha256: createHash("sha256").update("preview-fixture").digest("hex"), frame_count: 150, duration_seconds: 5, width: 720, height: 1280, recipe: "test" },
    output_duration_seconds: 5,
    width: 1080,
    height: 1920,
    frame_rate: 30,
    frame_count: 150,
    alpha_mode: "1",
    evidence_directory: "instruments/custom-cutouts/refined",
    created_at: "2026-07-13T00:00:00.000Z",
  });
  const replacementProposal = proposal(projectId, timelineRevision(projectId), {
    caps: { max_mutations: 5, requested_mutations: 5, max_renders: 0 },
    operations: [{
      element_id: cutout.id,
      sync_speech_visual: {
        source_url: `/api/projects/${projectId}/media/${replacementPath}`,
        source_element_id: speech.id,
        source_sha256: sourceHash,
        source_start_seconds: 18,
        source_end_seconds: 23,
      },
    }],
  });
  const replacementValidated = validateEditorAgentProposalAgainstProject(replacementProposal, 5, projectId);
  const replacementPreview = previewEditorAgentProposal(replacementValidated).timeline.elements
    .find((entry) => entry.id === cutout.id)!;
  assert.equal(replacementPreview.source_url, `/api/projects/${projectId}/media/${replacementPath}`);
  assert.equal(replacementPreview.props?.preview_source_url, `/api/projects/${projectId}/media/${previewPath}`);
  fs.writeFileSync(path.join(projectMediaDir(projectId), previewPath), "changed-preview");
  assert.throws(() => validateEditorAgentProposalAgainstProject(replacementProposal, 5, projectId), /preview receipt/);
  assert.equal((replacementPreview.props as Record<string, any>).custom_cutout_receipt.output_relative_path, replacementPath);
  assert.equal((replacementPreview.props as Record<string, any>).speech_sync_binding.source_playback_rate, 1.08);

  const orphanPatch = proposal(projectId, timelineRevision(projectId), {
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    operations: [{ element_id: cutout.id, patch: { timeline_start: 9 } }],
  });
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(orphanPatch, 1, projectId),
    /source-bound; use sync_speech_visual/,
  );

  const orphanSourceRetime = proposal(projectId, timelineRevision(projectId), {
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    operations: [{ element_id: speech.id, patch: { playback_rate: 1.2 } }],
  });
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(orphanSourceRetime, 1, projectId),
    /must synchronize every linked talking-head visual/,
  );
});

test("audio creation proposals preserve explicit source boundaries through preview and approval", async () => {
  createProject("create-audio", "web");
  writeTimeline("create-audio", { elements: [element()], transitions: [] }, "fixture");
  const createAudio = {
    type: "sound_effect",
    source_url: "/api/sfx-catalog/media/impact.wav",
    title: "Epic impact",
    timeline_start: 6.18,
    source_duration_seconds: 4.866,
    source_start_seconds: 0,
    source_end_seconds: 2.333,
    lane_key: "sound_effect_0",
    lane_index: 0,
    volume: 1.17,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
  } as const;
  const raw = {
    schema_version: 2,
    project_id: "create-audio",
    expected_revision: timelineRevision("create-audio"),
    mode: "workshop",
    decision: "propose",
    summary: "Add the selected ending impact.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 13, requested_mutations: 13, max_renders: 0 },
    options: [{
      id: "epic-impact",
      label: "E · Epic Trailer Impact",
      recommended: true,
      summary: "Place the selected ending sound.",
      requested_mutations: 13,
      operations: [{
        element_id: "22222222-2222-4222-8222-222222222222",
        create_audio: createAudio,
        rationale: "Promotes the user's selected audition candidate at its approved timing and gain.",
      }],
    }],
  };
  const invalidCombined = structuredClone(raw);
  invalidCombined.caps.max_mutations = 15;
  invalidCombined.caps.requested_mutations = 15;
  invalidCombined.options[0]!.requested_mutations = 15;
  Object.assign(invalidCombined.options[0]!.operations[0]!, {
    set_preview_audio_source: {
      source_url: "/api/projects/create-audio/media/proxies/impact.m4a",
      baked_gain: 1,
    },
  });
  assert.throws(
    () => validateEditorAgentProposal(invalidCombined, 15),
    /Preview-audio repair can only accompany source_range_restore/,
  );
  const validated = validateEditorAgentProposalAgainstProject(raw, 13, "create-audio");
  const row = reviewOperation(readTimeline("create-audio"), validated.options[0]!.operations[0]!);
  assert.equal(row.action, "Add audio clip");
  assert.equal(row.element_label, "Epic impact");

  await applyEditorAgentProposal(validated, 13);
  const created = readTimeline("create-audio").elements.find((entry) => entry.id === "22222222-2222-4222-8222-222222222222");
  assert.ok(created);
  assert.equal(created.timeline_start, 6.18);
  assert.equal(created.duration, 2.333);
  assert.equal(created.trim_start, 0);
  assert.ok(Math.abs((created.trim_end ?? 0) - 2.533) < 1e-9);
  assert.equal(created.volume, 1.17);
});

test("audio creation proposals reject overlaps on the same lane", () => {
  createProject("reject-same-audio-lane", "web");
  const existingAudio: TimelineElement = {
    ...element(),
    type: "vo_segment",
    source_url: "/api/projects/reject-same-audio-lane/media/narration.mp3",
    lane_key: "audio_narrator",
    duration: 4,
  };
  writeTimeline("reject-same-audio-lane", { elements: [existingAudio], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "reject-same-audio-lane",
    expected_revision: timelineRevision("reject-same-audio-lane"),
    mode: "workshop",
    decision: "propose",
    summary: "Add another narration take.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 13, requested_mutations: 13, max_renders: 0 },
    options: [{
      id: "overlap-narration",
      label: "Overlapping narration",
      recommended: true,
      summary: "This must be rejected.",
      requested_mutations: 13,
      operations: [{
        element_id: "22222222-2222-4222-8222-222222222222",
        create_audio: {
          type: "vo_full",
          source_url: "/api/projects/reject-same-audio-lane/media/full.mp3",
          title: "Full narration",
          timeline_start: 0,
          source_duration_seconds: 10,
          source_start_seconds: 0,
          source_end_seconds: 10,
          lane_key: "audio_narrator",
          lane_index: 0,
          volume: 1,
          fade_in: 0,
          fade_out: 0,
          playback_rate: 1,
        },
      }],
    }],
  };

  assert.throws(
    () => validateEditorAgentProposalAgainstProject(raw, 13, "reject-same-audio-lane"),
    /Audio overlap on audio_narrator/,
  );
});

test("adjacent clip boundaries do not become overlaps from floating-point drift", () => {
  createProject("adjacent-boundary-tolerance", "web");
  writeTimeline("adjacent-boundary-tolerance", {
    elements: [
      { ...element(), duration: 4.4 },
      { ...element("22222222-2222-4222-8222-222222222222"), timeline_start: 4.4 },
    ],
    transitions: [],
  }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "adjacent-boundary-tolerance",
    expected_revision: timelineRevision("adjacent-boundary-tolerance"),
    mode: "workshop",
    decision: "propose",
    summary: "Move an adjacent sequence together.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 2, requested_mutations: 2, max_renders: 0 },
    options: [{
      id: "move-adjacent",
      label: "Move adjacent clips",
      recommended: true,
      summary: "Preserve their shared cut.",
      requested_mutations: 2,
      operations: [
        { element_id: "11111111-1111-4111-8111-111111111111", patch: { timeline_start: 5.1 } },
        { element_id: "22222222-2222-4222-8222-222222222222", patch: { timeline_start: 9.5 } },
      ],
    }],
  };

  assert.doesNotThrow(
    () => validateEditorAgentProposalAgainstProject(raw, 2, "adjacent-boundary-tolerance"),
  );
});

test("force-aligned caption proposals replace the complete rail atomically", async () => {
  createProject("replace-captions", "reels");
  const alignmentPath = path.join(root, "replace-captions-alignment.json");
  fs.writeFileSync(alignmentPath, JSON.stringify([
    { word: "The", start: 0.5, end: 0.8 },
    { word: "most", start: 0.8, end: 1.2 },
    { word: "dangerous", start: 1.3, end: 1.7 },
    { word: "ad", start: 1.7, end: 2.1 },
  ]));
  const alignmentSha256 = createHash("sha256").update(fs.readFileSync(alignmentPath)).digest("hex");
  const video = { ...element(), props: { source_duration_seconds: 2.5 } };
  const oldCaption = {
    ...element("22222222-2222-4222-8222-222222222222"),
    type: "caption_text" as const,
    lane_key: "captions_0",
    voice_clip_id: video.id,
    props: { text: "Old caption", caption_source_element_id: video.id },
  };
  const unrelatedCaption = {
    ...oldCaption,
    id: "66666666-6666-4666-8666-666666666666",
    voice_clip_id: "77777777-7777-4777-8777-777777777777",
    props: {
      ...oldCaption.props,
      text: "Keep me",
      caption_source_element_id: "77777777-7777-4777-8777-777777777777",
    },
  };
  writeTimeline("replace-captions", { elements: [video, oldCaption, unrelatedCaption], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "replace-captions",
    expected_revision: timelineRevision("replace-captions"),
    mode: "workshop",
    decision: "propose",
    summary: "Replace the speech-caption rail.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 50, requested_mutations: 1, max_renders: 0 },
    options: [{
      id: "aligned-captions",
      label: "Aligned captions",
      recommended: true,
      summary: "Use two exact cues.",
      requested_mutations: 1,
      operations: [{
        element_id: "33333333-3333-4333-8333-333333333333",
        replace_captions: {
          source_element_ids: [video.id],
          cues: [
            {
              element_id: "44444444-4444-4444-8444-444444444444",
              text: "The most",
              timeline_start: 0.5,
              duration: 1.6,
              caption_source_text: "The most",
              caption_alignment_path: alignmentPath,
              hold_until_source_seconds: 2.1,
              lane_key: "captions_1",
              lane_index: 1,
              style: {
                positionPreset: "top_left",
                textAlign: "left",
                groupLayout: { kind: "paragraph_panel", row: 0, rows: 2 },
              },
              timing_source: {
                element_id: video.id,
                alignment_sha256: alignmentSha256,
                source_start_seconds: 0.5,
                source_end_seconds: 1.2,
                playback_rate: 1,
              },
              caption_fast_verbatim: false,
              caption_rapid_fragment: false,
            },
            {
              element_id: "55555555-5555-4555-8555-555555555555",
              text: "dangerous ad",
              timeline_start: 1.3,
              duration: 0.8,
              caption_source_text: "dangerous ad",
              caption_alignment_path: alignmentPath,
              timing_source: {
                element_id: video.id,
                alignment_sha256: alignmentSha256,
                source_start_seconds: 1.3,
                source_end_seconds: 2.1,
                playback_rate: 1,
              },
              caption_fast_verbatim: true,
              caption_rapid_fragment: false,
            },
          ],
          lane_key: "captions_0",
          font_preset: "teko",
          font_size_px: 92,
          style_variant: "bold_outline",
          position_preset: "bottom_center",
          max_width: 0.86,
          grouping: "pause_first_v1",
          word_limit: 3,
          lane_order_keys: ["captions_1", "captions_0", "visual_0"],
        },
      }],
    }],
  };
  const coordinateAuthored = structuredClone(raw) as typeof raw & {
    options: Array<{ operations: Array<{ replace_captions?: Record<string, unknown> }> }>;
  };
  coordinateAuthored.options[0]!.operations[0]!.replace_captions!.abs_x = 0.5;
  coordinateAuthored.options[0]!.operations[0]!.replace_captions!.abs_y = 0.72;
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(coordinateAuthored, 50, "replace-captions"),
    /abs_x|Unrecognized/,
  );
  const validated = validateEditorAgentProposalAgainstProject(raw, 50, "replace-captions");
  const preserving = structuredClone(raw);
  Object.assign(preserving.options[0]!.operations[0]!.replace_captions, {
    preserve_element_ids: [oldCaption.id],
  });
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(preserving, 50, "replace-captions"),
    /overlaps preserved caption/,
  );
  Object.assign(preserving.options[0]!.operations[0]!.replace_captions, {
    preserve_element_ids: [video.id],
  });
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(preserving, 50, "replace-captions"),
    /Preserved caption must be active/,
  );
  const preview = previewEditorAgentProposal(validated);
  assert.equal(readTimeline("replace-captions").elements.filter((entry) => entry.type === "caption_text" && entry.removed_at == null).length, 2);
  assert.equal(preview.timeline.elements.filter((entry) => entry.type === "caption_text" && entry.removed_at == null).length, 3);
  assert.equal(preview.timeline.elements.find((entry) => entry.id === unrelatedCaption.id)?.removed_at, null);
  assert.equal(reviewOperation(readTimeline("replace-captions"), validated.options[0]!.operations[0]!).action, "Replace speech captions");

  await applyEditorAgentProposal(validated, 50);
  const updated = readTimeline("replace-captions");
  assert.equal(updated.elements.find((entry) => entry.id === oldCaption.id)?.removed_reason, "proposal_caption_replace");
  const active = updated.elements.filter((entry) => entry.type === "caption_text" && entry.removed_at == null);
  assert.deepEqual(active.map((entry) => entry.props?.text), ["Keep me", "The most", "dangerous ad"]);
  assert.equal(active[2]?.props?.caption_fast_verbatim, true);
  assert.equal(active[1]?.props?.caption_source_element_id, video.id);
  assert.equal(active[1]?.props?.caption_source_playback_rate, 1);
  assert.equal(active[1]?.props?.caption_hold_until_source_seconds, 2.1);
  assert.equal(active[1]?.lane_key, "captions_1");
  assert.equal(active[1]?.props?.absX, undefined);
  assert.equal(active[1]?.props?.absY, undefined);
  assert.deepEqual(active[1]?.props?.groupLayout, { kind: "paragraph_panel", row: 0, rows: 2 });
  const placement = resolveCaptionAnchorLayout(
    resolveCaptionProps(active[1]?.props),
    { left: 0, top: 0, width: 1, height: 1 },
  );
  assert.deepEqual(
    { x: placement.x, y: placement.y, anchorX: placement.anchorX, anchorY: placement.anchorY },
    { x: 0.04, y: 0.035, anchorX: 0, anchorY: 0 },
  );
  assert.deepEqual(readMetadata("replace-captions").lane_order_keys, ["captions_1", "captions_0", "visual_0"]);
});

test("caption replacement can rebuild every caption from a marked timeline boundary", async () => {
  createProject("replace-captions-from-mark", "reels");
  const alignmentPath = path.join(root, "replace-captions-from-mark-alignment.json");
  fs.writeFileSync(alignmentPath, JSON.stringify([
    { word: "Fresh", start: 2, end: 2.4 },
    { word: "caption", start: 2.4, end: 2.9 },
  ]));
  const alignmentSha256 = createHash("sha256").update(fs.readFileSync(alignmentPath)).digest("hex");
  const video = { ...element(), duration: 4, props: { source_duration_seconds: 4 } };
  const beforeMark = {
    ...element("22222222-2222-4222-8222-222222222222"),
    type: "caption_text" as const,
    timeline_start: 0,
    duration: 1,
    lane_key: "captions_0",
    props: { text: "Keep before mark", caption_source_element_id: video.id },
  };
  const crossingMark = {
    ...beforeMark,
    id: "33333333-3333-4333-8333-333333333333",
    timeline_start: 1.5,
    duration: 0.75,
    props: { text: "Remove across mark", caption_source_element_id: "removed-speech" },
  };
  const afterMark = {
    ...beforeMark,
    id: "44444444-4444-4444-8444-444444444444",
    timeline_start: 2.5,
    props: { text: "Remove after mark", caption_source_element_id: "removed-speech" },
  };
  writeTimeline("replace-captions-from-mark", { elements: [video, beforeMark, crossingMark, afterMark], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "replace-captions-from-mark",
    expected_revision: timelineRevision("replace-captions-from-mark"),
    mode: "workshop",
    decision: "propose",
    summary: "Rebuild captions from a review mark.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    options: [{
      id: "from-mark",
      label: "From mark",
      recommended: true,
      summary: "Preserve earlier captions and replace the marked ending.",
      requested_mutations: 1,
      operations: [{
        element_id: "55555555-5555-4555-8555-555555555555",
        replace_captions: {
          from_timeline_seconds: 2,
          cues: [{
            element_id: "66666666-6666-4666-8666-666666666666",
            text: "Fresh caption",
            timeline_start: 2,
            duration: 0.9,
            caption_source_text: "Fresh caption",
            caption_alignment_path: alignmentPath,
            timing_source: {
              element_id: video.id,
              alignment_sha256: alignmentSha256,
              source_start_seconds: 2,
              source_end_seconds: 2.9,
              playback_rate: 1,
            },
            caption_fast_verbatim: false,
            caption_rapid_fragment: false,
          }],
          lane_key: "captions_0",
          font_preset: "teko",
          font_size_px: 92,
          style_variant: "bold_outline",
          position_preset: "bottom_center",
          max_width: 0.72,
          grouping: "pause_first_v1",
          word_limit: 4,
        },
      }],
    }],
  };
  const validated = validateEditorAgentProposalAgainstProject(raw, 1, "replace-captions-from-mark");
  const preview = previewEditorAgentProposal(validated).timeline;
  assert.equal(preview.elements.find((entry) => entry.id === beforeMark.id)?.removed_at, null);
  assert.ok(preview.elements.find((entry) => entry.id === crossingMark.id)?.removed_at);
  assert.ok(preview.elements.find((entry) => entry.id === afterMark.id)?.removed_at);
  assert.equal(preview.elements.find((entry) => entry.id === "66666666-6666-4666-8666-666666666666")?.props?.text, "Fresh caption");
});

test("force-aligned caption proposals reject a stale playback-rate mapping", () => {
  createProject("caption-rate-contract", "web");
  const alignmentPath = path.join(root, "caption-rate-contract-alignment.json");
  fs.writeFileSync(alignmentPath, JSON.stringify([{ word: "Hello", start: 1, end: 1.5 }]));
  const alignmentSha256 = createHash("sha256").update(fs.readFileSync(alignmentPath)).digest("hex");
  const video = {
    ...element(),
    playback_rate: 1.08,
    props: { source_duration_seconds: 3 },
  };
  writeTimeline("caption-rate-contract", { elements: [video], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "caption-rate-contract",
    expected_revision: timelineRevision("caption-rate-contract"),
    mode: "workshop",
    decision: "propose",
    summary: "Replace captions.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    options: [{
      id: "captions",
      label: "Captions",
      recommended: true,
      summary: "Use aligned captions.",
      requested_mutations: 1,
      operations: [{
        element_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        replace_captions: {
          cues: [{
            element_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
            text: "Hello",
            timeline_start: 1,
            duration: 0.5,
            caption_source_text: "Hello",
            caption_alignment_path: alignmentPath,
            timing_source: {
              element_id: video.id,
              alignment_sha256: alignmentSha256,
              source_start_seconds: 1,
              source_end_seconds: 1.5,
              playback_rate: 1,
            },
            caption_fast_verbatim: false,
            caption_rapid_fragment: false,
          }],
          lane_key: "captions_0",
          font_preset: "teko",
          font_size_px: 92,
          style_variant: "bold_outline",
          position_preset: "bottom_center",
          max_width: 0.86,
          grouping: "pause_first_v1",
          word_limit: 4,
        },
      }],
    }],
  };
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(raw, 1, "caption-rate-contract"),
    /mapped for 1x but its speech clip is 1.08x/,
  );
  video.playback_rate = 1;
  Object.assign(video.props, { keyframes: { playback_rate: [{ t: 1, source_t: 1, v: 2, ease: "hold" }] } });
  writeTimeline("caption-rate-contract", { elements: [video], transitions: [] }, "speed-step-fixture");
  raw.expected_revision = timelineRevision("caption-rate-contract");
  raw.options[0]!.operations[0]!.replace_captions.cues[0]!.duration = 0.25;
  const stepped = validateEditorAgentProposalAgainstProject(raw, 1, "caption-rate-contract");
  const cue = previewEditorAgentProposal(stepped).timeline.elements.find((entry) => entry.type === "caption_text")!;
  assert.equal(cue.timeline_start, 1);
  assert.equal(cue.duration, 0.25);
  assert.deepEqual(cue.props?.wordTimings, [{ text: "Hello", start: 0, end: 0.25 }]);
});

test("stabilized picture and enhanced detached speech remain proposal-only until approval", async () => {
  createProject("stabilized-speech", "web");
  const video = element();
  video.source_url = "/api/projects/stabilized-speech/media/sources/take.mov";
  video.props = {
    source_duration_seconds: 10,
    preview_source_url: "/api/projects/stabilized-speech/media/previews/take.mp4",
  };
  writeTimeline("stabilized-speech", { elements: [video], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "stabilized-speech",
    expected_revision: timelineRevision("stabilized-speech"),
    mode: "workshop",
    decision: "propose",
    summary: "Stabilize the picture and replace loud footsteps with enhanced detached speech.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 16, requested_mutations: 16, max_renders: 0 },
    options: [{
      id: "smooth-and-clean",
      label: "Smooth motion + cleaned speech",
      recommended: true,
      summary: "Use the prepared stabilized picture and enhanced narration authority.",
      requested_mutations: 16,
      operations: [{
        element_id: video.id,
        use_video_stabilization: {
          processed_source_url: "/api/projects/stabilized-speech/media/video-effects/take.stabilized.mp4",
          processed_preview_source_url: "/api/projects/stabilized-speech/media/video-effects/take.stabilized-preview.mp4",
          original_source_url: "/api/projects/stabilized-speech/media/sources/take.mov",
          original_preview_source_url: "/api/projects/stabilized-speech/media/previews/take.mp4",
          original_preview_audio_source_url: "/api/projects/stabilized-speech/media/previews/take.mp4",
          original_render_authority_source_url: "/api/projects/stabilized-speech/media/sources/take.mov",
          render_authority_sha256: "a".repeat(64),
          preview_proxy_sha256: "b".repeat(64),
          source_sha256: "c".repeat(64),
          mode: "smooth_motion",
          strength_percent: 50,
          shakiness: 5,
          smoothing_frames: 28,
          auto_zoom: true,
          recipe: "video-stabilization-v1:smooth_motion:50",
        },
        patch: { volume: 0 },
        rationale: "The second clip needs steadier picture while its embedded audio is replaced.",
      }, {
        element_id: "55555555-5555-4555-8555-555555555555",
        create_audio: {
          type: "vo_segment",
          source_url: "/api/projects/stabilized-speech/media/audio-effects/take.voice-enhanced.m4a",
          title: "Enhanced speech · footsteps reduced",
          timeline_start: 0,
          source_duration_seconds: 10,
          source_start_seconds: 0,
          source_end_seconds: 2,
          lane_key: "audio_narrator",
          lane_index: 0,
          volume: 1,
          fade_in: 0.01,
          fade_out: 0.01,
          playback_rate: 1,
          voice_enhancement: {
            strength_percent: 50,
            attenuation_limit_db: 15,
            recipe: "voice-enhancement-v1:test",
            original_source_url: "/api/projects/stabilized-speech/media/audio-effects/take.detached.m4a",
          },
        },
        rationale: "The enhanced speech authority reduces footsteps without changing timing.",
      }],
    }],
  };

  const validated = validateEditorAgentProposalAgainstProject(raw, 16, "stabilized-speech");
  const preview = previewEditorAgentProposal(validated);
  assert.equal(readTimeline("stabilized-speech").elements.length, 1);
  const previewVideo = preview.timeline.elements.find((entry) => entry.id === video.id);
  const previewAudio = preview.timeline.elements.find((entry) => entry.id === "55555555-5555-4555-8555-555555555555");
  assert.equal(previewVideo?.source_url, "/api/projects/stabilized-speech/media/video-effects/take.stabilized.mp4");
  assert.equal(previewVideo?.volume, 0);
  assert.equal(previewVideo?.props?.video_stabilization?.strength_percent, 50);
  assert.deepEqual(previewVideo?.props?.volume_envelope, [
    { time_seconds: 0, volume: 0 },
    { time_seconds: 2, volume: 0 },
  ]);
  assert.deepEqual(previewVideo?.props?.detached_audio_original_volume_envelope, [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 2, volume: 1 },
  ]);
  assert.equal(previewAudio?.props?.voice_enhancement?.strength_percent, 50);

  await applyEditorAgentProposal(validated, 16);
  assert.equal(readTimeline("stabilized-speech").elements.length, 2);
});

test("prepared voice enhancement replaces an existing clip's audio authority only on approval", async () => {
  createProject("voice-treatment", "web");
  const video = element();
  video.source_url = "/api/projects/voice-treatment/media/sources/take.mov";
  video.volume = 0.8;
  video.props = {
    source_duration_seconds: 10,
    preview_source_url: "/api/projects/voice-treatment/media/previews/take.mp4",
    preview_audio_source_url: "/api/projects/voice-treatment/media/previews/take.mp4",
    render_authority_source_url: "/api/projects/voice-treatment/media/sources/take.mov",
  };
  writeTimeline("voice-treatment", { elements: [video], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "voice-treatment",
    expected_revision: timelineRevision("voice-treatment"),
    mode: "workshop",
    decision: "propose",
    summary: "Smooth and level the spoken voice while preserving timing.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    options: [{
      id: "smooth-voice",
      label: "60% voice treatment",
      recommended: true,
      summary: "Use the prepared timing-identical voice authority at -16 LUFS.",
      requested_mutations: 1,
      operations: [{
        element_id: video.id,
        use_voice_enhancement: {
          processed_source_url: "/api/projects/voice-treatment/media/audio-effects/take.normalized.mp4",
          processed_preview_audio_source_url: "/api/projects/voice-treatment/media/audio-effects/take.normalized.preview-audio.m4a",
          original_source_url: "/api/projects/voice-treatment/media/sources/take.mov",
          original_preview_audio_source_url: "/api/projects/voice-treatment/media/previews/take.mp4",
          original_render_authority_source_url: "/api/projects/voice-treatment/media/sources/take.mov",
          processed_sha256: "d".repeat(64),
          strength_percent: 60,
          attenuation_limit_db: 18,
          recipe: "voice-enhancement-v1:test",
          normalization_target_lufs: -16,
          normalization_true_peak_dbtp: -1.5,
          normalization_recipe: "narrator-loudnorm-v1:test",
        },
        rationale: "The speaking clips need a consistent, smoother voice bed.",
      }],
    }],
  };

  const validated = validateEditorAgentProposalAgainstProject(raw, 1, "voice-treatment");
  const preview = previewEditorAgentProposal(validated);
  assert.equal(readTimeline("voice-treatment").elements[0]?.source_url, "/api/projects/voice-treatment/media/sources/take.mov");
  const previewVideo = preview.timeline.elements[0];
  assert.equal(previewVideo?.source_url, "/api/projects/voice-treatment/media/audio-effects/take.normalized.mp4");
  assert.equal(previewVideo?.props?.preview_source_url, "/api/projects/voice-treatment/media/previews/take.mp4");
  assert.equal(previewVideo?.props?.preview_audio_source_url, "/api/projects/voice-treatment/media/audio-effects/take.normalized.preview-audio.m4a");
  assert.equal(previewVideo?.props?.voice_enhancement?.strength_percent, 60);
  assert.equal(previewVideo?.props?.voice_enhancement?.normalization?.target_lufs, -16);
  assert.equal(previewVideo?.volume, 1);
  assert.equal(reviewOperation(readTimeline("voice-treatment"), validated.options[0]!.operations[0]!).action, "Enhance and level voice");

  await applyEditorAgentProposal(validated, 1);
  assert.equal(readTimeline("voice-treatment").elements[0]?.props?.voice_enhancement_original_source_url, "/api/projects/voice-treatment/media/sources/take.mov");
});

test("resetting voice to original leaves one embedded audio authority and soft-removes the detached lane", async () => {
  createProject("reattach-original", "web");
  const video = element();
  video.volume = 0;
  video.props = {
    volume_envelope: [
      { time_seconds: 0, volume: 1 },
      { time_seconds: 2, volume: 1 },
    ],
  };
  const audio = {
    ...element("66666666-6666-4666-8666-666666666666"),
    type: "vo_segment" as const,
    source_url: "/api/projects/reattach-original/media/audio-effects/voice.m4a",
    lane_key: "audio_narrator",
    volume: 1,
  };
  writeTimeline("reattach-original", { elements: [video, audio], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "reattach-original",
    expected_revision: timelineRevision("reattach-original"),
    mode: "workshop",
    decision: "propose",
    summary: "Reset the doubled voice to one original embedded audio authority.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    options: [{
      id: "original-voice",
      label: "Original voice",
      recommended: true,
      summary: "Reattach the original embedded audio and remove the detached duplicate.",
      requested_mutations: 1,
      operations: [{
        element_id: video.id,
        reattach_original_audio: { audio_element_id: audio.id },
        rationale: "Removes the delayed double playback by leaving one original audio authority.",
      }],
    }],
  };

  const validated = validateEditorAgentProposalAgainstProject(raw, 1, "reattach-original");
  const row = reviewOperation(readTimeline("reattach-original"), validated.options[0]!.operations[0]!);
  assert.equal(row.action, "Reset voice to original");
  const preview = previewEditorAgentProposal(validated);
  assert.equal(readTimeline("reattach-original").elements.find((entry) => entry.id === audio.id)?.removed_at, null);
  assert.equal(preview.timeline.elements.find((entry) => entry.id === video.id)?.volume, 1);
  assert.notEqual(preview.timeline.elements.find((entry) => entry.id === audio.id)?.removed_at, null);

  await applyEditorAgentProposal(validated, 1);
  const applied = readTimeline("reattach-original");
  assert.equal(applied.elements.find((entry) => entry.id === video.id)?.volume, 1);
  assert.deepEqual(applied.elements.find((entry) => entry.id === video.id)?.props?.volume_envelope, [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 2, volume: 1 },
  ]);
  assert.equal(
    applied.elements.find((entry) => entry.id === audio.id)?.removed_reason,
    "proposal_reattach_original_audio",
  );
});

test("audio creation proposals reject destructive or impossible source windows", () => {
  createProject("create-audio-invalid", "web");
  const raw = {
    schema_version: 2,
    project_id: "create-audio-invalid",
    expected_revision: timelineRevision("create-audio-invalid"),
    mode: "workshop",
    decision: "propose",
    summary: "Invalid source window.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 12, requested_mutations: 12, max_renders: 0 },
    options: [{
      id: "invalid",
      label: "Invalid",
      recommended: true,
      summary: "Must fail.",
      requested_mutations: 12,
      operations: [{
        element_id: "33333333-3333-4333-8333-333333333333",
        create_audio: {
          type: "sound_effect",
          source_url: "/api/sfx-catalog/media/impact.wav",
          timeline_start: 0,
          source_duration_seconds: 2,
          source_start_seconds: 1,
          source_end_seconds: 3,
          lane_key: "sound_effect_0",
          lane_index: 0,
          volume: 1,
          fade_in: 0,
          fade_out: 0,
          playback_rate: 1,
        },
      }],
    }],
  };
  assert.throws(() => validateEditorAgentProposal(raw, 12), /source_duration_seconds/);
});

test("transparent visual effects remain proposal-only until approval and preserve inspector opacity", async () => {
  createProject("create-visual", "web");
  preparedVideoFixture("create-visual", "cutouts/camo.webm", 1.8, true);
  writeTimeline("create-visual", { elements: [element()], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "create-visual",
    expected_revision: timelineRevision("create-visual"),
    mode: "workshop",
    decision: "propose",
    summary: "Add a subject-masked active camouflage overlay.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 13, requested_mutations: 13, max_renders: 0 },
    options: [{
      id: "subject-mask",
      label: "Subject-only camouflage",
      recommended: true,
      summary: "Overlay only the tracked presenter silhouette.",
      requested_mutations: 13,
      operations: [{
        element_id: "44444444-4444-4444-8444-444444444444",
        create_visual: {
          type: "video_clip",
          source_url: "/api/projects/create-visual/media/cutouts/camo.webm",
          title: "Active camouflage · subject mask",
          timeline_start: 13.03,
          source_duration_seconds: 1.8,
          source_start_seconds: 0,
          source_end_seconds: 1.8,
          playback_rate: 1.2,
          lane_key: "visual_0",
          lane_index: 1,
          media_opacity: 0.9,
          has_alpha: true,
          effect_role: "active_camouflage_subject_overlay",
        },
      }],
    }],
  };
  const validated = validateEditorAgentProposalAgainstProject(raw, 13, "create-visual");
  const preview = previewEditorAgentProposal(validated);
  assert.equal(readTimeline("create-visual").elements.length, 1);
  assert.equal(preview.timeline.elements.length, 2);
  const previewElement = preview.timeline.elements.find((entry) => entry.id === "44444444-4444-4444-8444-444444444444");
  assert.equal(previewElement?.props?.has_alpha, true);
  assert.equal(previewElement?.props?.media_opacity, 0.9);

  await applyEditorAgentProposal(validated, 13);
  const created = readTimeline("create-visual").elements.find((entry) => entry.id === "44444444-4444-4444-8444-444444444444");
  assert.equal(created?.duration, 1.5);
  assert.equal(created?.playback_rate, 1.2);
  assert.equal(created?.volume, 0);
  assert.equal(created?.props?.media_opacity, 0.9);
});

test("cataloged cutouts use the proposal-draft clock and accept full narration sources", () => {
  const id = "create-synced-cutout";
  createProject(id, "reels");
  preparedVideoFixture(id, "cutouts/take-cutout.webm", 3, true);
  const sourceBytes = Buffer.from("managed camera source");
  const sourceSha256 = createHash("sha256").update(sourceBytes).digest("hex");
  const sourcePath = path.join(projectMediaDir(id), "sources", "take.mov");
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, sourceBytes);
  fs.writeFileSync(projectSourceManifestPath(id), JSON.stringify({
    schema_version: 1,
    project_id: id,
    assets: [{
      media_path: "sources/take.mov",
      source_sha256: sourceSha256,
      storage_mode: "managed_copy",
    }],
  }));
  const speech = {
    ...element(),
    project_id: id,
    type: "vo_full" as const,
    source_url: `/api/projects/${id}/media/sources/take.mov`,
    duration: 5,
    lane_key: "audio_0",
    props: { source_duration_seconds: 5 },
  };
  const authoredTimeBlocker = {
    ...element("66666666-6666-4666-8666-666666666666"),
    project_id: id,
    timeline_start: 1,
    duration: 1,
    lane_key: "visual_1",
    lane_index: 1,
  };
  writeTimeline(id, { elements: [speech, authoredTimeBlocker], transitions: [] }, "fixture");
  appendCustomCutout(id, {
    cutout_id: "cutout-test",
    recipe_id: "sam2-custom-cutout/v2",
    source_relative_path: "sources/take.mov",
    source_sha256: sourceSha256,
    source_interval_seconds: [1, 4],
    prompt_seconds: 2,
    prompt_frame: 30,
    positive_points_normalized: [{ x: 0.5, y: 0.5 }],
    negative_points_normalized: [],
    output_relative_path: "cutouts/take-cutout.webm",
    output_duration_seconds: 3,
    width: 1080,
    height: 1920,
    frame_rate: 30,
    frame_count: 90,
    alpha_mode: "1",
    evidence_directory: "instruments/custom-cutouts/cutout-test",
    created_at: "2026-09-15T00:00:00.000Z",
  });
  const raw = proposal(id, timelineRevision(id), {
    operations: [{
      element_id: speech.id,
      patch: { timeline_start: 2 },
    }, {
      element_id: "77777777-7777-4777-8777-777777777777",
      create_visual: {
        type: "video_clip",
        source_url: `/api/projects/${id}/media/cutouts/take-cutout.webm`,
        timeline_start: 1,
        source_duration_seconds: 99,
        source_start_seconds: 0,
        source_end_seconds: 3,
        lane_key: "visual_1",
        lane_index: 1,
        has_alpha: true,
        speech_sync: {
          source_element_id: speech.id,
          source_sha256: sourceSha256,
          source_start_seconds: 1,
          source_end_seconds: 4,
        },
      },
    }],
    caps: { max_mutations: 11, requested_mutations: 11, max_renders: 0 },
  });
  const validated = validateEditorAgentProposalAgainstProject(raw, 11, id);
  const created = previewEditorAgentProposal(validated).timeline.elements.find((entry) => entry.id === "77777777-7777-4777-8777-777777777777")!;
  assert.equal(created.timeline_start, 3);
  assert.equal(created.duration, 3);
  assert.equal(created.voice_clip_id, speech.id);
  assert.equal(created.props?.source_duration_seconds, 3);
  assert.equal(created.props?.speech_sync_binding?.source_start_seconds, 1);
  assert.equal(created.props?.custom_cutout_receipt?.cutout_id, "cutout-test");
});

test("still visuals remain proposal-only and preserve editable transform, mask, and animation controls", () => {
  createProject("create-still-visual", "web");
  writeTimeline("create-still-visual", { elements: [element()], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "create-still-visual",
    expected_revision: timelineRevision("create-still-visual"),
    mode: "workshop",
    decision: "propose",
    summary: "Add a separately editable proof annotation.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 21, requested_mutations: 21, max_renders: 0 },
    options: [{
      id: "annotation",
      label: "Editable proof annotation",
      recommended: true,
      summary: "Mount the transparent annotation as its own still layer.",
      requested_mutations: 21,
      operations: [{
        element_id: "55555555-5555-4555-8555-555555555555",
        create_visual: {
          type: "still",
          source_url: "/api/projects/create-still-visual/media/stills/proof-circles.png",
          title: "Proof metric circles",
          timeline_start: 26.593,
          duration_seconds: 4.43,
          lane_key: "visual_2",
          lane_index: 0,
          has_alpha: true,
          sticker_outline: true,
          sticker_outline_width: 10,
          effect_role: "proof_annotation",
          media_scale: 0.82,
          media_offset_x: 0.04,
          media_offset_y: -0.08,
          motion_preset: "bounce",
          mask_inset: [0, 0, 0, 0],
          mask_feather: 0,
          animationIn: "pop",
          animationOut: "fade",
          animationInDuration: 0.25,
          animationOutDuration: 0.2,
        },
      }],
    }],
  };

  const validated = validateEditorAgentProposalAgainstProject(raw, 21, "create-still-visual");
  const preview = previewEditorAgentProposal(validated);
  assert.equal(readTimeline("create-still-visual").elements.length, 1);
  const still = preview.timeline.elements.find((entry) => entry.id === "55555555-5555-4555-8555-555555555555");
  assert.equal(still?.type, "still");
  assert.equal(still?.props?.has_alpha, true);
  assert.equal(still?.props?.sticker_outline, true);
  assert.equal(still?.props?.sticker_outline_width, 10);
  assert.equal(still?.props?.media_scale, 0.82);
  assert.deepEqual(still?.props?.mask_inset, [0, 0, 0, 0]);
  assert.equal(still?.props?.animationIn, "pop");
  assert.equal(still?.props?.animationOut, "fade");
  const motionKeyframes = readKeyframeMap(still?.props);
  assert.ok((motionKeyframes.media_offset_x?.length ?? 0) >= 2);
  assert.ok((motionKeyframes.media_offset_y?.length ?? 0) >= 2);
  assert.equal(motionKeyframes.media_offset_x?.[0]?.v, motionKeyframes.media_offset_x?.at(-1)?.v);
  assert.equal(motionKeyframes.media_offset_y?.[0]?.v, motionKeyframes.media_offset_y?.at(-1)?.v);
});

test("authored video-effect composites are rejected unless their derived role is explicitly allowlisted", () => {
  createProject("reject-baked-composite", "web");
  writeTimeline("reject-baked-composite", { elements: [element()], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "reject-baked-composite",
    expected_revision: timelineRevision("reject-baked-composite"),
    mode: "workshop",
    decision: "propose",
    summary: "Mount a flattened proof-and-ad composite.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 12, requested_mutations: 12, max_renders: 0 },
    options: [{
      id: "flattened",
      label: "Flattened composite",
      recommended: true,
      summary: "Combine the proof, annotations, and ad into one video.",
      requested_mutations: 12,
      operations: [{
        element_id: "66666666-6666-4666-8666-666666666666",
        create_visual: {
          type: "video_clip",
          source_url: "/api/projects/reject-baked-composite/media/video-effects/proof-and-ad.webm",
          title: "Proof and ad composite",
          timeline_start: 26.593,
          source_duration_seconds: 4.43,
          source_start_seconds: 0,
          source_end_seconds: 4.43,
          lane_key: "visual_1",
          lane_index: 0,
          media_opacity: 1,
          has_alpha: true,
          effect_role: "proof_composite",
        },
      }],
    }],
  };

  assert.throws(
    () => validateEditorAgentProposalAgainstProject(raw, 12, "reject-baked-composite"),
    /must remain separate still operations/,
  );
});

test("overlapping authored stills must use separate registered visual lanes", () => {
  createProject("reject-same-visual-lane", "web");
  writeTimeline("reject-same-visual-lane", { elements: [element()], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "reject-same-visual-lane",
    expected_revision: timelineRevision("reject-same-visual-lane"),
    mode: "workshop",
    decision: "propose",
    summary: "Add an overlapping proof to the base lane.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 6, requested_mutations: 6, max_renders: 0 },
    options: [{
      id: "same-lane",
      label: "Same lane",
      recommended: true,
      summary: "Incorrectly reuse visual_0.",
      requested_mutations: 6,
      operations: [{
        element_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        create_visual: {
          type: "still",
          source_url: "/api/projects/reject-same-visual-lane/media/stills/proof.png",
          timeline_start: 1,
          duration_seconds: 2,
          lane_key: "visual_0",
          lane_index: 2,
        },
      }],
    }],
  };
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(raw, 6, "reject-same-visual-lane"),
    /separate registered visual lanes/,
  );
});

test("visual removal remains proposal-only and soft-deletes the selected layer on approval", async () => {
  createProject("remove-visual", "web");
  const visual = { ...element(), id: "77777777-7777-4777-8777-777777777777", type: "still" as const };
  writeTimeline("remove-visual", { elements: [visual], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "remove-visual",
    expected_revision: timelineRevision("remove-visual"),
    mode: "workshop",
    decision: "propose",
    summary: "Retire the obsolete flattened visual.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    options: [{
      id: "retire",
      label: "Retire visual",
      recommended: true,
      summary: "Soft-delete the old layer.",
      requested_mutations: 1,
      operations: [{
        element_id: visual.id,
        remove_visual: { reason: "Replaced by separately editable layers." },
      }],
    }],
  };

  const validated = validateEditorAgentProposalAgainstProject(raw, 1, "remove-visual");
  const preview = previewEditorAgentProposal(validated);
  assert.equal(readTimeline("remove-visual").elements[0]?.removed_at, null);
  assert.ok(preview.timeline.elements[0]?.removed_at);
  assert.equal(reviewOperation(readTimeline("remove-visual"), validated.options[0]!.operations[0]!).action, "Remove visual layer");

  await applyEditorAgentProposal(validated, 1);
  const removed = readTimeline("remove-visual").elements[0];
  assert.ok(removed?.removed_at);
  assert.match(removed?.removed_reason ?? "", /^proposal_visual_remove:/);
});

test("graphic-text removal remains proposal-only and cannot remove a visual", async () => {
  createProject("remove-graphic-text", "web");
  const graphic = {
    ...element(),
    id: "78787878-7878-4787-8787-787878787878",
    type: "caption_text" as const,
    lane_key: "captions_1",
    lane_index: 1,
    props: { text: "OBSOLETE GRAPHIC", graphic_text_role: "native_label" },
  };
  const visual = { ...element(), id: "79797979-7979-4797-8797-797979797979", type: "still" as const };
  writeTimeline("remove-graphic-text", { elements: [graphic, visual], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "remove-graphic-text",
    expected_revision: timelineRevision("remove-graphic-text"),
    mode: "workshop",
    decision: "propose",
    summary: "Retire obsolete native graphic text.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    options: [{
      id: "retire-text",
      label: "Retire graphic text",
      recommended: true,
      summary: "Soft-delete the old graphic label.",
      requested_mutations: 1,
      operations: [{
        element_id: graphic.id,
        remove_text: { reason: "The new scene no longer uses this graphic label." },
      }],
    }],
  };

  const validated = validateEditorAgentProposalAgainstProject(raw, 1, "remove-graphic-text");
  const preview = previewEditorAgentProposal(validated);
  assert.equal(readTimeline("remove-graphic-text").elements[0]?.removed_at, null);
  assert.ok(preview.timeline.elements[0]?.removed_at);
  assert.equal(reviewOperation(readTimeline("remove-graphic-text"), validated.options[0]!.operations[0]!).action, "Remove graphic text");

  await applyEditorAgentProposal(validated, 1);
  const removed = readTimeline("remove-graphic-text").elements[0];
  assert.ok(removed?.removed_at);
  assert.match(removed?.removed_reason ?? "", /^proposal_text_remove:/);

  assert.throws(
    () => validateEditorAgentProposalAgainstProject({
      ...raw,
      expected_revision: timelineRevision("remove-graphic-text"),
      options: [{
        ...raw.options[0],
        operations: [{ element_id: visual.id, remove_text: { reason: "Wrong element type." } }],
      }],
    }, 1, "remove-graphic-text"),
    /Only caption text elements can use remove_text/,
  );
});

test("lane registration and element movement preview and apply as one atomic proposal", async () => {
  createProject("register-visual-lanes", "web");
  const visual = { ...element(), id: "88888888-8888-4888-8888-888888888888", type: "still" as const };
  writeTimeline("register-visual-lanes", { elements: [visual], transitions: [] }, "fixture");
  const raw = {
    schema_version: 2,
    project_id: "register-visual-lanes",
    expected_revision: timelineRevision("register-visual-lanes"),
    mode: "workshop",
    decision: "propose",
    summary: "Put the proof on its own registered visual lane.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 2, requested_mutations: 2, max_renders: 0 },
    options: [{
      id: "real-lane",
      label: "Register proof lane",
      recommended: true,
      summary: "Move the proof and register its compositing order atomically.",
      requested_mutations: 2,
      operations: [
        {
          element_id: visual.id,
          patch: { lane_key: "visual_1" },
        },
        {
          element_id: "99999999-9999-4999-8999-999999999999",
          set_lane_order: { lane_order_keys: ["visual_1"] },
        },
      ],
    }],
  };

  const validated = validateEditorAgentProposalAgainstProject(raw, 2, "register-visual-lanes");
  const preview = previewEditorAgentProposal(validated);
  assert.equal(readTimeline("register-visual-lanes").elements[0]?.lane_key, "visual_0");
  assert.deepEqual(readMetadata("register-visual-lanes").lane_order_keys, []);
  assert.equal(preview.timeline.elements[0]?.lane_key, "visual_1");
  assert.deepEqual(preview.laneOrderKeys, ["visual_1"]);

  await applyEditorAgentProposal(validated, 2);
  assert.equal(readTimeline("register-visual-lanes").elements[0]?.lane_key, "visual_1");
  assert.deepEqual(readMetadata("register-visual-lanes").lane_order_keys, ["visual_1"]);
});

test("presenter-only lane mutes preview without writing and apply atomically", async () => {
  const id = "presenter-only-mutes";
  createProject(id, "web");
  const visual = { ...element(), project_id: id };
  writeTimeline(id, { elements: [visual], transitions: [] }, "seed");
  const proposal = validateEditorAgentProposalAgainstProject({
    schema_version: 2, project_id: id, expected_revision: timelineRevision(id),
    mode: "workshop", decision: "propose", summary: "Isolate presenter", assumptions: [], unresolved_gaps: [],
    caps: { max_mutations: 2, requested_mutations: 2, max_renders: 0 },
    options: [{ id: "isolate", label: "Isolate", recommended: true, summary: "Mute supporting lanes", requested_mutations: 2,
      operations: [{ element_id: visual.id, set_lane_order: { lane_order_keys: ["visual_0"], muted_lane_keys: ["visual_0"], expected_muted_lane_keys: [] } }] }],
  }, 2, id);
  const preview = previewEditorAgentProposal(proposal);
  assert.deepEqual(preview.mutedLaneKeys, ["visual_0"]);
  assert.deepEqual(readMetadata(id).muted_lane_keys, []);
  await applyEditorAgentProposal(proposal, 2);
  assert.deepEqual(readMetadata(id).muted_lane_keys, ["visual_0"]);
  assert.throws(() => previewEditorAgentProposal(proposal), /mute state changed/);
});

test("opening sequence proposals ripple captions and create a source-anchored punch-in without touching the saved timeline", async () => {
  createProject("opening-sequence", "web");
  const video = {
    ...element(),
    project_id: "opening-sequence",
    source_url: "/api/projects/opening-sequence/media/source.mp4",
    duration: 15,
    trim_start: 2,
    props: { source_duration_seconds: 17 },
  };
  const firstCaption = {
    ...element("22222222-2222-4222-8222-222222222222"),
    project_id: "opening-sequence",
    type: "caption_text",
    source_url: null,
    lane_key: "captions_0",
    timeline_start: 0.5,
    duration: 1.8,
    props: { text: "What if" },
  };
  const secondCaption = {
    ...element("33333333-3333-4333-8333-333333333333"),
    project_id: "opening-sequence",
    type: "caption_text",
    source_url: null,
    lane_key: "captions_0",
    timeline_start: 2.3,
    duration: 0.8,
    props: { text: "I told you" },
  };
  const laterCaption = {
    ...element("44444444-4444-4444-8444-444444444444"),
    project_id: "opening-sequence",
    type: "caption_text",
    source_url: null,
    lane_key: "captions_0",
    timeline_start: 4,
    duration: 1,
    props: { text: "Later" },
  };
  writeTimeline("opening-sequence", {
    elements: [video, firstCaption, secondCaption, laterCaption],
    transitions: [],
  }, "fixture");

  const insertedId = "55555555-5555-4555-8555-555555555555";
  const raw = {
    schema_version: 2,
    project_id: "opening-sequence",
    expected_revision: timelineRevision("opening-sequence"),
    mode: "workshop",
    decision: "propose",
    summary: "Remove the false start and punch in at the marked phrase.",
    assumptions: [],
    unresolved_gaps: [],
    caps: { max_mutations: 10, requested_mutations: 10, max_renders: 0 },
    options: [{
      id: "tight-opening",
      label: "Tight opening",
      recommended: true,
      summary: "Ripple the false start, repair the first caption, and cut to a close-up.",
      requested_mutations: 10,
      operations: [{
        element_id: video.id,
        opening_sequence_edit: {
          remove_opening_seconds: 2.2,
          punch_in_source_seconds: 10,
          punch_in_scale: 1.4,
          punch_in_offset_x: 0,
          punch_in_offset_y: 0.08,
          inserted_element_id: insertedId,
          replacement_caption_element_id: secondCaption.id,
          replacement_caption_text: "If I told you",
          max_affected_elements: 10,
          drop_boundary_captions: true,
        },
      }],
    }],
  } as const;

  const validated = validateEditorAgentProposalAgainstProject(raw, 10, "opening-sequence");
  const preview = previewEditorAgentProposal(validated);
  assert.equal(readTimeline("opening-sequence").elements.length, 4, "preview must stay pure");
  const previewFirst = preview.timeline.elements.find((entry) => entry.id === firstCaption.id);
  const previewSecond = preview.timeline.elements.find((entry) => entry.id === secondCaption.id);
  const previewLater = preview.timeline.elements.find((entry) => entry.id === laterCaption.id);
  const previewPresenter = preview.timeline.elements.find((entry) => entry.id === video.id);
  const previewRight = preview.timeline.elements.find((entry) => entry.id === insertedId);
  assert.ok(previewFirst?.removed_at);
  assert.equal(previewSecond?.timeline_start, 0);
  assert.ok(Math.abs((previewSecond?.duration ?? 0) - 0.9) < 1e-9);
  assert.equal(previewSecond?.props?.text, "If I told you");
  assert.ok(Math.abs((previewLater?.timeline_start ?? 0) - 1.8) < 1e-9);
  assert.equal(previewPresenter?.duration, 12.8, "the narration authority must remain continuous through the punch-in");
  assert.equal(previewPresenter?.volume, 1);
  assert.ok(previewRight);
  assert.equal(previewRight.timeline_start, 5.8);
  assert.ok(Math.abs(previewRight.duration - 7) < 1e-9);
  assert.equal(previewRight.trim_start, 10);
  assert.equal(previewRight.volume, 0, "the close-up overlay must never restart narration audio");
  assert.equal(previewRight.props?.media_scale, 1.4);
  assert.equal(previewRight.props?.media_offset_y, 0.08);
  assert.ok(preview.touched.includes(insertedId));
  assert.ok(preview.touched.includes(laterCaption.id));

  await applyEditorAgentProposal(validated, 10);
  const applied = readTimeline("opening-sequence");
  assert.equal(applied.elements.find((entry) => entry.id === insertedId)?.props?.media_scale, 1.4);
  assert.equal(applied.elements.find((entry) => entry.id === secondCaption.id)?.props?.text, "If I told you");
});

test("source-range cut proposals remove marked dead air and ripple every timeline layer", async () => {
  createProject("marked-pause-cut", "reels");
  const video = {
    ...element(),
    project_id: "marked-pause-cut",
    source_url: "/api/projects/marked-pause-cut/media/main.mp4",
    duration: 10,
    trim_start: 2,
    trim_end: 1,
    props: { source_duration_seconds: 13 },
  };
  const broll = {
    ...element("22222222-2222-4222-8222-222222222222"),
    project_id: "marked-pause-cut",
    source_url: "/api/projects/marked-pause-cut/media/broll.mp4",
    lane_key: "visual_1",
    timeline_start: 2,
    duration: 3,
    props: { source_duration_seconds: 3 },
  };
  const spanningCaption = {
    ...element("33333333-3333-4333-8333-333333333333"),
    project_id: "marked-pause-cut",
    type: "caption_text",
    source_url: null,
    lane_key: "captions_0",
    timeline_start: 2.5,
    duration: 2,
    props: { text: "When you enter" },
  };
  const laterCaption = {
    ...element("44444444-4444-4444-8444-444444444444"),
    project_id: "marked-pause-cut",
    type: "caption_text",
    source_url: null,
    lane_key: "captions_0",
    timeline_start: 6,
    duration: 1,
    props: { text: "the courtyard" },
  };
  writeTimeline("marked-pause-cut", {
    elements: [video, broll, spanningCaption, laterCaption],
    transitions: [],
  }, "fixture");

  const removedId = "55555555-5555-4555-8555-555555555555";
  const insertedId = "66666666-6666-4666-8666-666666666666";
  const raw = {
    schema_version: 2,
    project_id: "marked-pause-cut",
    expected_revision: timelineRevision("marked-pause-cut"),
    mode: "workshop",
    decision: "propose",
    summary: "Remove the marked pause between complete words.",
    assumptions: ["The saved mark locates the review region, not an exact boundary."],
    unresolved_gaps: [],
    caps: { max_mutations: 5, requested_mutations: 5, max_renders: 0 },
    options: [{
      id: "natural-cut",
      label: "Natural cut",
      recommended: true,
      summary: "Remove one second of dead air and preserve the editable source split.",
      requested_mutations: 5,
      operations: [{
        element_id: video.id,
        source_range_cut: {
          source_start_seconds: 5,
          source_end_seconds: 6,
          removed_segment_id: removedId,
          inserted_element_id: insertedId,
          max_affected_elements: 4,
        },
        rationale: "The aligned words remain complete on both sides of the pause.",
      }],
    }],
  } as const;

  const validated = validateEditorAgentProposalAgainstProject(raw, 5, "marked-pause-cut");
  const preview = previewEditorAgentProposal(validated);
  assert.equal(readTimeline("marked-pause-cut").elements.length, 4, "preview must not write the cut");
  const previewLeft = preview.timeline.elements.find((entry) => entry.id === video.id);
  const previewRemoved = preview.timeline.elements.find((entry) => entry.id === removedId);
  const previewRight = preview.timeline.elements.find((entry) => entry.id === insertedId);
  assert.equal(previewLeft?.duration, 3);
  assert.equal(previewRemoved?.removed_reason, "proposal_source_range_cut");
  assert.equal(previewRight?.timeline_start, 3);
  assert.equal(previewRight?.trim_start, 6);
  assert.equal(previewRight?.duration, 6);
  assert.equal(preview.timeline.elements.find((entry) => entry.id === spanningCaption.id)?.duration, 1);
  assert.equal(preview.timeline.elements.find((entry) => entry.id === laterCaption.id)?.timeline_start, 5);
  assert.equal(
    reviewOperation(readTimeline("marked-pause-cut"), validated.options[0]!.operations[0]!).action,
    "Remove source range and ripple",
  );

  const scopedRaw = structuredClone(raw) as any;
  scopedRaw.caps = { max_mutations: 6, requested_mutations: 6, max_renders: 0 };
  scopedRaw.options[0].requested_mutations = 6;
  scopedRaw.options[0].operations[0].source_range_cut.ripple_lane_keys = ["visual_0", "captions_0"];
  scopedRaw.options[0].operations[0].source_range_cut.max_affected_elements = 3;
  const scoped = validateEditorAgentProposalAgainstProject(scopedRaw, 6, "marked-pause-cut");
  const scopedPreview = previewEditorAgentProposal(scoped);
  assert.deepEqual(
    scopedPreview.timeline.elements.filter((entry) => entry.lane_key === "visual_1"),
    readTimeline("marked-pause-cut").elements.filter((entry) => entry.lane_key === "visual_1"),
    "unselected B-roll must preserve every source, timing, and animation field",
  );
  assert.equal(scopedPreview.timeline.elements.find((entry) => entry.id === insertedId)?.timeline_start, 3);
  assert.equal(scopedPreview.timeline.elements.find((entry) => entry.id === laterCaption.id)?.timeline_start, 5);
  const scopeReview = reviewOperation(readTimeline("marked-pause-cut"), scoped.options[0]!.operations[0]!);
  assert.equal(scopeReview.changes.find((change) => change.field === "ripple_lane_keys")?.after, "Visual 1, Captions");
  scopedRaw.options[0].operations[0].source_range_cut.ripple_lane_keys = ["captions_0"];
  assert.throws(() => validateEditorAgentProposalAgainstProject(scopedRaw, 6, "marked-pause-cut"), /include the target lane/);

  await applyEditorAgentProposal(scoped, 6);
  const applied = readTimeline("marked-pause-cut");
  assert.deepEqual(applied.elements.filter((entry) => entry.lane_key === "visual_1"),
    scopedPreview.timeline.elements.filter((entry) => entry.lane_key === "visual_1"));
  assert.equal(applied.elements.find((entry) => entry.id === insertedId)?.timeline_start, 3);
  assert.equal(applied.elements.find((entry) => entry.id === laterCaption.id)?.timeline_start, 5);
});

test("source-range restore reveals a missing phrase and ripples named lanes forward", () => {
  const projectId = "restore-mid-sentence";
  createProject(projectId, "reels");
  const right = {
    ...element(),
    project_id: projectId,
    timeline_start: 8,
    duration: 4,
    trim_start: 20,
    trim_end: 6,
    volume: 1.45,
    playback_rate: 1,
    props: {
      source_duration_seconds: 30,
      volume_envelope: [{ time_seconds: 0, volume: 1.45 }, { time_seconds: 4, volume: 1.45 }],
    },
  };
  const boundaryCaption = {
    ...element("22222222-2222-4222-8222-222222222222"),
    project_id: projectId,
    type: "caption_text" as const,
    source_url: null,
    lane_key: "captions_0",
    timeline_start: 7,
    duration: 1,
    props: { text: "Here is why", caption_source_end_seconds: 20.5 },
  };
  const later = {
    ...boundaryCaption,
    id: "33333333-3333-4333-8333-333333333333",
    timeline_start: 9,
    duration: 1,
    props: { text: "they may" },
  };
  const music = {
    ...element("44444444-4444-4444-8444-444444444444"),
    project_id: projectId,
    type: "music" as const,
    lane_key: "music_0",
    duration: 20,
  };
  writeTimeline(projectId, { elements: [right, boundaryCaption, later, music], transitions: [] }, "fixture");
  const raw = proposal(projectId, timelineRevision(projectId), {
    operations: [{
      element_id: right.id,
      source_range_restore: {
        source_start_seconds: 19,
        max_affected_elements: 3,
        ripple_lane_keys: ["visual_0", "captions_0"],
        reset_target_volume_to_unity: true,
      },
    }],
    caps: { max_mutations: 4, requested_mutations: 4, max_renders: 0 },
  });
  const validated = validateEditorAgentProposalAgainstProject(raw, 4, projectId);
  const draft = previewEditorAgentProposal(validated).timeline;
  const restored = draft.elements.find((entry) => entry.id === right.id)!;
  assert.equal(restored.trim_start, 19);
  assert.equal(restored.duration, 5);
  assert.equal(restored.volume, 1);
  assert.deepEqual(restored.props?.volume_envelope, [
    { time_seconds: 0, volume: 1 },
    { time_seconds: 4, volume: 1 },
    { time_seconds: 5, volume: 1 },
  ]);
  // Source 20.5 now lands 1.5 seconds after the restored source-in at the
  // existing 8-second boundary, so the caption runs from 7.0 through 9.5.
  assert.equal(draft.elements.find((entry) => entry.id === boundaryCaption.id)?.duration, 2.5);
  assert.equal(draft.elements.find((entry) => entry.id === later.id)?.timeline_start, 10);
  assert.equal(draft.elements.find((entry) => entry.id === music.id)?.duration, 20);

  const invalid = structuredClone(raw);
  invalid.operations[0]!.source_range_restore!.ripple_lane_keys = ["captions_0"];
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(invalid, 4, projectId),
    /must ripple the target lane: visual_0/,
  );

  const dependent = {
    ...element("55555555-5555-4555-8555-555555555555"),
    project_id: projectId,
    voice_clip_id: right.id,
    lane_key: "visual_1",
  };
  writeTimeline(projectId, { elements: [right, boundaryCaption, later, music, dependent], transitions: [] }, "linked-fixture");
  const linkedRestore = proposal(projectId, timelineRevision(projectId), {
    operations: raw.operations,
    caps: raw.caps,
  });
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(linkedRestore, 4, projectId),
    /cannot change a speech clock with linked picture or captions/,
  );
});

test("revision conflicts and hidden props fail closed", async () => {
  createProject("conflict", "web");
  writeTimeline("conflict", { elements: [element()], transitions: [] }, "fixture");
  const stale = timelineRevision("conflict");
  writeTimeline("conflict", { elements: [{ ...element(), duration: 3 }], transitions: [] }, "external");
  await assert.rejects(() => applyEditorAgentProposal(proposal("conflict", stale), 3), /revision changed/);

  const hidden = proposal("conflict", timelineRevision("conflict"), {
    operations: [{ element_id: element().id, props: { renderer_secret: true } }],
  });
  assert.throws(() => validateEditorAgentProposal(hidden, 3), /unrecognized_keys|Unrecognized key/i);
});

test("declared mutation caps must match the runtime cap", () => {
  createProject("caps", "web");
  assert.throws(() => validateEditorAgentProposal(proposal("caps", timelineRevision("caps")), 2), /does not match runtime cap/);
});

test("mutation caps count changed fields rather than operation envelopes", () => {
  createProject("field-caps", "web");
  const raw = proposal("field-caps", timelineRevision("field-caps"), {
    operations: [{ element_id: element().id, patch: { timeline_start: 1, duration: 3 }, props: { media_scale: 1.2 } }],
    caps: { max_mutations: 2, requested_mutations: 3, max_renders: 0 },
  });
  assert.throws(() => validateEditorAgentProposal(raw, 2), /exceeds declared mutation cap/);
});

test("project ids cannot resolve to the projects root or its parent", () => {
  assert.throws(() => inspectEditorAgentProject("."), /Invalid project id/);
  assert.throws(() => inspectEditorAgentProject(".."), /Invalid project id/);
});

test("null-shaped optional output cannot clear unmentioned props", async () => {
  createProject("null-preserve", "web");
  const withCaptionProps = element();
  withCaptionProps.props = { existing: true, absX: 0.25, absY: 0.75, textColor: "#abcdef" };
  writeTimeline("null-preserve", { elements: [withCaptionProps], transitions: [] }, "fixture");
  const raw = proposal("null-preserve", timelineRevision("null-preserve"), {
    operations: [{ element_id: element().id, props: { media_scale: 1.2 } }],
  });
  await applyEditorAgentProposal(raw, 3);
  const props = readTimeline("null-preserve").elements[0]!.props;
  assert.equal(props?.absX, 0.25);
  assert.equal(props?.absY, 0.75);
  assert.equal(props?.textColor, "#abcdef");
});

test("nullable creative fields require the explicit clear surface", () => {
  createProject("implicit-null", "web");
  const raw = proposal("implicit-null", timelineRevision("implicit-null"), {
    operations: [{ element_id: element().id, props: { absX: null } }],
  });
  assert.throws(() => validateEditorAgentProposal(raw, 3));
});

test("explicit clearing of legacy caption coordinates restores semantic placement", async () => {
  createProject("caption-semantic-reset", "reels");
  const caption = element();
  caption.type = "caption_text";
  caption.props = { text: "Keep this wording", absX: 0.23, absY: 0.78, fontSizePx: 56, maxWidth: 0.54 };
  writeTimeline("caption-semantic-reset", { elements: [caption], transitions: [] }, "fixture");
  const raw = proposal("caption-semantic-reset", timelineRevision("caption-semantic-reset"), {
    operations: [{ element_id: caption.id, clear_props: ["absX", "absY"],
      props: { positionPreset: "lower_center", positionNudgeY: "slightly_up" } }],
    caps: { max_mutations: 4, requested_mutations: 4, max_renders: 0 },
  });
  await applyEditorAgentProposal(raw, 4);
  const props = readTimeline("caption-semantic-reset").elements[0]!.props!;
  assert.equal(props.absX, null);
  assert.equal(props.absY, null);
  assert.equal(props.text, "Keep this wording");
  assert.equal(props.fontSizePx, 56);
  const anchor = resolveCaptionAnchorLayout(resolveCaptionProps(props), { left: 0, top: 0, width: 1, height: 1 });
  assert.ok(Math.abs(anchor.y - 0.64) < 0.0001);
  assert.equal(anchor.anchorY, 1);
});

test("explicit clear lists reset only supported nullable fields", async () => {
  createProject("explicit-clear", "web");
  const value = element();
  value.trim_end = 0.5;
  value.props = { existing: true, absX: 0.25, absY: 0.75, textColor: "#abcdef" };
  writeTimeline("explicit-clear", { elements: [value], transitions: [] }, "fixture");
  const raw = proposal("explicit-clear", timelineRevision("explicit-clear"), {
    operations: [{ element_id: element().id, clear_patch: ["trim_end"], clear_props: ["textColor"] }],
  });
  await applyEditorAgentProposal(raw, 3);
  const updated = readTimeline("explicit-clear").elements[0]!;
  assert.equal(updated.trim_end, null);
  assert.equal(updated.props?.absX, 0.25);
  assert.equal(updated.props?.absY, 0.75);
  assert.equal(updated.props?.textColor, null);
});

test("project validation rejects props that do not apply to the element type", () => {
  createProject("applicability", "web");
  writeTimeline("applicability", { elements: [element()], transitions: [] }, "fixture");
  const captionOnVideo = proposal("applicability", timelineRevision("applicability"), {
    operations: [{ element_id: element().id, props: { text: "not a caption" } }],
  });
  assert.throws(() => validateEditorAgentProposalAgainstProject(captionOnVideo, 3, "applicability"), /not applicable/);
});

test("wall-plane controls are advertised and accepted for captions and visual media", () => {
  createProject("caption-surface", "web");
  const caption = {
    ...element(),
    type: "caption_text" as const,
    lane_key: "captions_0",
    props: { text: "96%" },
  };
  writeTimeline("caption-surface", { elements: [caption], transitions: [] }, "fixture");
  const raw = proposal("caption-surface", timelineRevision("caption-surface"), {
    caps: { max_mutations: 5, requested_mutations: 5, max_renders: 0 },
    operations: [{
      element_id: caption.id,
      props: {
        surfaceMode: "wall",
        surfacePerspectivePx: 1000,
        surfaceDepthPx: -110,
        surfaceRotateYDeg: -1.25,
        surfaceBlendMode: "multiply",
      },
    }],
  });
  const validated = validateEditorAgentProposalAgainstProject(raw, 5, "caption-surface");
  assert.equal(validated.options[0]?.operations[0]?.props?.surfaceMode, "wall");
  assert.equal(validated.options[0]?.operations[0]?.props?.surfaceDepthPx, -110);
  assert.ok(editorAgentCapabilities().surface_props.includes("surfaceMode"));

  createProject("visual-surface", "web");
  writeTimeline("visual-surface", { elements: [element()], transitions: [] }, "fixture");
  const visual = proposal("visual-surface", timelineRevision("visual-surface"), {
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    operations: [{ element_id: element().id, props: { surfaceMode: "wall" } }],
  });
  assert.equal(validateEditorAgentProposalAgainstProject(visual, 1, "visual-surface").options[0]?.operations[0]?.props?.surfaceMode, "wall");
});

test("camera motion-blur controls are accepted only for captions", () => {
  createProject("camera-blur", "web");
  const caption = {
    ...element(),
    type: "caption_text" as const,
    lane_key: "captions_0",
    props: { text: "DREAMCUT", styleVariant: "camera_reveal" },
  };
  writeTimeline("camera-blur", { elements: [caption], transitions: [] }, "fixture");
  const raw = proposal("camera-blur", timelineRevision("camera-blur"), {
    operations: [{
      element_id: caption.id,
      props: {
        cameraRevealShutterAngle: 90,
        cameraRevealBlurSamples: 3,
      },
    }],
  });
  const validated = validateEditorAgentProposalAgainstProject(raw, 3, "camera-blur");
  assert.equal(validated.options[0]?.operations[0]?.props?.cameraRevealShutterAngle, 90);
  assert.equal(validated.options[0]?.operations[0]?.props?.cameraRevealBlurSamples, 3);

  createProject("camera-blur-video", "web");
  writeTimeline("camera-blur-video", { elements: [element()], transitions: [] }, "fixture");
  const invalid = proposal("camera-blur-video", timelineRevision("camera-blur-video"), {
    operations: [{
      element_id: element().id,
      props: { cameraRevealShutterAngle: 90 },
    }],
  });
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(invalid, 3, "camera-blur-video"),
    /not applicable/,
  );
});

test("agent preserves aligned captions for non-lexical edits and requires an explicit phrase fallback for lexical edits", () => {
  createProject("caption-alignment", "web");
  const aligned = element();
  aligned.type = "caption_text";
  aligned.lane_key = "captions_0";
  aligned.props = {
    text: "One two",
    timingMode: "active_word",
    wordTimings: [
      { text: "One", start: 0, end: 0.4 },
      { text: "two", start: 0.5, end: 0.9 },
    ],
  };
  writeTimeline("caption-alignment", { elements: [aligned], transitions: [] }, "fixture");

  const punctuationOnly = proposal("caption-alignment", timelineRevision("caption-alignment"), {
    operations: [{ element_id: aligned.id, props: { text: "ONE two!" } }],
  });
  assert.doesNotThrow(() => validateEditorAgentProposalAgainstProject(punctuationOnly, 3, "caption-alignment"));

  const unsafeLexicalEdit = proposal("caption-alignment", timelineRevision("caption-alignment"), {
    operations: [{ element_id: aligned.id, props: { text: "One changed" } }],
  });
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(unsafeLexicalEdit, 3, "caption-alignment"),
    /requires timingMode=phrase and clearing wordTimings/,
  );

  const safeLexicalEdit = proposal("caption-alignment", timelineRevision("caption-alignment"), {
    operations: [{
      element_id: aligned.id,
      props: { text: "One changed", timingMode: "phrase" },
      clear_props: ["wordTimings"],
    }],
  });
  assert.doesNotThrow(() => validateEditorAgentProposalAgainstProject(safeLexicalEdit, 3, "caption-alignment"));
});

test("project validation enforces locked positions and relative delta caps", () => {
  createProject("delta-caps", "web");
  const locked = { ...element(), position_locked: true };
  writeTimeline("delta-caps", { elements: [locked], transitions: [] }, "fixture");
  const moveLocked = proposal("delta-caps", timelineRevision("delta-caps"), {
    operations: [{ element_id: element().id, patch: { timeline_start: 1 } }],
  });
  assert.throws(() => validateEditorAgentProposalAgainstProject(moveLocked, 3, "delta-caps"), /locked position/);

  locked.position_locked = false;
  writeTimeline("delta-caps", { elements: [locked], transitions: [] }, "unlock");
  const hugeMove = proposal("delta-caps", timelineRevision("delta-caps"), {
    operations: [{ element_id: element().id, patch: { timeline_start: 61 } }],
  });
  assert.throws(() => validateEditorAgentProposalAgainstProject(hugeMove, 3, "delta-caps"), /delta cap/);
});

test("effect proposal values use the same precision normalizers as the UI", () => {
  createProject("normalizers", "web");
  writeTimeline("normalizers", { elements: [element()], transitions: [] }, "fixture");
  const raw = proposal("normalizers", timelineRevision("normalizers"), {
    operations: [{ element_id: element().id, props: { media_scale: 1.23456, media_offset_x: 0.12345 } }],
  });
  const validated = validateEditorAgentProposalAgainstProject(raw, 3, "normalizers");
  const props = validated.options[0]?.operations[0]?.props as Record<string, unknown>;
  assert.equal(props.media_scale, clampMediaScale(1.23456));
  assert.equal(props.media_offset_x, clampMediaOffset(0.12345));
  assert.equal(props.media_scale, Number((1.23456).toFixed(ANIMATED_TRANSFORM_PRECISION)));
  assert.equal(props.media_offset_x, Number((0.12345).toFixed(ANIMATED_TRANSFORM_PRECISION)));
});

test("agent-authored chroma keys derive the required model in preview and approval", async () => {
  createProject("agent-chroma-key", "web");
  writeTimeline("agent-chroma-key", { elements: [element()], transitions: [] }, "fixture");
  const raw = proposal("agent-chroma-key", timelineRevision("agent-chroma-key"), {
    operations: [{
      element_id: element().id,
      props: {
        chroma_key_color: "#89BBC0",
        chroma_key_tolerance: 0.1414,
        chroma_key_softness: 0.0614,
        chroma_key_spill: 0.2514,
      },
    }],
    caps: { max_mutations: 4, requested_mutations: 4, max_renders: 0 },
  });
  const validated = validateEditorAgentProposalAgainstProject(raw, 4, "agent-chroma-key");
  const previewElement = previewEditorAgentProposal(validated).timeline.elements[0]!;
  assert.equal(previewElement.props?.chroma_key_model, "color-key-v1");
  assert.equal(previewElement.props?.chroma_key_color, "#89bbc0");
  assert.equal(previewElement.props?.chroma_key_tolerance, 0.141);
  assert.equal(previewElement.props?.chroma_key_softness, 0.061);
  assert.equal(previewElement.props?.chroma_key_spill, 0.251);

  await applyEditorAgentProposal(validated, 4);
  const applied = readTimeline("agent-chroma-key").elements[0]!;
  assert.equal(applied.props?.chroma_key_model, "color-key-v1");
  assert.equal(applied.props?.chroma_key_color, "#89bbc0");
});

test("new visual proposals require preparation before mounting an imported catalog clip with a chroma key", () => {
  createProject("create-agent-chroma-key", "web");
  writeTimeline("create-agent-chroma-key", { elements: [element()], transitions: [] }, "fixture");
  const raw = proposal("create-agent-chroma-key", timelineRevision("create-agent-chroma-key"), {
    operations: [{
      element_id: "77777777-7777-4777-8777-777777777777",
      create_visual: {
        type: "video_clip",
        source_url: "/api/projects/create-agent-chroma-key/media/sources/falling-money.mp4",
        title: "Falling money",
        timeline_start: 2,
        source_duration_seconds: 28.6,
        source_start_seconds: 19,
        source_end_seconds: 21.6,
        lane_key: "visual_1",
        lane_index: 1,
        chroma_key_color: "#1C2440",
        chroma_key_tolerance: 0.1004,
        chroma_key_softness: 0.0354,
        chroma_key_spill: 0.4504,
      },
    }],
    caps: { max_mutations: 13, requested_mutations: 13, max_renders: 0 },
  });
  assert.throws(() => validateEditorAgentProposalAgainstProject(raw, 13, "create-agent-chroma-key"), /not ready/);
  preparedVideoFixture("create-agent-chroma-key", "sources/falling-money.mp4", 28.6);
  const validated = validateEditorAgentProposalAgainstProject(raw, 13, "create-agent-chroma-key");
  const created = previewEditorAgentProposal(validated).timeline.elements.find((candidate) =>
    candidate.id === "77777777-7777-4777-8777-777777777777")!;
  assert.equal(created.props?.chroma_key_model, "color-key-v1");
  assert.equal(created.props?.chroma_key_color, "#1c2440");
  assert.equal(created.props?.chroma_key_tolerance, 0.1);
  assert.equal(created.props?.chroma_key_softness, 0.035);
  assert.equal(created.props?.chroma_key_spill, 0.45);
});

test("agent-authored chroma amounts cannot create orphaned key controls", () => {
  createProject("agent-chroma-orphan", "web");
  writeTimeline("agent-chroma-orphan", { elements: [element()], transitions: [] }, "fixture");
  const raw = proposal("agent-chroma-orphan", timelineRevision("agent-chroma-orphan"), {
    operations: [{ element_id: element().id, props: { chroma_key_tolerance: 0.2 } }],
  });
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(raw, 3, "agent-chroma-orphan"),
    /Chroma key amounts require chroma_key_color/,
  );
});

test("grade controls are safely advertised with units, model limits, and mounted UI coverage", () => {
  const capabilities = editorAgentCapabilities();
  const exposure = capabilities.effect_controls.find((control) => control.prop === "grade_exposure_ev");
  assert.ok(exposure);
  assert.equal(exposure.units, "EV");
  assert.equal(exposure.color_space, "linear-sRGB");
  assert.match(exposure.model ?? "", /derived automatically/);
  assert.equal(exposure.ui_control, "grade-scrubber");
});

test("agent-authored grades derive the model, normalize, persist atomically, and use absolute bounds", async () => {
  createProject("agent-grade", "web");
  writeTimeline("agent-grade", { elements: [element()], transitions: [] }, "fixture");
  const beforeHistory = fs.readdirSync(projectHistoryDir("agent-grade")).length;
  const raw = proposal("agent-grade", timelineRevision("agent-grade"), {
    operations: [{ element_id: element().id, props: { grade_exposure_ev: 0.4567, grade_temperature: 0.25 } }],
  });
  await applyEditorAgentProposal(raw, 3);
  const updated = readTimeline("agent-grade").elements[0]!;
  assert.equal(updated.props?.color_grade_model, "linear-srgb-v1");
  assert.equal(updated.props?.grade_exposure_ev, 0.46);
  assert.equal(updated.props?.grade_temperature, 0.25);
  // One write, bracketed by explicit before/after snapshots so the editor can
  // surface the approval as a single visible Undo entry.
  assert.equal(fs.readdirSync(projectHistoryDir("agent-grade")).length, beforeHistory + 3);

  const tooLarge = proposal("agent-grade", timelineRevision("agent-grade"), {
    operations: [{ element_id: element().id, props: { grade_exposure_ev: 2 } }],
  });
  assert.doesNotThrow(() => validateEditorAgentProposalAgainstProject(tooLarge, 3, "agent-grade"));
  assert.throws(() => editorAgentPropsSchema.parse({grade_exposure_ev: 100}));
});

test("output format stays proposal-only and applies atomically with approval", async () => {
  createProject("agent-output-format", "web");
  writeTimeline("agent-output-format", { elements: [element()], transitions: [] }, "fixture");
  const raw = proposal("agent-output-format", timelineRevision("agent-output-format"), {
    operations: [{
      element_id: "22222222-2222-4222-8222-222222222222",
      set_output_format: { aspect_ratio: "9:16", delivery_target: "reels" },
    }],
    caps: { max_mutations: 2, requested_mutations: 2, max_renders: 0 },
  });
  const validated = validateEditorAgentProposalAgainstProject(raw, 2, "agent-output-format");
  const preview = previewEditorAgentProposal(validated);
  assert.deepEqual(preview.outputFormat, { aspect_ratio: "9:16", delivery_target: "reels" });
  assert.equal(readMetadata("agent-output-format").output_aspect_ratio, "16:9");

  await applyEditorAgentProposal(validated, 2);
  assert.equal(readMetadata("agent-output-format").output_aspect_ratio, "9:16");
  assert.equal(readMetadata("agent-output-format").delivery_target, "reels");
});

test("a frame-rate proposal re-snaps picture clips in preview and approval alike", async () => {
  createProject("agent-frame-rate", "web");
  // 31 frames at 30 fps (1.0333 s) is off the 24 fps grid.
  writeTimeline("agent-frame-rate", { elements: [{ ...element(), project_id: "agent-frame-rate", timeline_start: 31 / 30 }], transitions: [] }, "fixture");
  const raw = proposal("agent-frame-rate", timelineRevision("agent-frame-rate"), {
    operations: [{ element_id: "22222222-2222-4222-8222-222222222222", set_output_format: { frame_rate: 24 } }],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
  });
  const validated = validateEditorAgentProposalAgainstProject(raw, 1, "agent-frame-rate");
  const preview = previewEditorAgentProposal(validated);
  assert.deepEqual(preview.outputFormat, { frame_rate: 24 });
  const previewed = preview.timeline.elements[0]!.timeline_start;
  assert.equal(previewed, 25 / 24, "preview snaps 1.0333 s (24.8 frames) to frame 25 at 24 fps");

  await applyEditorAgentProposal(validated, 1);
  assert.equal(readMetadata("agent-frame-rate").frame_rate, 24);
  assert.equal(readTimeline("agent-frame-rate").elements[0]!.timeline_start, previewed, "approval matches preview");
});

test("still source swaps preserve timing, transforms, and animation keyframes", () => {
  createProject("still-source-swap", "web");
  const still = {
    ...element(),
    project_id: "still-source-swap",
    type: "still" as const,
    source_url: "/api/projects/still-source-swap/media/raw.png",
    props: {
      media_scale: 0.42,
      media_offset_x: -0.56,
      keyframes: { media_offset_y: [{ t: 0, v: 0 }, { t: 1, v: 0.03 }] },
    },
  };
  writeTimeline("still-source-swap", { elements: [still], transitions: [] }, "fixture");
  const raw = proposal("still-source-swap", timelineRevision("still-source-swap"), {
    operations: [{
      element_id: still.id,
      patch: { source_url: "/api/projects/still-source-swap/media/reusable-sticker.png" },
    }],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
  });
  const draft = previewEditorAgentProposal(validateEditorAgentProposalAgainstProject(raw, 1, "still-source-swap")).timeline.elements[0]!;
  assert.equal(draft.source_url, "/api/projects/still-source-swap/media/reusable-sticker.png");
  assert.equal(draft.timeline_start, still.timeline_start);
  assert.equal(draft.duration, still.duration);
  assert.deepEqual(draft.props, still.props);
});

test("source swaps reject synchronized playable media and keyframes can be cleared explicitly", () => {
  createProject("source-swap-guard", "web");
  const video = element();
  video.props = { keyframes: { media_offset_x: [{ t: 0, v: -0.2 }, { t: 1, v: 0.2 }] } };
  writeTimeline("source-swap-guard", { elements: [video], transitions: [] }, "fixture");
  const swap = proposal("source-swap-guard", timelineRevision("source-swap-guard"), {
    operations: [{
      element_id: video.id,
      patch: { source_url: "/api/projects/source-swap-guard/media/replacement.mp4" },
    }],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
  });
  assert.throws(
    () => validateEditorAgentProposalAgainstProject(swap, 1, "source-swap-guard"),
    /only applicable to still elements/,
  );
  const clear = proposal("source-swap-guard", timelineRevision("source-swap-guard"), {
    operations: [{ element_id: video.id, clear_props: ["keyframes"] }],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
  });
  const draft = previewEditorAgentProposal(validateEditorAgentProposalAgainstProject(clear, 1, "source-swap-guard")).timeline.elements[0]!;
  assert.equal(draft.props?.keyframes, null);
});

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test("zoom proposals preserve other animation tracks and enforce clip-local bounds", async () => {
  const id = "zoom-keyframe-proposal";
  createProject(id, "web");
  const clip = element();
  const opacity = [{ t: 0, v: 0.8 }, { t: 1, v: 1 }];
  clip.props = { media_scale: 1.12, keyframes: { media_opacity: opacity } };
  writeTimeline(id, { elements: [clip], transitions: [] }, "fixture");
  const points = [{ t: 0, v: 1 }, { t: 0.8, v: 1 }, { t: 1, v: 1.12, ease: "easeInOut" }];
  const make = (value: unknown) => proposal(id, timelineRevision(id), {
    operations: [{ element_id: clip.id, props: { media_scale_keyframes: value } }],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
  });
  assert.throws(() => validateEditorAgentProposalAgainstProject(make([{ t: 0, v: 1 }, { t: 3, v: 1.12 }]), 1, id), /duration/);
  assert.throws(() => validateEditorAgentProposalAgainstProject(make([{ t: 0.5, v: 1 }, { t: 1, v: 1.12 }]), 1, id));
  const valid = validateEditorAgentProposalAgainstProject(make(points), 1, id);
  const draft = previewEditorAgentProposal(valid).timeline.elements[0]!;
  assert.deepEqual(readKeyframeMap(draft.props), { media_opacity: opacity, media_scale: points });
  assert.equal(draft.timeline_start, clip.timeline_start);
  assert.equal(draft.trim_start, clip.trim_start);
  assert.equal(draft.duration, clip.duration);
  assert.equal(readKeyframeMap(readTimeline(id).elements[0]!.props).media_scale, undefined);
  await applyEditorAgentProposal(valid, 1);
  assert.deepEqual(readKeyframeMap(readTimeline(id).elements[0]!.props), readKeyframeMap(draft.props));

  const verticalPoints = [
    { t: 0, v: 0.05, ease: "easeInOut" },
    { t: 1, v: 0.038, ease: "easeInOut" },
    { t: 2, v: 0.05, ease: "easeInOut" },
  ];
  const verticalRaw = proposal(id, timelineRevision(id), {
    operations: [{ element_id: clip.id, props: { media_offset_y_keyframes: verticalPoints } }],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
  });
  const vertical = validateEditorAgentProposalAgainstProject(verticalRaw, 1, id);
  const verticalDraft = previewEditorAgentProposal(vertical).timeline.elements[0]!;
  assert.deepEqual(readKeyframeMap(verticalDraft.props).media_offset_y, verticalPoints);
  assert.deepEqual(readKeyframeMap(verticalDraft.props).media_scale, points);
});

test("mask-window proposals keep the source full-frame before a timed close", async () => {
  const id = "mask-window-keyframe-proposal";
  createProject(id, "web");
  const clip = element();
  const opacity = [{ t: 0, v: 1 }, { t: 1, v: 0.9 }];
  clip.props = { keyframes: { media_opacity: opacity } };
  writeTimeline(id, { elements: [clip], transitions: [] }, "fixture");
  const points = [
    { t: 0, v: [0, 0, 0, 0], ease: "hold" },
    { t: 1, v: [0, 0, 0, 0], ease: "easeOut" },
    { t: 1.6, v: [0.34, 0, 0.5, 0] },
  ];
  const make = (value: unknown) => proposal(id, timelineRevision(id), {
    operations: [{ element_id: clip.id, props: { mask_inset_keyframes: value } }],
    caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
  });
  assert.throws(() => validateEditorAgentProposalAgainstProject(make([
    { t: 0, v: [0, 0, 0, 0] }, { t: 1, v: [0.6, 0, 0, 0] },
  ]), 1, id), /per-edge delta cap/);
  assert.throws(() => validateEditorAgentProposalAgainstProject(make([
    { t: 0, v: [0, 0, 0, 0] }, { t: 3, v: [0.34, 0, 0.5, 0] },
  ]), 1, id), /duration/);
  const valid = validateEditorAgentProposalAgainstProject(make(points), 1, id);
  const draft = previewEditorAgentProposal(valid).timeline.elements[0]!;
  assert.deepEqual(readKeyframeMap(draft.props).media_opacity, opacity);
  assert.deepEqual(readKeyframeMap(draft.props).mask_inset, points);
  assert.equal(resolveMaskInsetAtTime(draft.props, 0.9).top, 0);
  assert.ok(resolveMaskInsetAtTime(draft.props, 1.3).top > 0);
  assert.deepEqual(resolveMaskInsetAtTime(draft.props, 1.6), { top: 0.34, right: 0, bottom: 0.5, left: 0 });
  assert.equal(readKeyframeMap(readTimeline(id).elements[0]!.props).mask_inset, undefined);
  await applyEditorAgentProposal(valid, 1);
  assert.deepEqual(readKeyframeMap(readTimeline(id).elements[0]!.props), readKeyframeMap(draft.props));
});

test("a cropped panel can reveal its complete image while retaining the crop-increase cap", () => {
  const id = "panel-full-frame-reveal";
  createProject(id, "web");
  const clip = element();
  clip.props = {mask_inset:[0,0,2/3,0]};
  writeTimeline(id,{elements:[clip],transitions:[]},"fixture");
  const points = [{t:0,v:[0,0,2/3,0]},{t:1,v:[0,0,0,0]}];
  const make = (value: unknown) => proposal(id,timelineRevision(id),{
    operations:[{element_id:clip.id,props:{mask_inset_keyframes:value}}],
    caps:{max_mutations:1,requested_mutations:1,max_renders:0},
  });
  const valid=validateEditorAgentProposalAgainstProject(make(points),1,id);
  const draft=previewEditorAgentProposal(valid).timeline.elements[0]!;
  assert.deepEqual(resolveMaskInsetAtTime(draft.props,1),{top:0,right:0,bottom:0,left:0});
  assert.throws(()=>validateEditorAgentProposalAgainstProject(make([{t:0,v:[0,0,2/3,0]},{t:1,v:[.6,0,0,0]}]),1,id),/per-edge delta cap/);
});

test("caption camera pan shares media motion without admitting unsupported caption effects", () => {
  const id = "caption-camera-pan";
  createProject(id, "web");
  const caption = {...element(), type: "caption_text" as const, lane_key: "captions_0", props: {text: "in Budapest"}};
  writeTimeline(id, {elements: [caption], transitions: []}, "fixture");
  const points = [{t: 0, v: 0}, {t: 1, v: 0}, {t: 2, v: -2}];
  const make = (tracks: unknown) => proposal(id, timelineRevision(id), {
    operations: [{element_id: caption.id, props: {transition_keyframes: tracks}}],
    caps: {max_mutations: 1, requested_mutations: 1, max_renders: 0},
  });
  const valid = validateEditorAgentProposalAgainstProject(make({media_offset_x: points}), 1, id);
  const draft = previewEditorAgentProposal(valid).timeline.elements[0]!;
  assert.deepEqual(readKeyframeMap(draft.props).media_offset_x, points);
  assert.equal(draft.timeline_start, caption.timeline_start);
  assert.equal(readTimeline(id).elements[0]!.props?.keyframes, undefined);
  assert.throws(() => validateEditorAgentProposalAgainstProject(make({media_opacity: [{t: 0, v: 1}, {t: 1, v: 0}]}), 1, id), /horizontal motion only/);
  assert.throws(() => validateEditorAgentProposalAgainstProject(make({media_offset_x: [{t: 0, v: 0}, {t: 3, v: -2}]}), 1, id), /duration/);
});

test("source speed steps preserve other tracks and reject mismatched clocks", () => {
  const id = "proposal-speed-steps";
  createProject(id, "web");
  const clip = element();
  clip.props = {source_duration_seconds: 2, keyframes: {media_opacity: [{t: 0, v: 1}]}};
  writeTimeline(id, {elements: [clip], transitions: []}, "fixture");
  const make = (duration: number, source_t = 1) => proposal(id, timelineRevision(id), {
    operations: [{element_id: clip.id, patch: {duration}, props: {playback_speed_steps: [{source_t, v: 2}]}}],
    caps: {max_mutations: 2, requested_mutations: 2, max_renders: 0},
  });
  assert.throws(() => validateEditorAgentProposalAgainstProject(make(2), 2, id), /duration/);
  assert.throws(() => validateEditorAgentProposalAgainstProject(make(1.5, 3), 2, id), /source window/);
  const valid = validateEditorAgentProposalAgainstProject(make(1.5), 2, id);
  const draft = previewEditorAgentProposal(valid).timeline.elements[0]!;
  assert.equal(draft.duration, 1.5);
  assert.deepEqual(readKeyframeMap(draft.props).playback_rate, [{t: 1, source_t: 1, v: 2, ease: "hold"}]);
  assert.deepEqual(readKeyframeMap(draft.props).media_opacity, [{t: 0, v: 1}]);
  assert.equal(readTimeline(id).elements[0]!.duration, 2);
});

test("reverse is a proposal-applied clip choice that refuses to combine with speed steps", () => {
  const id = "proposal-reverse";
  createProject(id, "web");
  const clip = element();
  clip.props = {source_duration_seconds: 2};
  writeTimeline(id, {elements: [clip], transitions: []}, "fixture");
  const make = (props: Record<string, unknown>, count = 1) => proposal(id, timelineRevision(id), {
    operations: [{element_id: clip.id, props}],
    caps: {max_mutations: count, requested_mutations: count, max_renders: 0},
  });
  const draft = previewEditorAgentProposal(validateEditorAgentProposalAgainstProject(make({playback_reverse: true}), 1, id)).timeline.elements[0]!;
  assert.equal(draft.props?.playback_reverse, true);
  assert.equal(draft.duration, clip.duration);
  assert.equal(readTimeline(id).elements[0]!.props?.playback_reverse, undefined);
  assert.throws(() => validateEditorAgentProposalAgainstProject(make({playback_reverse: true, playback_speed_steps: [{source_t: 1, v: 2}]}, 2), 2, id), /constant speed/);
});

test("an invalid review dial is dropped with a warning while the edit still validates", () => {
  const id = "proposal-dropped-dial";
  createProject(id, "web");
  const clip = element();
  clip.props = {source_duration_seconds: 2};
  writeTimeline(id, {elements: [clip], transitions: []}, "fixture");
  const {operations: _v1, ...head} = proposal(id, timelineRevision(id), {caps: {max_mutations: 1, requested_mutations: 1, max_renders: 0}});
  const raw = {...head, schema_version: 2, options: [{id: "a", label: "Reverse", recommended: true, summary: "Reverse", requested_mutations: 1,
    operations: [{element_id: clip.id, props: {playback_reverse: true}}],
    review_controls: [{operation_index: 0, target: "bogus", field: "x"}, {operation_index: 0, target: "props", field: "missing_field"}]}]};
  const valid = validateEditorAgentProposalAgainstProject(raw, 1, id);
  assert.deepEqual(valid.options[0]!.review_controls, []);
  assert.equal(valid.options[0]!.dropped_review_controls?.length, 2);
  assert.match(proposalWarnings(valid)[0]!, /review_controls\[0\] was dropped .*target/);
  assert.equal(previewEditorAgentProposal(valid).timeline.elements[0]!.props?.playback_reverse, true);
});

test("handled visual creation preserves its selected grade and ambient gain", async () => {
  const id = "create-graded-drive";
  createProject(id, "web");
  writeTimeline(id, { elements: [element()], transitions: [] }, "fixture");
  preparedVideoFixture(id, "sources/drive.mov", 30);
  const raw = proposal(id, timelineRevision(id), {
    operations: [{ element_id: "77777777-7777-4777-8777-777777777777", create_visual: {
      type: "video_clip", source_url: `/api/projects/${id}/media/sources/drive.mov`,
      timeline_start: 10, source_duration_seconds: 30, source_start_seconds: 7, source_end_seconds: 25,
      playback_rate: 1.5, lane_key: "visual_1", lane_index: 1, volume: 1,
      color_grade: { grade_exposure_ev: -.81, grade_contrast: .99, grade_whites: -.27 },
    } }], caps: { max_mutations: 11, requested_mutations: 11, max_renders: 0 },
  });
  const validated = validateEditorAgentProposalAgainstProject(raw, 11, id);
  const preview = previewEditorAgentProposal(validated).timeline.elements.at(-1)!;
  assert.equal(preview.duration, 12);
  assert.equal(preview.trim_start, 7);
  assert.equal(preview.trim_end, 5);
  assert.equal(preview.volume, 1);
  assert.equal(preview.props?.grade_exposure_ev, -.81);
  assert.equal(preview.props?.color_grade_model, "linear-srgb-v1");
  await applyEditorAgentProposal(validated, 11);
  assert.deepEqual(readTimeline(id).elements.at(-1)?.props, preview.props);
});


test("registered effect dials accept their domain without hidden relative caps", () => {
  const id = "dial-domain";
  createProject(id, "web");
  writeTimeline(id, {elements:[element()],transitions:[]}, "fixture");
  for (const props of [{media_scale:3}, {media_offset_x:1.5}, {media_opacity:0}, {directional_blur_x:380}, {animationInDuration:2}]) {
    const raw = proposal(id,timelineRevision(id), {operations:[{element_id:element().id,props}]});
    assert.doesNotThrow(() => validateEditorAgentProposalAgainstProject(raw,3,id));
  }
  assert.throws(() => editorAgentPropsSchema.parse({directional_blur_x:1081}));
});

test("the server counts a proposal's changes when the agent omits them", () => {
  const operation = { element_id: "11111111-1111-4111-8111-111111111111", props: { media_scale: 1.2, playback_reverse: true } };
  const head = { project_id: "counts", expected_revision: "0".repeat(64), mode: "workshop", decision: "propose", summary: "Punch in", assumptions: [], unresolved_gaps: [], schema_version: 2 };
  const derived = validateEditorAgentProposal({ ...head, options: [{ id: "a", label: "Punch in", recommended: true, summary: "Punch in", operations: [operation] }] }, 24);
  assert.equal(derived.options[0]!.requested_mutations, 2);
  // The cap defaults to the runtime's, so the agent never has to know it.
  assert.deepEqual(derived.caps, { max_mutations: 24, requested_mutations: 2, max_renders: 0 });
  const v1 = validateEditorAgentProposal({ ...head, schema_version: 1, operations: [operation] }, 24);
  assert.equal(v1.caps.requested_mutations, 2);
  // A model's discriminator label is ignored and never stored.
  const labelled = validateEditorAgentProposal({ ...head, options: [{ id: "a", label: "Punch in", recommended: true, summary: "Punch in", operations: [{ type: "update_element", ...operation }] }] }, 24);
  assert.equal("type" in labelled.options[0]!.operations[0]!, false);
  assert.equal(labelled.options[0]!.requested_mutations, 2);
  assert.throws(() => validateEditorAgentProposal({ ...head, options: [{ id: "a", label: "Remove", recommended: true, summary: "Remove", operations: [{ type: "delete", element_id: operation.element_id }] }] }, 24), /Empty mutation/);
  // A count the agent does send still has to be right, and a tighter cap still binds.
  assert.throws(() => validateEditorAgentProposal({ ...head, options: [{ id: "a", label: "Punch in", recommended: true, summary: "Punch in", requested_mutations: 1, operations: [operation] }] }, 24));
  assert.throws(() => validateEditorAgentProposal({ ...head, caps: { max_mutations: 1 }, options: [{ id: "a", label: "Punch in", recommended: true, summary: "Punch in", operations: [operation] }] }, 24));
  assert.throws(() => validateEditorAgentProposal({ ...head, options: [{ id: "a", label: "Punch in", recommended: true, summary: "Punch in", operations: [operation] }] }, 1));
});

test("a draft without dials gets every supported changed field as a main dial", () => {
  const music = (id: string) => ({ element_id: id, patch: { fade_out: 3 } });
  const refs = defaultReviewControls([
    { element_id: "11111111-1111-4111-8111-111111111111", props: { media_scale: 1.2, playback_reverse: true, media_mirror: "horizontal" } },
    music("22222222-2222-4222-8222-222222222222"), music("33333333-3333-4333-8333-333333333333"),
  ]);
  // Booleans have no dial; each changed field gets its own dial, never linked or trimmed.
  assert.deepEqual(refs, [
    { operation_index: 0, target: "props", field: "media_scale" },
    { operation_index: 0, target: "props", field: "media_mirror" },
    { operation_index: 1, target: "patch", field: "fade_out" },
    { operation_index: 2, target: "patch", field: "fade_out" },
  ]);
});

test("default dials apply only to drafts that name none, and record that the server chose them", () => {
  const operation = { element_id: "11111111-1111-4111-8111-111111111111", props: { media_scale: 1.2 } };
  const head = { project_id: "dials", expected_revision: "0".repeat(64), mode: "workshop", decision: "propose", summary: "Punch in", assumptions: [], unresolved_gaps: [], schema_version: 2 };
  const option = { id: "a", label: "Punch in", recommended: true, summary: "Punch in", operations: [operation] };
  const filled = validateEditorAgentProposal(withDefaultReviewControls({ ...head, options: [option] }), 24).options[0]!;
  assert.deepEqual(filled.review_controls, [{ operation_index: 0, target: "props", field: "media_scale" }]);
  assert.equal(filled.review_controls_origin, "server");
  const chosen = validateEditorAgentProposal(withDefaultReviewControls({ ...head, options: [{ ...option, operations: [{ ...operation, props: { media_scale: 1.2, media_offset_x: 0.1 } }], review_controls: [{ operation_index: 0, target: "props", field: "media_offset_x" }] }] }), 24).options[0]!;
  assert.deepEqual(chosen.review_controls, [{ operation_index: 0, target: "props", field: "media_offset_x" }]);
  assert.equal(chosen.review_controls_origin, "agent");
  // A stored proposal re-parsed for approval keeps exactly the dials it was saved with.
  assert.equal(validateEditorAgentProposal({ ...head, options: [option] }, 24).options[0]!.review_controls, undefined);
});

test("a recast swaps a placed clip's picture, keeps its timing and refuses a window that misses it", () => {
  const projectId = "recast-swap";
  createProject(projectId, "web");
  preparedVideoFixture(projectId, "sources/concert.mp4", 20);
  preparedVideoFixture(projectId, "generated/take.mp4", 5);
  const media = (source: string) => `/api/projects/${projectId}/media/${source}`;
  const video = { ...element(), project_id: projectId, source_url: media("sources/concert.mp4"), trim_start: 10, duration: 2, timeline_start: 4,
    props: { archival_source_url: media("sources/concert.mp4"), preview_source_url: media("sources/concert.mp4.preview.mp4"), source_duration_seconds: 20, media_scale: 1.1 } };
  writeTimeline(projectId, { elements: [video], transitions: [] }, "fixture");
  const recast = (source_window_start: number) => proposal(projectId, timelineRevision(projectId), {
    summary: "Recast the singer.", caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    operations: [{ element_id: video.id, use_recast: { recast_source_url: media("generated/take.mp4"), source_window_start, generation_id: "44444444-4444-4444-8444-444444444444", model: "H3 Max Recast" } }],
  });
  const swapped = previewEditorAgentProposal(validateEditorAgentProposalAgainstProject(recast(8.5), 1, projectId)).timeline.elements.find(e => e.id === video.id)!;
  assert.equal(swapped.source_url, media("generated/take.mp4"));
  assert.equal(swapped.timeline_start, 4, "timeline timing is unchanged");
  assert.equal(swapped.duration, 2);
  assert.equal(swapped.trim_start, 1.5, "10 s on the source is 1.5 s into a recast that starts at 8.5 s");
  assert.equal(swapped.trim_end, 1.5);
  assert.equal(swapped.props?.preview_source_url, media("generated/take.mp4.preview.mp4"));
  assert.equal(swapped.props?.media_scale, 1.1, "layout and look are kept");
  assert.equal((swapped.props?.recast as { original_source_url: string }).original_source_url, media("sources/concert.mp4"));
  assert.equal(readTimeline(projectId).elements[0].source_url, media("sources/concert.mp4"), "nothing changes before approval");
  assert.throws(() => previewEditorAgentProposal(validateEditorAgentProposalAgainstProject(recast(11), 1, projectId)), /recast a window that contains the clip/);
});

test("a recast of a speed-stepped clip consumes the stepped source window and moves its steps onto the recast's clock", () => {
  const projectId = "recast-speed-steps";
  createProject(projectId, "web");
  preparedVideoFixture(projectId, "sources/concert.mp4", 20);
  preparedVideoFixture(projectId, "generated/take.mp4", 5);
  const media = (source: string) => `/api/projects/${projectId}/media/${source}`;
  // Source 10–11 s at 1×, then 2× from 11 s: two timeline seconds sample source 10–13 s.
  const video = { ...element(), project_id: projectId, source_url: media("sources/concert.mp4"), trim_start: 10, trim_end: 7, duration: 2, timeline_start: 4, playback_rate: 1,
    props: { archival_source_url: media("sources/concert.mp4"), preview_source_url: media("sources/concert.mp4.preview.mp4"), source_duration_seconds: 20,
      keyframes: { playback_rate: [{ t: 1, source_t: 11, v: 2, ease: "hold" }] } } };
  writeTimeline(projectId, { elements: [video], transitions: [] }, "fixture");
  const recast = (source_window_start: number) => proposal(projectId, timelineRevision(projectId), {
    summary: "Recast the singer.", caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    operations: [{ element_id: video.id, use_recast: { recast_source_url: media("generated/take.mp4"), source_window_start, generation_id: "44444444-4444-4444-8444-444444444444", model: "H3 Max Recast" } }],
  });
  const swapped = previewEditorAgentProposal(validateEditorAgentProposalAgainstProject(recast(8.5), 1, projectId)).timeline.elements.find(e => e.id === video.id)!;
  assert.equal(swapped.trim_start, 1.5);
  assert.equal(swapped.trim_end, 0.5, "the clip consumes 3 s of source (10–13 s), not duration × rate");
  assert.deepEqual((swapped.props?.keyframes as { playback_rate: { source_t: number }[] }).playback_rate.map(point => point.source_t), [2.5], "the 11 s step sits at 2.5 s on the recast");
  const recastStart = (swapped.props?.recast as { source_window_start: number }).source_window_start;
  assert.equal(recastStart + timelineTimeToSourceTime(swapped, 2), 13, "two timeline seconds still sample original-equivalent 13 s");
  assert.equal(speedStepDuration(swapped), 2, "the clip's playback length is unchanged");
  // The stepped window (10–13 s) does not fit a recast that ends at 12.5 s.
  assert.throws(() => previewEditorAgentProposal(validateEditorAgentProposalAgainstProject(recast(7.5), 1, projectId)), /uses 10\.00–13\.00s/);
});

test("a recast refuses a speed-ramped clip instead of mistiming its source-clock ramp", () => {
  const projectId = "recast-speed-ramp";
  createProject(projectId, "web");
  preparedVideoFixture(projectId, "sources/concert.mp4", 20);
  preparedVideoFixture(projectId, "generated/take.mp4", 5);
  const media = (source: string) => `/api/projects/${projectId}/media/${source}`;
  const video = { ...element(), project_id: projectId, source_url: media("sources/concert.mp4"), trim_start: 10, trim_end: 8, duration: 2, timeline_start: 4, playback_rate: 1,
    props: { archival_source_url: media("sources/concert.mp4"), preview_source_url: media("sources/concert.mp4.preview.mp4"), source_duration_seconds: 20,
      playback_ramp_slow_start_source_seconds: 10.5, playback_ramp_slow_end_source_seconds: 11 } };
  writeTimeline(projectId, { elements: [video], transitions: [] }, "fixture");
  const recast = proposal(projectId, timelineRevision(projectId), {
    summary: "Recast the singer.", caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 },
    operations: [{ element_id: video.id, use_recast: { recast_source_url: media("generated/take.mp4"), source_window_start: 8.5, generation_id: "55555555-5555-4555-8555-555555555555", model: "H3 Max Recast" } }],
  });
  assert.throws(() => previewEditorAgentProposal(validateEditorAgentProposalAgainstProject(recast, 1, projectId)), /speed ramp/);
});
