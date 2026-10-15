import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildRetroEvidence, partitionRetroEvidence, runEditingRetro, resumeProjectRetros } from "./editing-retro";
import { createProject, readTimeline } from "./store";
import { createRetroCheckpoint, readEditingProfile, writeEditingProfile, recordMemoryEvent, retroPath, reconcileRetro, readMemoryView, acceptRetroOutput, previewSkillCandidate, reviewSkillCandidate, type RetroRecord } from "./editing-memory";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "export-retro-test-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");

test("all historical chapters, corrections and final state reach bounded evidence; private sources do not", () => {
  const chapters = Array.from({ length: 336 }, (_, i) => ({ id: `chapter-${i}`, category: "Audio", operation: "patch", summary: "Changed mix", changes: [{ before: { volume: 1, source_url: "/private.wav" }, after: { volume: .1, source_url: "/private.wav" } }] }));
  const evidence = buildRetroEvidence({ chapters, proposals: [], events: [{ id: "correction", type: "correction", actor: "human", summary: "Keep other music https://private.example /Users/private/file" }], core_skills: [], preferences: [], muted_lane_keys: ["music_1"], timeline: { elements: [{ id: "final", type: "caption_text", props: { text: "Private transcript", fontSizePx: 60 } }] } });
  const batches = partitionRetroEvidence(evidence, 2000);
  assert.ok(batches.length > 1);
  const rows = batches.flat();
  assert.equal(rows.filter(r => r.kind === "chapter").length, 336);
  assert.ok(rows.some(r => r.kind === "event" && r.value.id === "correction"));
  assert.ok(rows.some(r => r.kind === "final_clip"));
  assert.deepEqual(evidence.export_settings.muted_lane_keys, ["music_1"]);
  assert.doesNotMatch(JSON.stringify(evidence), /Private transcript|private\.example|\/Users\/private|private\.wav/);
});

test("completed export outbox recovers, failed export never runs, interrupted retries are bounded", () => {
  createProject("recovery", "web");
  const record = createRetroCheckpoint("recovery", "export-test", { trigger: "export", timeline: readTimeline("recovery") });
  writeJsonFileAtomic(path.join(process.env.TIMELINE_PROJECTS_DIR!, ".cache/render-jobs/export-test.json"), { status: "completed" });
  assert.equal(reconcileRetro("recovery", record).status, "queued");
  assert.equal(reconcileRetro("recovery", { ...record, status: "running", pid: 99999999, attempt_count: 1 }).status, "queued");
  assert.equal(reconcileRetro("recovery", { ...record, status: "running", pid: 99999999, attempt_count: 3 }).status, "failed");
  writeJsonFileAtomic(path.join(process.env.TIMELINE_PROJECTS_DIR!, ".cache/render-jobs/export-test.json"), { status: "failed" });
  assert.equal(reconcileRetro("recovery", record).status, "failed");
});

test("a completed export makes its checkpoint reviewable but never starts a retro on its own", async () => {
  createProject("manual-only", "web");
  writeEditingProfile({ ...readEditingProfile(), learning: true, agent_retros: true });
  const executable = path.join(root, "manual-only-worker.cjs");
  const calls = path.join(root, "manual-only-calls");
  fs.writeFileSync(executable, `#!${process.execPath}\nlet s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{require('fs').appendFileSync(${JSON.stringify(calls)},'x');process.stdout.write(JSON.stringify({summary:'Reviewed',findings:[]}))});`);
  fs.chmodSync(executable, 0o755);
  process.env.DREAMCUT_WORKER_EXECUTABLE = executable;
  try {
    createRetroCheckpoint("manual-only", "export-done", { trigger: "export", timeline: readTimeline("manual-only") });
    writeJsonFileAtomic(path.join(process.env.TIMELINE_PROJECTS_DIR!, ".cache/render-jobs/export-done.json"), { status: "completed" });
    resumeProjectRetros("manual-only");
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(readJsonFile<RetroRecord>(retroPath("manual-only", "export-done"), null!).status, "queued");
    assert.equal(fs.existsSync(calls), false);
    // The manual entry point still reviews the frozen checkpoint.
    await runEditingRetro("manual-only", "export-done");
    assert.equal(readJsonFile<RetroRecord>(retroPath("manual-only", "export-done"), null!).status, "complete");
    assert.ok(fs.readFileSync(calls, "utf8").length > 0);
  } finally { delete process.env.DREAMCUT_WORKER_EXECUTABLE; }
});

test("saved review notes, proposal context and reasons survive with honest provenance", () => {
  const evidence = buildRetroEvidence({ chapters: [{ id: "review", category: "Workflow", operation: "tag", summary: "Review /Users/private/file", changes: [], context_changes: [
    { field: "frame_tags", before: { tags: [] }, after: { tags: [{ id: "tag1", note: "Keep this quieter https://private.example", timeline_seconds: 4, source_url: "PRIVATE_SOURCE" }] } },
    { field: "metadata", before: {}, after: { output_aspect_ratio: "9:16", script: "PRIVATE_SCRIPT" } },
  ] }], proposals: [{ proposal_id: "proposal", status: "approved", brief: "Keep room for the voice", proposal: { summary: "Quieter music", operations: [{ rationale: "Do not compete with the voice" }] } }],
    events: [{ id: "approval", type: "proposal.approved", actor: "human", summary: "Agent summary", data: { resolution: { reason: "Keep the original track" }, transcript: "PRIVATE_TRANSCRIPT" } }], core_skills: [], preferences: [] });
  assert.match(JSON.stringify(evidence.chapters), /Keep this quieter/);
  assert.equal(evidence.proposals[0].brief, "Keep room for the voice");
  assert.equal(evidence.proposals[0].operation_rationales[0].provenance, "agent_proposal");
  assert.equal(evidence.events[0].summary_provenance, "agent_proposal_summary_not_user_quote");
  assert.equal(evidence.events[0].resolution_reason, "Keep the original track");
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE_|private.example|\/Users\/private/);
  assert.match(JSON.stringify(partitionRetroEvidence(evidence, 2000)), /Keep this quieter/);
  assert.throws(() => partitionRetroEvidence(evidence, 30), /exceeds/);
});

test("large chapter splitting retains context once, without dropping clip changes", () => {
  const evidence = buildRetroEvidence({ chapters: [{ id: "big", category: "Audio", operation: "patch", summary: "Mix", context_changes: [{ field: "frame_tags", before: {}, after: { tags: [{ id: "mark", note: "Keep this beat" }] } }], changes: Array.from({ length: 100 }, () => ({ before: { volume: 1 }, after: { volume: .2 } })) }], proposals: [], events: [], core_skills: [], preferences: [] });
  const rows = partitionRetroEvidence(evidence, 2000).flat().filter(r => r.kind === "chapter");
  assert.equal(rows.reduce((n, r) => n + ("changes" in r.value ? r.value.changes.length : 0), 0), 100);
  assert.equal(rows.reduce((n, r) => n + ("context_changes" in r.value ? r.value.context_changes.length : 0), 0), 1);
});

test("schema-2 proposal alternatives retain rationale and actual selection, not recommendation as approval", () => {
  const evidence = buildRetroEvidence({ chapters: [], events: [], preferences: [], core_skills: [], proposals: [{ proposal_id: "options", status: "approved", proposal: { summary: "Music options", options: [
    { id: "a", label: "Louder", summary: "High energy", recommended: true, operations: [{ rationale: "Emphasize the hook" }] },
    { id: "b", label: "Quieter", summary: "Speech first", recommended: false, operations: [{ rationale: "Reduce masking /Users/private/music.wav", props: { text: "PRIVATE_TRANSCRIPT" } }] },
  ] }, resolution: { option_id: "b" } }] });
  assert.equal(evidence.proposals[0].selected_option_id, "b");
  assert.equal(evidence.proposals[0].options[0].recommended, true);
  assert.match(evidence.proposals[0].options[1].operation_rationales[0].rationale, /Reduce masking/);
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE_TRANSCRIPT|\/Users\/private/);
});

test("background review stages changes, never modifies skills, and concurrent dispatch is idempotent", async () => {
  createProject("dispatch", "web");
  writeEditingProfile({ ...readEditingProfile(), learning: true, agent_retros: true });
  recordMemoryEvent("dispatch", { id: "human-correction", actor: "human", type: "correction", summary: "Only toggle the named track" });
  const executable = path.join(root, "worker.cjs");
  const calls = path.join(root, "calls");
  fs.writeFileSync(executable, `#!${process.execPath}\nlet s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{require('fs').appendFileSync(${JSON.stringify(calls)},'x');process.stdout.write(JSON.stringify({summary:'Full history reviewed',findings:[]}))});`);
  fs.chmodSync(executable, 0o755);
  process.env.DREAMCUT_WORKER_EXECUTABLE = executable;
  try {
    createRetroCheckpoint("dispatch", "once", { timeline: readTimeline("dispatch"), trigger: "manual" }, false);
    await Promise.all([runEditingRetro("dispatch", "once"), runEditingRetro("dispatch", "once")]);
    assert.equal(readJsonFile<RetroRecord>(retroPath("dispatch", "once"), null!).status, "complete");
    assert.equal(fs.readFileSync(calls, "utf8"), "xx"); // one batch + synthesis, not two jobs
    resumeProjectRetros("dispatch");
    await runEditingRetro("dispatch", "once");
    assert.equal(fs.readFileSync(calls, "utf8"), "xx");
  } finally { delete process.env.DREAMCUT_WORKER_EXECUTABLE; }
});

test("skill preview is exactly what approval writes", () => {
  const skillRoot = path.join(root, "skills");
  fs.mkdirSync(path.join(skillRoot, "delivery"), { recursive: true });
  const file = path.join(skillRoot, "delivery/SKILL.md");
  fs.writeFileSync(file, "---\nname: delivery\ndescription: Export videos.\n---\n# Delivery\n");
  process.env.DREAMCUT_SKILLS_DIR = skillRoot;
  try {
    createProject("preview", "web");
    recordMemoryEvent("preview", { id: "correction", actor: "human", type: "correction", summary: "Preserve the other music" });
    const record = createRetroCheckpoint("preview", "review", { timeline: readTimeline("preview") }, false);
    acceptRetroOutput("preview", record, { summary: "Supported lesson", findings: [{ category: "Delivery", lesson: "Named track only", scope: "all", disposition: "skill_candidate", evidence: ["correction"], counterevidence: [], target_skill: "delivery", proposed_change: "Toggle only the named track." }] });
    const candidate = readMemoryView("preview").skill_candidates[0]!;
    assert.equal(candidate.status, "pending");
    assert.equal(fs.readFileSync(file, "utf8"), candidate.preview!.current);
    const preview = previewSkillCandidate(candidate)!;
    reviewSkillCandidate("preview", candidate.id, "approve");
    assert.equal(fs.readFileSync(file, "utf8"), preview.proposed);
  } finally { delete process.env.DREAMCUT_SKILLS_DIR; }
});


test("regular retro retry reuses a validated batch after synthesis fails", async () => {
  createProject("resume", "web");
  writeEditingProfile({ ...readEditingProfile(), learning: true, agent_retros: true });
  const executable = path.join(root, "resume-worker.cjs");
  const calls = path.join(root, "resume-calls");
  const failed = path.join(root, "resume-failed");
  fs.writeFileSync(executable, `#!${process.execPath}\nlet s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{const fs=require('fs');const phase=JSON.parse(s).prompt.includes('Synthesize the whole progression')?'S':'B';fs.appendFileSync(${JSON.stringify(calls)},phase);if(phase==='S'&&!fs.existsSync(${JSON.stringify(failed)})){fs.writeFileSync(${JSON.stringify(failed)},'1');process.exit(1);}process.stdout.write(JSON.stringify({summary:'Reviewed',findings:[]}));});`);
  fs.chmodSync(executable, 0o755);
  process.env.DREAMCUT_WORKER_EXECUTABLE = executable;
  try {
    createRetroCheckpoint("resume", "retry", { timeline: readTimeline("resume"), trigger: "manual" }, false);
    await runEditingRetro("resume", "retry");
    assert.equal(readJsonFile<RetroRecord>(retroPath("resume", "retry"), null!).status, "failed");
    await runEditingRetro("resume", "retry");
    assert.equal(readJsonFile<RetroRecord>(retroPath("resume", "retry"), null!).status, "complete");
    assert.equal(fs.readFileSync(calls, "utf8"), "BSS", "retry must not rerun the successful batch");
  } finally { delete process.env.DREAMCUT_WORKER_EXECUTABLE; }
});
