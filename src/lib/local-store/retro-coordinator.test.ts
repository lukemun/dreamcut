import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildRetroInventory, retroCaseGroups } from "./retro-inventory";
import { runRetroCoordinator, validateSliceReview } from "./retro-coordinator";
import { acceptRetroOutput, type RetroRecord } from "./editing-memory";
import type { WorkerAdapter } from "../agent/worker-runner";
import { createProject } from "./store";
import { readEditingProfile, writeEditingProfile, saveRetro, retroPath } from "./editing-memory";
import { runEditingRetro } from "./editing-retro";

const chapter = (id: string, type = "caption_text", element = id) => ({ id, category: "Edit", operation: "patch", summary: "Adjusted", changes: [{ id: element, before: { id: element, type, props: { fontSizePx: 40 } }, after: { id: element, type, props: { fontSizePx: 60 } } }] });
const checkpoint = (chapters = [chapter("a")]) => ({ chapters, proposals: [], events: [], core_skills: [], preferences: [], timeline: { elements: [] } });
function fixture(t: { after: (fn: () => void) => void }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "retro-coordinator-test-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}
function noLessons(prompt: string) {
  const payload = JSON.parse(prompt.split("Evidence:\n")[1]);
  return { summary: "No reusable lesson", findings: [], overflow: false,
    assessments: payload.assigned_ids.map((item_id: string) => ({ item_id, outcome: "no_lesson", reason: "Insufficient repetition is not the issue; this change establishes no new rule", finding_indexes: [], additional_slices: [] })),
    ...(payload.phase === "independent_verification" ? { candidate_decisions: [] } : {}) };
}
const adapter = (run: WorkerAdapter["run"]): WorkerAdapter => ({ id: "test", access: ["read-only"], run });

test("inventory preserves aliases, unknown actors and linked reversals without leaking private text", () => {
  const input = { ...checkpoint([chapter("a", "caption_text", "same"), chapter("b", "caption_text", "same")]),
    events: [{ id: "alias", type: "edit", actor: "human", summary: "Changed", evidence: "a" }] };
  const inventory = buildRetroInventory(input);
  assert.equal(inventory.items.length, 2);
  assert.deepEqual(inventory.items[0].evidence_ids, ["a", "alias"]);
  assert.deepEqual(inventory.items[0].slices, ["captions"]);
  assert.equal(inventory.evidence.chapters[0].actor, "unknown");
  assert.equal(retroCaseGroups(inventory).length, 1);
});

test("dry coordinator covers every item, bounds concurrency and reuses completed receipts", async t => {
  const directory = fixture(t); let active = 0, peak = 0, calls = 0;
  const worker = adapter(async request => { calls++; peak = Math.max(peak, ++active); await new Promise(resolve => setTimeout(resolve, 5)); active--; return noLessons(request.prompt); });
  const input = checkpoint([chapter("a"), chapter("b"), chapter("c")]);
  const result = await runRetroCoordinator(input, { directory, worker, limits: { concurrency: 2 } });
  assert.equal(result.stage, "complete"); assert.equal(result.dry_run, true);
  assert.deepEqual(result.coverage, { total: 3, reviewed: 3, verified: 3, gaps: [] });
  assert.equal(peak, 2); assert.equal(calls, 6);
  await runRetroCoordinator(input, { directory, worker, limits: { concurrency: 2 } });
  assert.equal(calls, 6);
  await assert.rejects(runRetroCoordinator(checkpoint(), { directory, worker }), /inputs changed/);
});

test("failed review resumes from receipts and never resets its call budget", async t => {
  const directory = fixture(t); let failed = false, calls = 0;
  const worker = adapter(async request => { calls++; if (request.prompt.includes("verify-") && !failed) { failed = true; throw new Error("mock crash"); } return noLessons(request.prompt); });
  await assert.rejects(runRetroCoordinator(checkpoint(), { directory, worker }), /mock crash/);
  const result = await runRetroCoordinator(checkpoint(), { directory, worker });
  assert.equal(result.calls_used, 3); assert.equal(calls, 3); assert.equal(result.stage, "complete");
});

test("oversized case fails before dispatch rather than truncating evidence", async t => {
  let calls = 0;
  await assert.rejects(runRetroCoordinator(checkpoint(), { directory: fixture(t), limits: { max_prompt_chars: 2000 }, worker: adapter(async r => { calls++; return noLessons(r.prompt); }) }), /exceeds prompt budget/);
  assert.equal(calls, 0);
});

test("missing item assessment and output overflow are rejected", () => {
  const items = buildRetroInventory(checkpoint()).items;
  assert.throws(() => validateSliceReview({ summary: "Done", assessments: [], findings: [], overflow: false }, items, items, []), /coverage/);
  assert.throws(() => validateSliceReview({ summary: "Done", assessments: [], findings: [], overflow: true }, items, items, []), /overflow/);
});

test("a supplement expands an already reviewed slice to the missing item", async t => {
  const input = checkpoint([chapter("a", "caption_text", "same"), { ...chapter("b", "music", "same"), changes: [{ id: "same", before: { type: "music", volume: 1 }, after: { type: "music", volume: .2 } }] } as ReturnType<typeof chapter>]);
  let supplement = false;
  const result = await runRetroCoordinator(input, { directory: fixture(t), worker: adapter(async r => {
    const output = noLessons(r.prompt);
    if (r.prompt.includes("Phase: review-0-audio-initial")) output.assessments[0].additional_slices = ["captions"];
    if (r.prompt.includes("Phase: review-0-captions-supplement")) { supplement = true; assert.equal(output.assessments.length, 2); }
    return output;
  }) });
  assert.equal(supplement, true); assert.equal(result.coverage.verified, 2);
});

test("slice dry-review cannot enter the existing adoption path", () => {
  assert.throws(() => acceptRetroOutput("unused", { checkpoint: { retro_workflow: "slices-v1" } } as RetroRecord, {}), /dry-review only/);
});

test("budget exhaustion keeps successful receipts and explicit partial coverage", async t => {
  const directory = fixture(t); let calls = 0;
  const options = { directory, limits: { max_calls: 1 }, worker: adapter(async r => { calls++; return noLessons(r.prompt); }) };
  await assert.rejects(runRetroCoordinator(checkpoint(), options), /budget exhausted/);
  await assert.rejects(runRetroCoordinator(checkpoint(), options), /budget exhausted/);
  assert.equal(calls, 1);
  const state = JSON.parse(fs.readFileSync(path.join(directory, "state.json"), "utf8"));
  assert.equal(state.stage, "failed"); assert.equal(state.coverage.reviewed, 1); assert.equal(state.coverage.verified, 0);
});

test("verified findings consolidate with exact accounting and weakest confidence", async t => {
  const directory = fixture(t);
  const input = checkpoint([chapter("a"), chapter("b")]);
  const result = await runRetroCoordinator(input, { directory, worker: adapter(async r => {
    const p = JSON.parse(r.prompt.split("Evidence:\n")[1]);
    if (p.phase === "consolidation") return { summary: "Equivalent caption lessons", groups: [{ finding_ids: p.candidates.map((c: { id: string }) => c.id), representative_id: p.candidates[0].id, decision: "duplicate", reason: "Same lesson" }] };
    const id = p.items[0].evidence_ids[0];
    const finding = { category: "Captions", lesson: "Larger captions may aid readability", scope: "project", disposition: "observation", evidence: [id], counterevidence: [], target_skill: null, proposed_change: null,
      reasoning: { basis: "inferred", rationale: "Size increased; motive is inferred", confidence: id === "a" ? "high" : "low", alternatives: ["One-off layout repair"] } };
    return { summary: "Caption choice", findings: [finding], overflow: false,
      assessments: [{ item_id: p.assigned_ids[0], outcome: "finding", reason: "Changed size", finding_indexes: [0], additional_slices: [] }],
      ...(p.phase === "independent_verification" ? { candidate_decisions: p.candidates.map((c: { id: string }) => ({ candidate_id: c.id, decision: "retained", reason: "Supported", finding_indexes: [0] })) } : {}) };
  }) });
  assert.equal(result.findings.length, 1); assert.equal(result.findings[0].reasoning!.confidence, "low");
  assert.deepEqual(result.findings[0].evidence, ["a", "b"]); assert.equal(result.calls_used, 5);
});

test("existing job lifecycle completes an empty dry checkpoint without adopting or changing profile", async t => {
  const directory = fixture(t);
  const oldProjects = process.env.TIMELINE_PROJECTS_DIR, oldProfile = process.env.DREAMCUT_PROFILE_DIR;
  process.env.TIMELINE_PROJECTS_DIR = path.join(directory, "projects");
  process.env.DREAMCUT_PROFILE_DIR = path.join(directory, "profile");
  try {
    createProject("dry-integration", "web");
    writeEditingProfile({ ...readEditingProfile(), learning: true, agent_retros: true });
    const before = readEditingProfile();
    const record: RetroRecord = { id: "dry", created_at: new Date().toISOString(), revision: "fixture", status: "queued", checkpoint: { ...checkpoint([]), trigger: "manual", retro_workflow: "slices-v1" } };
    saveRetro("dry-integration", record);
    await Promise.all([runEditingRetro("dry-integration", "dry"), runEditingRetro("dry-integration", "dry")]);
    const result = JSON.parse(fs.readFileSync(retroPath("dry-integration", "dry"), "utf8"));
    assert.equal(result.status, "complete"); assert.match(result.summary, /no lessons applied/);
    assert.deepEqual(readEditingProfile(), before);
    assert.equal(fs.existsSync(`${retroPath("dry-integration", "dry")}.lock`), false);
    const { GET, POST } = await import("../../app/api/projects/[projectId]/memory/route");
    const params = { params: Promise.resolve({ projectId: "dry-integration" }) };
    const response = await GET(new Request("http://localhost/api/projects/dry-integration/memory?coordinator=dry"), params);
    assert.equal(response.status, 200); assert.equal((await response.json()).coordinator.dry_run, true);
    const invalid = await GET(new Request("http://localhost/api/projects/dry-integration/memory?coordinator=.."), params);
    assert.equal(invalid.status, 400);
    writeEditingProfile({ ...before, learning: false });
    const create = await POST(new Request("http://localhost/api/projects/dry-integration/memory", { method: "POST", body: JSON.stringify({ action: "retro", workflow: "slices-v1" }) }), params);
    assert.equal(create.status, 200);
    const created = (await create.json()).retro;
    const frozen = JSON.parse(fs.readFileSync(retroPath("dry-integration", created.id), "utf8"));
    assert.equal(frozen.checkpoint.retro_workflow, "slices-v1"); assert.equal(frozen.status, "queued");
    const retry = await POST(new Request("http://localhost/api/projects/dry-integration/memory", { method: "POST", body: JSON.stringify({ action: "retro", id: created.id, workflow: "slices-v1" }) }), params);
    assert.equal(retry.status, 400);
  } finally {
    if (oldProjects === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = oldProjects;
    if (oldProfile === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = oldProfile;
  }
});
