import assert from "node:assert/strict";
import test from "node:test";
import { deriveProposalTimeline, editorAgentOptionSchema, parseEditorAgentProposal, timelineRevision } from "./timeline-editor-agent-apply";
import { applyProposalNumericOverrides, type ProposalNumericOverride } from "./proposal-overrides";
import { reviewOption } from "./proposal-review";
import { proposalDialResetIssue, proposalDialSlider } from "./proposal-dial-range";
import { assertCoverageConstraints, coverageInputError, coverageWindowSeconds } from "./proposal-coverage";
import type { TimelineFile } from "../local-store/store";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { projectMediaDir } from "../local-store/paths";
import { writePreparation } from "../local-store/media-preparation";
import { createProject, readTimeline, writeTimeline } from "../local-store/store";
import { saveProposal } from "../local-store/proposals";
import { readProposalTuning } from "../local-store/proposal-tuning";
import { POST as batchPreview } from "@/app/api/projects/[projectId]/timeline/proposals/batch/preview/route";
import { POST as singlePreview } from "@/app/api/projects/[projectId]/timeline/proposals/[proposalId]/preview/route";
import { PUT as saveTuning } from "@/app/api/projects/[projectId]/timeline/proposals/[proposalId]/tuning/route";

process.env.TIMELINE_PROJECTS_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "proposal-coverage-"));

const overlay = "00000000-0000-4000-8000-000000000001";
const hero = "00000000-0000-4000-8000-000000000002";
const raw = {
  id: "light", label: "A light appears beside you", summary: "A light grows beside you.", recommended: true,
  operations: [
    {element_id: overlay, create_visual: {type: "video_clip", source_url: "/api/projects/fixture/media/light.mp4", source_duration_seconds: 10.01,
      source_start_seconds: 0, source_end_seconds: 2.65, playback_rate: .5, timeline_start: 2.3, lane_key: "visual_1", lane_index: 1, volume: 0, media_blend_mode: "screen"}},
    {element_id: hero, patch: {timeline_start: 0, duration: 7.6, trim_start: 0, trim_end: 3}},
  ],
  timing_controls: [{id: "lead", kind: "hold", reference_seconds: 2.3, spacing_seconds: 2.3, min_spacing_seconds: 1.8, max_spacing_seconds: 2.8, bindings: [
    {operation_index: 0, target: "create_visual", field: "timeline_start", offset_seconds: 2.3, spacing_multiplier: 1},
    {operation_index: 1, target: "patch", field: "duration", offset_seconds: 7.6, spacing_multiplier: 1,
      source_tail: {source_duration_seconds: 10.6, trim_start: 0, playback_rate: 1}},
  ]}],
  coverage_constraints: [{operation_index: 0, covered_by_operation_index: 1}],
};
const tune = (field: string, value: number): ProposalNumericOverride => ({operation_index: 0, target: "create_visual", field, value});
const lead = (value: number): ProposalNumericOverride => ({operation_index: 0, target: "timing_control", field: "spacing_seconds", value});
const timeline = {schema_version: 1, elements: [], transitions: []};

test("explicit coverage rejects the actual 12.9s overlay / 7.6s background tail; independent overlays retain it", () => {
  const option = editorAgentOptionSchema.parse(raw);
  assert.throws(() => applyProposalNumericOverrides(option, [tune("source_end_seconds", 5.3)]), /Shorten the overlay or increase Speed/);
  const invalidSaved = structuredClone(option);
  invalidSaved.operations[0].create_visual!.source_end_seconds = 5.3;
  assert.throws(() => assertCoverageConstraints(invalidSaved), /Shorten the overlay or increase Speed/);
  const independent = editorAgentOptionSchema.parse({...raw, coverage_constraints: undefined});
  const result = applyProposalNumericOverrides(independent, [tune("source_end_seconds", 5.3)]);
  const video = result.operations[0].create_visual!;
  assert.ok(Math.abs(video.timeline_start + (video.source_end_seconds! - video.source_start_seconds!) / video.playback_rate! - 12.9) < 1e-7);
  assert.equal(result.operations[1].patch!.duration, 7.6);
});

test("all legal lead values preserve coverage and source handles; combined source/rate edits are order-independent", () => {
  const option = editorAgentOptionSchema.parse(raw);
  const before = JSON.stringify(option);
  for (let n = 180; n <= 280; n++) {
    for (const source of [[], [tune("source_end_seconds", 5.3), tune("playback_rate", 1)],
      [tune("source_start_seconds", 1), tune("source_end_seconds", 10.01), tune("playback_rate", 2)]]) {
      const overrides = [lead(n / 100), ...source];
      const result = applyProposalNumericOverrides(option, overrides);
      assert.deepEqual(result, applyProposalNumericOverrides(option, overrides.toReversed()));
      const video = result.operations[0].create_visual!, background = result.operations[1].patch!;
      const end = video.timeline_start + (video.source_end_seconds! - video.source_start_seconds!) / video.playback_rate!;
      assert.ok(end <= background.timeline_start! + background.duration! + 1e-7);
      assert.ok(background.trim_end! >= 0);
      assert.ok(Math.abs(background.duration! + background.trim_end! - 10.6) < 1e-7);
    }
  }
  assert.equal(JSON.stringify(option), before, "read-only derivations preserve the authored option");
  assert.deepEqual(applyProposalNumericOverrides(option, []), option, "reset returns authored settings and constraint");
  assert.deepEqual(editorAgentOptionSchema.parse(JSON.parse(JSON.stringify(option))), option, "saved option keeps the explicit relation");
  assert.throws(() => applyProposalNumericOverrides(option, [tune("source_end_seconds", 10.02), tune("playback_rate", 2)]));
});

test("coverage uses correlated holds and refuses a draft that works only at the authored lead", () => {
  const option = editorAgentOptionSchema.parse(raw);
  assert.ok(Math.abs(coverageWindowSeconds(option, option.coverage_constraints![0]) - 5.3) < 1e-7);
  const asymmetric = structuredClone(raw);
  asymmetric.timing_controls[0].bindings[1].spacing_multiplier = 0;
  assert.equal(editorAgentOptionSchema.safeParse(asymmetric).success, false, "late lead would expose a tail");
  asymmetric.operations[0].create_visual!.source_end_seconds = 2.4;
  const bounded = editorAgentOptionSchema.parse(asymmetric);
  assert.ok(Math.abs(coverageWindowSeconds(bounded, bounded.coverage_constraints![0]) - 4.8) < 1e-7);
  assert.throws(() => applyProposalNumericOverrides(bounded, [tune("source_end_seconds", 2.41)]), /throughout the Lead-in range/);
});

test("shared slider limits retain source trims/rate and expand safely for faster combined edits", () => {
  const option = editorAgentOptionSchema.parse(raw);
  const review = reviewOption(timeline, option);
  const fields = review.adjustment_rows.flatMap(row => row.changes).filter(change => change.target === "create_visual");
  const out = fields.find(change => change.field === "source_end_seconds")!;
  const start = fields.find(change => change.field === "source_start_seconds")!;
  const speed = fields.find(change => change.field === "playback_rate")!;
  assert.ok(out && start && speed, "do not hide independent source controls");
  assert.equal(proposalDialSlider(review, out, () => undefined)!.spec.max, 2.65);
  const faster = (binding: {field: string}) => binding.field === "playback_rate" ? 1 : undefined;
  assert.equal(proposalDialSlider(review, out, faster)!.spec.max, 5.3);
  const longer = (binding: {field: string}) => binding.field === "source_end_seconds" ? 5.3 : undefined;
  assert.equal(proposalDialSlider(review, speed, longer)!.spec.min, 1);
  assert.ok(proposalDialSlider(review, start, longer)!.spec.min >= 2.65 - 1e-7);
});

test("coverage references and source-tail ownership are explicit, bounded and non-duplicated", () => {
  for (const relation of [{operation_index: 0, covered_by_operation_index: 0}, {operation_index: 0, covered_by_operation_index: 9}]) {
    assert.equal(editorAgentOptionSchema.safeParse({...raw, coverage_constraints: [relation]}).success, false);
  }
  assert.equal(editorAgentOptionSchema.safeParse({...raw, coverage_constraints: [raw.coverage_constraints[0], raw.coverage_constraints[0]]}).success, false);
  assert.equal(editorAgentOptionSchema.safeParse({...raw, timing_controls: undefined}).success, false);
});

test("combined coverage resets explain the dependency and preserve other tuned source values", () => {
  const review = reviewOption(timeline, editorAgentOptionSchema.parse(raw));
  const fields = review.adjustment_rows.flatMap(row => row.changes);
  const field = (name: string) => fields.find(change => change.field === name)!;
  const values = new Map<string, number>([["source_end_seconds", 5.3], ["playback_rate", 1]]);
  const valueFor = (binding: {field: string}) => values.get(binding.field);
  assert.match(proposalDialResetIssue(review, field("playback_rate"), valueFor)!, /before resetting Speed/);
  assert.equal(proposalDialResetIssue(review, field("source_end_seconds"), valueFor), undefined);
  assert.deepEqual([...values], [["source_end_seconds", 5.3], ["playback_rate", 1]], "checking Reset never resets a sibling");
  values.delete("source_end_seconds");
  assert.equal(proposalDialResetIssue(review, field("playback_rate"), valueFor), undefined, "reset Source out, then Speed is safe");
  values.set("source_start_seconds", 2.65); values.set("source_end_seconds", 5.3); values.set("playback_rate", .5);
  assert.match(proposalDialResetIssue(review, field("source_start_seconds"), valueFor)!, /before resetting Source in/);
  assert.equal(proposalDialResetIssue(review, field("source_end_seconds"), valueFor), "Move Source in earlier before resetting Source out.", "Speed cannot repair an empty source interval");
  const authoredLong = structuredClone(raw);
  authoredLong.operations[0].create_visual!.source_end_seconds = 5.3;
  authoredLong.operations[0].create_visual!.playback_rate = 1;
  const longReview = reviewOption(timeline, editorAgentOptionSchema.parse(authoredLong));
  const longOut = longReview.adjustment_rows.flatMap(row => row.changes).find(change => change.field === "source_end_seconds")!;
  assert.equal(proposalDialResetIssue(longReview, longOut, b => b.field === "source_end_seconds" ? 2.65 : b.field === "playback_rate" ? .5 : undefined), "Increase Speed before resetting Source out.", "Valid interval ordering with excessive duration needs the speed advice");
  const independent = {...field("playback_rate"), control_coverage_seconds: undefined};
  assert.equal(proposalDialResetIssue(review, independent, valueFor), undefined, "unconstrained reset behavior is unchanged");
});

test("actual preview and tuning routes return coverage INVALID_INPUT as400 without changing saved state", async () => {
  const projectId = "coverage-http-status";
  createProject(projectId, "web");
  const base: TimelineFile = {elements: [{id: hero, project_id: projectId, type: "video_clip", source_url: `/api/projects/${projectId}/media/hero.mp4`,
    timeline_start: 0, duration: 7.6, trim_start: 0, trim_end: 3, playback_rate: 1, volume: 1,
    lane_key: "visual_0", lane_index: 0, props: {source_duration_seconds: 10.6}, removed_at: null}] as TimelineFile["elements"], transitions: []};
  writeTimeline(projectId, base, "fixture");
  const option = structuredClone(raw);
  option.operations[0].create_visual!.source_url = `/api/projects/${projectId}/media/light.mp4`;
  const proposal = parseEditorAgentProposal({schema_version: 2, project_id: projectId, expected_revision: timelineRevision(projectId),
    mode: "workshop", decision: "propose", summary: "Keep the light over the scene.", assumptions: [], unresolved_gaps: [],
    caps: {max_mutations: 50, max_renders: 0}, options: [option]});
  const record = saveProposal(projectId, proposal);
  const before = JSON.stringify(readTimeline(projectId));
  const overrides = [tune("source_end_seconds", 5.3)];
  try { applyProposalNumericOverrides(proposal.options[0], overrides); assert.fail("invalid coverage must refuse"); }
  catch (error) { assert.ok(coverageInputError(error), JSON.stringify({name: (error as Error).name, keys: Object.keys(error as object)})); }
  const params = Promise.resolve({projectId, proposalId: record.proposal_id});
  const request = (method: string, body: unknown) => new Request("http://localhost/api/coverage-test", {method,
    headers: {"content-type": "application/json"}, body: JSON.stringify(body)});
  const responses = [
    await batchPreview(request("POST", {selections: [{proposal_id: record.proposal_id, option_id: "light", overrides}]}), {params}),
    await singlePreview(request("POST", {option_id: "light", overrides}), {params}),
    await saveTuning(request("PUT", {option_id: "light", overrides}), {params}),
  ];
  for (const [index, response] of responses.entries()) {
    const body = await response.json();
    assert.equal(response.status, 400, `${["batch", "single", "tuning"][index]}: ${JSON.stringify(body)}`);
    assert.equal(body.code, "INVALID_INPUT");
    assert.match(body.error, /Shorten the overlay or increase Speed/);
    assert.deepEqual(body.issues[0].path, ["coverage_constraints", 0]);
  }
  assert.equal(JSON.stringify(readTimeline(projectId)), before);
  assert.deepEqual(readProposalTuning(projectId, record.proposal_id), {});
  assert.equal(coverageInputError(new Error("unrelated service failure")), undefined, "unrelated failure classification is untouched");
});

test("native derived output frames retain the background under every allowed overlay frame", () => {
  const file = path.join(projectMediaDir("fixture"), "light.mp4");
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, "prepared contract fixture");
  const stat = fs.statSync(file);
  writePreparation("fixture", {recipe: "editor-media-v1", source: "light.mp4", size: stat.size, mtime: stat.mtimeMs,
    state: "ready", preview: "light.mp4", render: "light.mp4", duration: 10.01, alpha: false});
  const base: TimelineFile = {elements: [{id: hero, project_id: "fixture", type: "video_clip", source_url: "/api/projects/fixture/media/hero.mp4",
    timeline_start: 0, duration: 7.6, trim_start: 0, trim_end: 3, playback_rate: 1, volume: 1,
    lane_key: "visual_0", lane_index: 0, props: {source_duration_seconds: 10.6}, removed_at: null}] as TimelineFile["elements"], transitions: []};
  const option = editorAgentOptionSchema.parse(raw);
  for (const seconds of [1.8, 2.3, 2.8]) for (const rate of [.5, .75, 1, 2, 100]) {
    const sourceEnd = Math.min(10.01, 5.3 * rate);
    const tuned = applyProposalNumericOverrides(option, [lead(seconds), tune("playback_rate", rate), tune("source_end_seconds", sourceEnd)]);
    const derived = deriveProposalTimeline(base, tuned.operations, "fixture").timeline;
    const light = derived.elements.find(element => element.id === overlay)!;
    const background = derived.elements.find(element => element.id === hero)!;
    const endFrame = Math.round((light.timeline_start + light.duration) * 30);
    for (let frame = Math.round(light.timeline_start * 30); frame < endFrame; frame++) {
      assert.ok(frame / 30 >= background.timeline_start - 1e-7 && frame / 30 < background.timeline_start + background.duration - 1e-7,
        `missing background at frame${frame}, lead${seconds},rate${rate}`);
    }
    assert.equal(background.playback_rate, 1);
    assert.equal(background.trim_start, 0);
    assert.ok(Math.abs(background.duration + background.trim_end! - 10.6) < 1e-7);
  }
});


test("coverage reserves the trailing held frame in validation and source/speed dials", () => {
  const invalid=structuredClone(raw);Object.assign(invalid.operations[0].create_visual!,{trailing_hold_seconds:1});
  assert.equal(editorAgentOptionSchema.safeParse(invalid).success,false);
  const valid=structuredClone(invalid);valid.operations[0].create_visual!.source_end_seconds=2.15;
  const option=editorAgentOptionSchema.parse(valid);
  assert.ok(Math.abs(coverageWindowSeconds(option,option.coverage_constraints![0])-4.3)<1e-7);
  const review=reviewOption(timeline,option);
  const out=review.adjustment_rows.flatMap(row=>row.changes).find(change=>change.target==="create_visual"&&change.field==="source_end_seconds")!;
  assert.ok(Math.abs(proposalDialSlider(review,out,()=>undefined)!.spec.max-2.15)<1e-7);
  assert.throws(()=>applyProposalNumericOverrides(option,[tune("source_end_seconds",2.65)]),/Shorten the overlay/);
});
