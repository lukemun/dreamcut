import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { EFFECT_EVALS, EFFECTS_WITHOUT_EVAL, gradeEffectProposal } from "./effect-eval";
import { promotedRecipes } from "@/lib/effects/promoted-recipes";
import { timelineRevision, validateEditorAgentProposalAgainstProject } from "./timeline-editor-agent-apply";
import { createProject, writeTimeline } from "@/lib/local-store/store";
import { writePreparation } from "@/lib/local-store/media-preparation";
import { projectMediaDir } from "@/lib/local-store/paths";
import type { TimelineElement } from "@/components/studio/timeline/types";

process.env.TIMELINE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-editor-effect-eval-"));
const WALK = "22222222-2222-4222-8222-222222222222";
const SPEED_HOPS = "FX-SPEED-HOPS-TO-CAMERA";

function preparedVideo(projectId: string, source: string, duration: number, alpha = false) {
  const file = path.join(projectMediaDir(projectId), source);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "fixture video");
  fs.writeFileSync(file + ".preview.mp4", "fixture proxy");
  const stat = fs.statSync(file);
  writePreparation(projectId, { recipe: "editor-media-v1", source, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: source + ".preview.mp4", render: source, duration, alpha });
}

/** A locked-off walk with three stops, as the creator's marks and the prepared cut-outs leave it. */
function seed(projectId: string) {
  createProject(projectId, "web");
  preparedVideo(projectId, "sources/walk.mp4", 40);
  for (const [name, seconds] of [["stop-1", 3], ["stop-2", 3], ["stop-3", 6]] as const) preparedVideo(projectId, `cutouts/${name}.webm`, seconds, true);
  const now = "2026-10-28T00:00:00.000Z";
  const walk: TimelineElement = { id: WALK, project_id: projectId, type: "video_clip", source_url: `/api/projects/${projectId}/media/sources/walk.mp4`, props: {}, beat_id: null, character_id: null,
    timeline_start: 0, duration: 10, lane_key: "visual_0", lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now };
  writeTimeline(projectId, { elements: [walk], transitions: [] }, "fixture");
  return timelineRevision(projectId);
}

const whoosh = (name: string) => ({ source_url: `/api/sfx-catalog/media/licensed/tutorial-speed-sfx/${name}.wav`, source_duration_seconds: 0.42, peak_seconds: 0.06 });

function card(projectId: string, revision: string, inputs: Record<string, unknown>, settings: Record<string, unknown> = {}) {
  const media = `/api/projects/${projectId}/media`;
  return {
    schema_version: 2, project_id: projectId, expected_revision: revision, mode: "workshop", decision: "propose",
    summary: "You streak between your marks.", assumptions: [], unresolved_gaps: [],
    options: [{ id: "hops", label: "Speed hops", recommended: true, summary: "Speed hops between your marks.", operations: [], blocks: [{ block_id: "hops", kind: "hop_sequence", version: 1, settings, inputs: {
      source: { source_url: `${media}/sources/walk.mp4`, source_duration_seconds: 40 },
      empty_set: { source_url: `${media}/sources/walk.mp4`, source_duration_seconds: 40, source_start_seconds: 0 },
      stops: [
        { label: "Swings", cutout: { source_url: `${media}/cutouts/stop-1.webm`, source_duration_seconds: 3, source_offset_seconds: 4 }, subject: { cx: 0.25, cy: 0.5, h: 0.6 }, settle_seconds: 5, takeoff_seconds: 5.5 },
        { label: "Path bend", cutout: { source_url: `${media}/cutouts/stop-2.webm`, source_duration_seconds: 3, source_offset_seconds: 11 }, subject: { cx: 0.5, cy: 0.5, h: 0.5 }, settle_seconds: 12, takeoff_seconds: 12.4 },
        { label: "Lamp post", cutout: { source_url: `${media}/cutouts/stop-3.webm`, source_duration_seconds: 6, source_offset_seconds: 19 }, subject: { cx: 0.75, cy: 0.5, h: 0.4 }, settle_seconds: 20, takeoff_seconds: 21 },
      ],
      line_end_seconds: 24, lane_order_keys: ["visual_1", "visual_0"], remove_element_ids: [WALK], ...inputs,
    } }] }],
  };
}

const oneClick = { template: "speed_hops", sounds: { landings: [whoosh("04-arrival-whoosh-1"), whoosh("07-arrival-whoosh-2")], last_landing: whoosh("10-arrival-whoosh-3") } };

test("every shared effect has a one-click eval or a reason it has none, never both", () => {
  const shared = promotedRecipes.filter(effect => effect.implementation === "implemented").map(effect => effect.id);
  for (const id of shared) assert.ok((id in EFFECT_EVALS) !== (id in EFFECTS_WITHOUT_EVAL), `${id} needs a case in EFFECT_EVALS or a reason in EFFECTS_WITHOUT_EVAL`);
  for (const id of [...Object.keys(EFFECT_EVALS), ...Object.keys(EFFECTS_WITHOUT_EVAL)]) assert.ok(shared.includes(id), `${id} is not a shared effect`);
  // The allowance only shrinks.
  assert.ok(Object.keys(EFFECTS_WITHOUT_EVAL).length <= 9);
});

test("Speed hops: the one-click card passes", async () => {
  const projectId = "effect-eval-reference";
  const graded = await gradeEffectProposal(SPEED_HOPS, projectId, card(projectId, seed(projectId), oneClick));
  assert.deepEqual(graded.failures, []);
  assert.ok(graded.pass && graded.human_questions.length);
});

test("Speed hops: the cards this session actually staged fail, each for its own reason", async () => {
  const projectId = "effect-eval-known-bad";
  const revision = seed(projectId);
  const failed = async (proposal: unknown) => (await gradeEffectProposal(SPEED_HOPS, projectId, proposal)).failures.map(failure => failure.split(":")[0]);
  // The first card: the style passed by hand, no template, no sounds.
  assert.deepEqual(await failed(card(projectId, revision, {}, { variant: "mark_to_mark", streak_frames: [6, 6] })), ["template", "template_choices_left_alone", "sounds", "fixed_choices_hidden"]);
  // The template without its sounds.
  assert.deepEqual(await failed(card(projectId, revision, { template: "speed_hops" })), ["sounds"]);
  // A hand-built card: clips written out instead of compiled.
  const compiled = validateEditorAgentProposalAgainstProject(card(projectId, revision, oneClick), 512, projectId).options[0]!.operations;
  const handBuilt = card(projectId, revision, oneClick);
  Object.assign(handBuilt.options[0]!, { blocks: [], operations: compiled.map(({ block_ref: _ref, ...operation }) => operation) });
  assert.deepEqual(await failed(handBuilt), ["one_card"]);
  // A card that does not stage at all.
  assert.deepEqual(await failed({ ...card(projectId, revision, oneClick), expected_revision: "stale" }), ["stages"]);
});

test("Speed Entrance & Exit: a one-click card from still poses passes; the same card without its template or exit sound fails", async () => {
  const projectId = "effect-eval-entrance-poses";
  const revision = seed(projectId);
  for (const name of ["standing.png", "walking.png", "set.jpg"]) fs.writeFileSync(path.join(projectMediaDir(projectId), "sources", name), "fixture image");
  const media = `/api/projects/${projectId}/media/sources`;
  const sounds = { landings: [whoosh("04-arrival-whoosh-1")], exit: whoosh("03-takeoff-whoosh") };
  const poses = (inputs: Record<string, unknown>) => ({ ...card(projectId, revision, {}), options: [{ ...card(projectId, revision, {}).options[0]!, blocks: [{ block_id: "hops", kind: "hop_sequence", version: 1, settings: {}, inputs: {
    empty_set: { type: "still", source_url: `${media}/set.jpg` }, first_entrance: true, closing_exit: { style: "side" },
    stops: [{ label: "By the shelf", pose: { source_url: `${media}/standing.png`, moving_source_url: `${media}/walking.png` }, subject: { cx: 0.5, cy: 0.55, h: 0.6 } }],
    remove_element_ids: [WALK], lane_order_keys: ["visual_1", "visual_0"], ...inputs } }] }] });
  const graded = await gradeEffectProposal("FX-SPEED-ENTRANCE-EXIT", projectId, poses({ template: "entrance_exit", sounds }));
  assert.deepEqual(graded.failures, []);
  const failed = async (inputs: Record<string, unknown>) => (await gradeEffectProposal("FX-SPEED-ENTRANCE-EXIT", projectId, poses(inputs))).failures.map(failure => failure.split(":")[0]);
  assert.deepEqual(await failed({ sounds }), ["template", "fixed_choices_hidden"]);
  assert.deepEqual(await failed({ template: "entrance_exit", sounds: { landings: sounds.landings } }), ["sounds"]);
});

test("Flash effect: a one-click card passes; one without its clicks, or written out by hand, fails", async () => {
  const projectId = "effect-eval-flash";
  const revision = seed(projectId);
  const media = `/api/projects/${projectId}/media`;
  const click = { source_url: "/api/sfx-catalog/media/licensed/celfstudies/Camera_02_Shutter_Click.wav", source_duration_seconds: 0.177, peak_seconds: 0.075 };
  const flash = (inputs: Record<string, unknown>) => ({ ...card(projectId, revision, {}), options: [{ ...card(projectId, revision, {}).options[0]!, blocks: [{ block_id: "flash", kind: "flash_sequence", version: 1, settings: {}, inputs: {
    source: { source_url: `${media}/sources/walk.mp4`, source_duration_seconds: 40 },
    empty_set: { source_url: `${media}/sources/walk.mp4`, source_duration_seconds: 40, source_start_seconds: 0 },
    poses: [
      { label: "Swings", cutout: { source_url: `${media}/cutouts/stop-1.webm`, source_duration_seconds: 3, source_offset_seconds: 4 }, at_seconds: 5 },
      { label: "Path bend", cutout: { source_url: `${media}/cutouts/stop-2.webm`, source_duration_seconds: 3, source_offset_seconds: 11 }, at_seconds: 12 },
      { label: "Lamp post", cutout: { source_url: `${media}/cutouts/stop-3.webm`, source_duration_seconds: 6, source_offset_seconds: 19 }, at_seconds: 20 },
    ],
    line_end_seconds: 24, lane_order_keys: ["visual_1", "visual_0"], remove_element_ids: [WALK], ...inputs } }] }] });
  assert.deepEqual((await gradeEffectProposal("FX-FLASH-EFFECT", projectId, flash({ sound: click }))).failures, []);
  const failed = async (proposal: unknown) => (await gradeEffectProposal("FX-FLASH-EFFECT", projectId, proposal)).failures.map(failure => failure.split(":")[0]);
  assert.deepEqual(await failed(flash({})), ["sounds"]);
  const compiled = validateEditorAgentProposalAgainstProject(flash({ sound: click }), 512, projectId).options[0]!.operations;
  const handBuilt = flash({ sound: click });
  Object.assign(handBuilt.options[0]!, { blocks: [], operations: compiled.map(({ block_ref: _ref, ...operation }) => operation) });
  assert.deepEqual(await failed(handBuilt), ["one_card"]);
});
