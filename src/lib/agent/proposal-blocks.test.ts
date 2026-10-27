import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { blockElementId } from "./proposal-block-kit";
import { blockReviewChanges, compileBlock, listBlockDefinitions, resolveBlockSettings, setBlockSetting, validateBlockRanges } from "./proposal-blocks";
import { applyProposalNumericOverrides, applyProposalReviewOverrides } from "./proposal-overrides";
import { reviewOption } from "./proposal-review";
import { dialSweepValues } from "./proposal-dial-sweep";
import { proposalSliderCount } from "./proposal-control-budget";
import { proposalControlTier } from "./proposal-controls";
import { parseEditorAgentProposal, previewEditorAgentProposal, timelineRevision, validateEditorAgentProposalAgainstProject, type EditorAgentProposal } from "./timeline-editor-agent-apply";
import { createProject, readMetadata, readTimeline, restoreProjectHistorySnapshot, writeTimeline } from "@/lib/local-store/store";
import { readProposal, saveProposal } from "@/lib/local-store/proposals";
import { writePreparation } from "@/lib/local-store/media-preparation";
import { projectMediaDir } from "@/lib/local-store/paths";
import { POST as approveProposal } from "@/app/api/projects/[projectId]/timeline/proposals/[proposalId]/approve/route";
import { POST as previewProposal } from "@/app/api/projects/[projectId]/timeline/proposals/[proposalId]/preview/route";
import type { TimelineElement } from "@/components/studio/timeline/types";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-editor-proposal-blocks-"));
process.env.TIMELINE_PROJECTS_DIR = root;

const WALK = "11111111-1111-4111-8111-111111111111";

function element(id: string, overrides: Partial<TimelineElement> = {}): TimelineElement {
  const now = "2026-10-27T00:00:00.000Z";
  return {
    id, project_id: "fixture", type: "video_clip", source_url: "/api/projects/x/media/sources/walk.mp4",
    props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 10, lane_key: "visual_0",
    lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1,
    position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now,
    ...overrides,
  };
}

/** A prepared video the editor would let onto the timeline. */
function preparedVideo(projectId: string, source: string, duration: number, alpha = false) {
  const file = path.join(projectMediaDir(projectId), source);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "fixture video");
  const preview = source + ".preview.mp4";
  fs.writeFileSync(path.join(projectMediaDir(projectId), preview), "fixture proxy");
  const stat = fs.statSync(file);
  writePreparation(projectId, { recipe: "editor-media-v1", source, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview, render: source, duration, alpha });
}

/** A ZodError's message is JSON; read it as the agent does. */
const said = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/\\"/g, '"');

function seed(projectId: string) {
  createProject(projectId, "web");
  preparedVideo(projectId, "sources/walk.mp4", 40);
  preparedVideo(projectId, "cutouts/stop-1.webm", 3, true);
  preparedVideo(projectId, "cutouts/stop-2.webm", 3, true);
  preparedVideo(projectId, "cutouts/stop-3.webm", 6, true);
  writeTimeline(projectId, { elements: [element(WALK, { source_url: `/api/projects/${projectId}/media/sources/walk.mp4` })], transitions: [] }, "fixture");
  return timelineRevision(projectId);
}

/** Three stops on a locked-off take, the last with a spoken line. */
function hopInputs(projectId: string, extra: Record<string, unknown> = {}) {
  const media = `/api/projects/${projectId}/media`;
  return {
    source: { source_url: `${media}/sources/walk.mp4`, source_duration_seconds: 40 },
    empty_set: { source_url: `${media}/sources/walk.mp4`, source_duration_seconds: 40, source_start_seconds: 0 },
    stops: [
      { label: "Swings", cutout: { source_url: `${media}/cutouts/stop-1.webm`, source_duration_seconds: 3, source_offset_seconds: 4 }, subject: { cx: 0.25, cy: 0.5, h: 0.6 }, settle_seconds: 5, takeoff_seconds: 5.5 },
      { label: "Path bend", cutout: { source_url: `${media}/cutouts/stop-2.webm`, source_duration_seconds: 3, source_offset_seconds: 11 }, subject: { cx: 0.5, cy: 0.5, h: 0.5 }, settle_seconds: 12, takeoff_seconds: 12.4 },
      { label: "Lamp post", cutout: { source_url: `${media}/cutouts/stop-3.webm`, source_duration_seconds: 6, source_offset_seconds: 19 }, subject: { cx: 0.75, cy: 0.5, h: 0.4 }, settle_seconds: 20, takeoff_seconds: 21 },
    ],
    line_end_seconds: 24,
    lane_order_keys: ["visual_1", "visual_0"],
    remove_element_ids: [WALK],
    ...extra,
  };
}

function hopProposal(projectId: string, revision: string, settings: Record<string, unknown> = {}, inputs: Record<string, unknown> = {}) {
  return {
    schema_version: 2, project_id: projectId, expected_revision: revision, mode: "workshop", decision: "propose",
    summary: "You streak between your marks and land on the live footage at each one.", assumptions: [], unresolved_gaps: [],
    options: [{ id: "hops", label: "Out and in", recommended: true, summary: "Each stop plays live, then you streak off toward the next one and back in.",
      operations: [], blocks: [{ block_id: "hops", kind: "hop_sequence", version: 1, inputs: hopInputs(projectId, inputs), settings }] }],
  };
}

/** Live clips without their write times: what the creator sees, comparable across preview and Apply. */
const stripTimes = (elements: TimelineElement[]) => elements.filter(element => !element.removed_at).map(({ created_at: _c, updated_at: _u, removed_at: _r, props, ...rest }) => ({ ...rest,
  // The preview payload hydrates proxy receipts the stored timeline does not carry.
  props: props && Object.fromEntries(Object.entries(props).filter(([key]) => !key.startsWith("runtime_") && !key.endsWith("_proxy_validation"))) }));

test("every block setting declares its dial: unit, range, step, default, and an off position for motion", () => {
  const motion = new Set(["travel_percent", "blur_percent", "fade_percent", "empty_beat_frames"]);
  for (const definition of listBlockDefinitions()) {
    assert.match(definition.kind, /^[a-z_]+$/);
    assert.ok(definition.version >= 1 && definition.label && definition.description);
    for (const [name, setting] of Object.entries(definition.settings)) {
      assert.ok(setting.label, `${definition.kind}.${name} needs a label`);
      assert.ok(["main", "advanced"].includes(setting.tier));
      if (setting.kind === "number") {
        assert.ok(Number.isFinite(setting.min) && Number.isFinite(setting.max) && setting.min < setting.max, `${definition.kind}.${name} range`);
        assert.ok(setting.step > 0 && ["frames", "seconds", "percent", "factor"].includes(setting.unit), `${definition.kind}.${name} step and unit`);
        if (typeof setting.default === "number") assert.ok(setting.default >= setting.min && setting.default <= setting.max, `${definition.kind}.${name} default in range`);
        if (motion.has(name)) assert.ok(setting.off !== undefined && setting.off >= setting.min && setting.off <= setting.max, `${definition.kind}.${name} needs an off position`);
      } else {
        assert.ok(setting.choices.length >= 2);
        if (typeof setting.default === "string") assert.ok(setting.choices.some(choice => choice.value === setting.default), `${definition.kind}.${name} default choice`);
      }
    }
  }
});

test("a hop sequence compiles to frame-aligned clips with stable ids and no raw operations from the agent", () => {
  const projectId = "blocks-compile";
  const revision = seed(projectId);
  const proposal = validateEditorAgentProposalAgainstProject(hopProposal(projectId, revision), 512, projectId);
  const option = proposal.options[0]!;
  assert.ok(option.blocks?.length === 1 && option.blocks[0]!.seed && option.blocks[0]!.frame_rate === 30);
  assert.ok(option.operations.length > 8);
  assert.ok(option.operations.every(operation => operation.block_ref?.block_id === "hops"));
  // lane order, the removed walk, the empty set, then holds and streaks in time order.
  assert.deepEqual(option.operations.slice(0, 3).map(operation => operation.block_ref!.role), ["lane_order", "remove", "empty_set"]);
  const clips = option.operations.filter(operation => operation.create_visual && operation.block_ref!.role !== "empty_set").map(operation => operation.create_visual!);
  for (const clip of clips) assert.ok(Math.abs(clip.timeline_start * 30 - Math.round(clip.timeline_start * 30)) < 1e-9, `${clip.title} starts on a frame (${clip.timeline_start})`);
  for (let index = 1; index < clips.length; index++) {
    const previous = clips[index - 1]!;
    const previousEnd = previous.timeline_start + (previous.source_end_seconds! - previous.source_start_seconds!) / (previous.playback_rate ?? 1);
    assert.ok(clips[index]!.timeline_start >= previousEnd - 1e-6, `${clips[index]!.title} does not overlap ${previous.title}`);
  }
  // The streak's last key sits on its last frame; its blur is sized to the subject.
  const exit = option.operations.find(operation => operation.block_ref!.role === "exit")!.create_visual!;
  assert.deepEqual(exit.transition_keyframes!.media_offset_x!.map(key => key.t), [0, 2 / 30]);
  assert.equal(exit.directional_blur_x, Math.round(0.08 * 0.6 * 1080 * 1e6) / 1e6);
  // The same card re-parsed from its stored form compiles the same operations and ids.
  const again = parseEditorAgentProposal(JSON.parse(JSON.stringify(proposal)));
  assert.deepEqual(JSON.parse(JSON.stringify(again.options[0]!.operations)), JSON.parse(JSON.stringify(option.operations)));
  assert.equal(option.operations[3]!.element_id, blockElementId({ seed: option.blocks![0]!.seed!, block_id: "hops" }, "hold", 0));
  // The last stop plays live with sound to the end of the line.
  const line = option.operations.find(operation => operation.block_ref!.role === "line")!.create_visual!;
  assert.equal(line.volume, 1);
  assert.equal(line.source_end_seconds, 24);
});

test("block settings are the card's dials, within the slider budget, and compiled clips offer none of their own", () => {
  const projectId = "blocks-dials";
  const revision = seed(projectId);
  const proposal = validateEditorAgentProposalAgainstProject(hopProposal(projectId, revision), 512, projectId);
  const option = proposal.options[0]!;
  const review = reviewOption(readTimeline(projectId), option);
  assert.ok(review.adjustment_rows.length && review.adjustment_rows.every(row => row.element_id.startsWith("block:hops")), "clips compiled from the block are not tuned field by field");
  const changes = review.adjustment_rows.flatMap(row => row.changes);
  const fields = changes.map(change => change.field);
  assert.deepEqual(fields.filter(field => field.startsWith("hold_seconds")), ["hold_seconds.0", "hold_seconds.1"], "a closing line fixes the last stop's hold");
  assert.deepEqual(fields.filter(field => field.startsWith("direction")), ["direction.0", "direction.1"]);
  const tiers = Object.fromEntries(changes.map(change => [change.field, proposalControlTier(change, option.review_controls)]));
  assert.equal(tiers.variant, "main"); assert.equal(tiers["blur_percent.1"], "main"); assert.equal(tiers["hold_seconds.1"], "main");
  assert.equal(tiers.fade_percent, "advanced"); assert.equal(tiers.ease, "advanced"); assert.equal(tiers.speed_at_stops, "advanced");
  assert.equal(tiers["direction.0"], "main"); assert.equal(tiers["direction.1"], "advanced");
  assert.deepEqual(changes.find(change => change.field === "streak_frames.0")!.control_display, { step: 1, suffix: "frames" });
  assert.ok(proposalSliderCount(readTimeline(projectId), option) <= 15);
  assert.equal(proposalSliderCount(readTimeline(projectId), option), 8);
  // Dials read in time order under headings: what every hop shares, the opening hold, then each hop with the hold that follows it.
  const sections: string[] = [];
  for (const change of changes) if (change.section && !sections.includes(change.section)) sections.push(change.section);
  assert.deepEqual(sections, ["Every hop", "Opening at Swings", "Swings → Path bend", "Path bend → Lamp post"]);
  const under = (section: string) => changes.filter(change => change.section === section).map(change => change.field);
  assert.deepEqual(under("Every hop"), ["variant", "travel_percent", "empty_beat_frames", "speed_at_stops", "fade_percent", "ease"]);
  assert.deepEqual(under("Opening at Swings"), ["hold_seconds.0"]);
  assert.deepEqual(under("Swings → Path bend"), ["streak_frames.0", "blur_percent.0", "direction.0", "hold_seconds.1"]);
  assert.deepEqual(under("Path bend → Lamp post"), ["streak_frames.1", "blur_percent.1", "direction.1"]);
  assert.deepEqual(changes.filter(change => change.section === "Swings → Path bend").map(change => change.label), ["Streak length", "Blur", "Leaves toward", "Hold"]);
});

test("preview equals apply at the defaults, at every setting's extremes and after reset", async () => {
  const projectId = "blocks-parity";
  const revision = seed(projectId);
  const base = readTimeline(projectId);
  const proposal = validateEditorAgentProposalAgainstProject(hopProposal(projectId, revision), 512, projectId);
  const option = proposal.options[0]!;
  const review = reviewOption(base, option);
  const changes = review.adjustment_rows.flatMap(row => row.changes);
  assert.ok(changes.length > 10);
  const derive = (candidate: EditorAgentProposal) => stripTimes(previewEditorAgentProposal(candidate, "hops", base).timeline.elements);
  const authored = derive(proposal);
  let moved = 0;
  for (const change of changes) {
    const values: (number | string)[] = typeof change.after_value === "number" ? dialSweepValues(change, review) : (change.control_choices ?? []).map(choice => choice.value);
    assert.ok(values.length >= 2, `${change.field} offers both ends`);
    for (const value of values) {
      const tuned = applyProposalReviewOverrides(proposal, "hops", [{ operation_index: change.operation_index, target: "block", block_id: "hops", field: change.field, value }], base);
      // Tuning re-parsed from storage derives the same result: preview, review and Apply share one path.
      const stored = parseEditorAgentProposal(JSON.parse(JSON.stringify(tuned)));
      assert.deepEqual(derive(stored), derive(tuned), `${change.field} at ${value}`);
      assert.equal(tuned.options[0]!.operations.length, option.operations.length, `${change.field} at ${value} keeps the clip count`);
      if (JSON.stringify(derive(tuned)) !== JSON.stringify(authored)) moved++;
    }
  }
  assert.ok(moved >= changes.length, "every dial changes the derived timeline at one end at least");
  assert.deepEqual(applyProposalReviewOverrides(proposal, "hops", [], base), proposal);
  // A tuned value survives the round trip and a reset returns to the authored default.
  const tuned = applyProposalReviewOverrides(proposal, "hops", [{ operation_index: 0, target: "block", field: "travel_percent", value: 60 }], base);
  assert.equal(tuned.options[0]!.blocks![0]!.settings.travel_percent, 60);
  assert.notDeepEqual(derive(tuned), authored);
  assert.deepEqual(derive(applyProposalReviewOverrides(tuned, "hops", [{ operation_index: 0, target: "block", field: "travel_percent", value: 15 }], base)), authored);
});

test("approval writes what the preview showed and Undo restores the timeline, lane order and review state together", async () => {
  const projectId = "blocks-undo";
  const revision = seed(projectId);
  const beforeTimeline = readTimeline(projectId);
  const beforeLanes = readMetadata(projectId).lane_order_keys;
  const proposal = validateEditorAgentProposalAgainstProject(hopProposal(projectId, revision), 512, projectId);
  const record = saveProposal(projectId, proposal);
  const context = { params: Promise.resolve({ projectId, proposalId: record.proposal_id }) };
  const overrides = [{ operation_index: 0, target: "block", block_id: "hops", field: "hold_seconds.0", value: 1.2 }, { operation_index: 0, target: "block", field: "variant", value: "mark_to_mark" }];
  const request = (action: string) => new Request(`http://localhost/api/projects/${projectId}/timeline/proposals/${record.proposal_id}/${action}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ option_id: "hops", overrides }),
  });
  const previewResponse = await previewProposal(request("preview"), context);
  const preview = await previewResponse.json();
  assert.equal(previewResponse.status, 200, JSON.stringify(preview));
  assert.deepEqual(readTimeline(projectId).elements, beforeTimeline.elements, "preview writes nothing");
  const approvedResponse = await approveProposal(request("approve"), context);
  const approved = await approvedResponse.json();
  assert.equal(approvedResponse.status, 200, JSON.stringify(approved));
  const applied = readTimeline(projectId);
  assert.deepEqual(stripTimes(applied.elements), stripTimes(preview.timeline.elements));
  const hold = applied.elements.find(item => (item.props as { block_ref?: { role: string; index: number } })?.block_ref?.role === "hold" && (item.props as { block_ref: { index: number } }).block_ref.index === 0)!;
  assert.ok(hold, "applied clips remember their block role");
  assert.equal(Math.round(hold.duration * 30), 36);
  assert.deepEqual(readMetadata(projectId).lane_order_keys, ["visual_1", "visual_0"]);
  assert.equal(readProposal(projectId, record.proposal_id).status, "approved");
  restoreProjectHistorySnapshot(projectId, approved.history.before.id, "history_restore_undo");
  assert.deepEqual(stripTimes(readTimeline(projectId).elements), stripTimes(beforeTimeline.elements));
  assert.deepEqual(readMetadata(projectId).lane_order_keys, beforeLanes);
  assert.equal(readProposal(projectId, record.proposal_id).status, "pending");
  restoreProjectHistorySnapshot(projectId, approved.history.after.id, "history_restore_redo");
  assert.deepEqual(stripTimes(readTimeline(projectId).elements), stripTimes(preview.timeline.elements));
});

test("refusals name the block, the setting and the value, never an operation index", () => {
  const projectId = "blocks-refusals";
  const revision = seed(projectId);
  // A hold whose maximum reaches before the footage starts: the range cannot compile.
  const inputs = hopInputs(projectId);
  (inputs.stops[0] as { settle_seconds: number; takeoff_seconds: number }).settle_seconds = 1.5;
  (inputs.stops[0] as { settle_seconds: number; takeoff_seconds: number }).takeoff_seconds = 2;
  (inputs.stops[0] as { cutout: { source_offset_seconds: number } }).cutout.source_offset_seconds = 1;
  assert.throws(() => validateEditorAgentProposalAgainstProject(hopProposal(projectId, revision, {}, inputs), 512, projectId),
    (error: Error) => /Block "hops" setting "Hold" in "Opening at Swings" \(hold_seconds\.0\) at 3s cannot compile/.test(said(error)) && !/operation \d/.test(said(error)));
  // Stops are named by what the creator can see, never by a mark number they may have cleared.
  assert.throws(() => validateEditorAgentProposalAgainstProject(hopProposal(projectId, revision, {}, { stops: hopInputs(projectId).stops.map((stop, index) => index === 1 ? { ...stop, label: "Mark 3" } : stop) }), 512, projectId),
    (error: Error) => /name the stop by a place the creator can see, not a mark number/.test(said(error)));
  // An authored value outside the advertised range.
  assert.throws(() => validateEditorAgentProposalAgainstProject(hopProposal(projectId, revision, { travel_percent: 400 }), 512, projectId),
    (error: Error) => /Block "hops" setting "Travel" \(travel_percent\) at 400% is outside 0 to 150%/.test(said(error)));
  assert.throws(() => validateEditorAgentProposalAgainstProject(hopProposal(projectId, revision, { variant: "sideways" }), 512, projectId),
    (error: Error) => /setting "Variant" \(variant\) must be one of out_and_in, mark_to_mark/.test(said(error)));
  assert.throws(() => validateEditorAgentProposalAgainstProject(hopProposal(projectId, revision, { hold_seconds: 2 }), 512, projectId),
    (error: Error) => /is set per hold: send an array/.test(said(error)));
  assert.throws(() => validateEditorAgentProposalAgainstProject(hopProposal(projectId, revision, { streaks: 3 }), 512, projectId),
    (error: Error) => /has no setting "streaks"; its settings are variant, streak_frames/.test(said(error)));
  // A block that does not exist, and a cut-out too short for its streak.
  const draft = hopProposal(projectId, revision);
  (draft.options[0]!.blocks[0] as { kind: string }).kind = "teleport";
  assert.throws(() => validateEditorAgentProposalAgainstProject(draft, 512, projectId), (error: Error) => /teleport@1, which is not a registered block/.test(said(error)));
  const short = hopInputs(projectId);
  (short.stops[1] as { cutout: { source_duration_seconds: number } }).cutout.source_duration_seconds = 1.2;
  assert.throws(() => validateEditorAgentProposalAgainstProject(hopProposal(projectId, revision, {}, short), 512, projectId), (error: Error) => /Path bend (exit|entrance) needs cut-out frames/.test(said(error)));
  // Tuning: a compiled clip's own field cannot be dialled; the block's setting can.
  const proposal = validateEditorAgentProposalAgainstProject(hopProposal(projectId, revision), 512, projectId);
  const option = proposal.options[0]!;
  assert.throws(() => applyProposalNumericOverrides(option, [{ operation_index: 3, target: "create_visual", field: "volume", value: 1 }]), /Tune the "hops" block's settings/);
  assert.throws(() => applyProposalNumericOverrides(option, [{ operation_index: 0, target: "block", field: "blur_percent.0", value: 101 }]), /\(blur_percent\.0\) at 101% is outside 0 to 100%/);
  assert.throws(() => applyProposalNumericOverrides(option, [{ operation_index: 0, target: "block", block_id: "other", field: "blur_percent.0", value: 10 }]), /block other does not exist/);
  assert.throws(() => applyProposalNumericOverrides(option, [{ operation_index: 0, target: "block", field: "blur_percent.0", value: 10 }, { operation_index: 0, target: "block", field: "blur_percent.0", value: 20 }]), /Duplicate proposal override/);
});

test("raw operations sent as an operations@1 block are the option's operations", () => {
  const projectId = "blocks-operations";
  const revision = seed(projectId);
  const draft = hopProposal(projectId, revision);
  draft.options[0]!.blocks = [{ block_id: "cut", kind: "operations", version: 1, inputs: { operations: [{ element_id: WALK, patch: { duration: 6 } }] }, settings: {} }];
  const proposal = validateEditorAgentProposalAgainstProject(draft, 512, projectId);
  assert.equal(proposal.options[0]!.blocks, undefined);
  assert.deepEqual(JSON.parse(JSON.stringify(proposal.options[0]!.operations)), [{ element_id: WALK, patch: { duration: 6 } }]);
  assert.equal(proposal.options[0]!.requested_mutations, 1);
});

test("live_hold and keyframed_move stand alone and share the sequence's arithmetic", () => {
  const projectId = "blocks-standalone";
  const media = `/api/projects/${projectId}/media`;
  const hold = { block_id: "hold", kind: "live_hold", version: 1, seed: "s", frame_rate: 30, settings: {},
    inputs: { source: { source_url: `${media}/sources/walk.mp4`, source_duration_seconds: 40 }, lane: { lane_key: "visual_1", lane_index: 1 }, timeline_start: 1.013, settle_seconds: 5, takeoff_seconds: 5.5 } };
  const [holdOp] = compileBlock(hold);
  assert.equal(holdOp!.block_ref.role, "hold");
  const visual = holdOp!.create_visual as { timeline_start: number; source_start_seconds: number; source_end_seconds: number; playback_rate: number };
  assert.equal(visual.timeline_start, 1.013);
  assert.equal(visual.source_start_seconds, 5); assert.equal(visual.source_end_seconds, 5.5); assert.equal(visual.playback_rate, 1);
  const slow = compileBlock(setBlockSetting(setBlockSetting(hold, "speed", 0.5), "hold_seconds", 1))[0]!.create_visual as typeof visual;
  assert.equal(slow.source_start_seconds, 5); assert.equal(slow.playback_rate, 0.5);
  validateBlockRanges(hold);
  assert.deepEqual(resolveBlockSettings(hold).map(item => [item.field, item.value, item.range.max]), [["hold_seconds", 0.5, 3], ["speed", 1, 1]]);
  const move = { block_id: "streak", kind: "keyframed_move", version: 1, seed: "s", frame_rate: 25, settings: { frames: 4 },
    inputs: { cutout: { source_url: `${media}/cutouts/a.webm`, source_duration_seconds: 2, source_offset_seconds: 5 }, lane: { lane_key: "visual_1", lane_index: 1 }, timeline_start: 0,
      source_start_seconds: 5.5, subject_height: 0.5, to: { scale: 1, offset_x: 0.8, offset_y: 0 }, far_end: "end" } };
  const streak = compileBlock(move)[0]!.create_visual as { source_start_seconds: number; source_end_seconds: number; directional_blur_x: number; transition_keyframes: Record<string, { t: number; v: number; ease?: string }[]> };
  assert.equal(streak.source_start_seconds, 0.5); assert.equal(streak.source_end_seconds, 0.66);
  assert.deepEqual(streak.transition_keyframes.media_offset_x, [{ t: 0, v: 0, ease: "easeIn" }, { t: 0.12, v: 0.8 }]);
  assert.deepEqual(streak.transition_keyframes.media_opacity.map(key => key.v), [1, 0.4]);
  // A stop may hand its exit to a second, shorter cut-out.
  const split = compileBlock({ block_id: "hops", kind: "hop_sequence", version: 1, seed: "s", frame_rate: 30, settings: {}, inputs: { ...hopInputs("p"),
    stops: hopInputs("p").stops.map((stop, index) => index === 0 ? { ...stop, exit_cutout: { source_url: `${media}/cutouts/exit.webm`, source_duration_seconds: 1, source_offset_seconds: 5.4 } } : stop) } });
  assert.equal((split.find(operation => operation.block_ref.role === "exit")!.create_visual as { source_url: string }).source_url, `${media}/cutouts/exit.webm`);
  assert.equal(streak.directional_blur_x, 43.2);
  const still = compileBlock(setBlockSetting(move, "travel_percent", 0))[0]!.create_visual as typeof streak;
  assert.deepEqual(still.transition_keyframes.media_offset_x.map(key => key.v), [0, 0]);
  assert.equal(blockReviewChanges(move, 0).find(change => change.field === "ease")!.after, "Natural");
  assert.throws(() => setBlockSetting(move, "frames", 1), /\(frames\) at 1frames is outside 2 to 12frames/);
});
