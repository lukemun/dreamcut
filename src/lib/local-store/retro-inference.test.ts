import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject, readTimeline } from "./store";
import { acceptRetroOutput, createRetroCheckpoint, readEditingProfile, readSkillCandidates, recordMemoryEvent, retroOutputSchemaForEvidence, type RetroFinding } from "./editing-memory";
import { RETRO_INFERENCE_POLICY } from "./editing-retro";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "retro-inference-test-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");

test("new reviewer findings require labeled rationale; omitted and fabricated evidence fail", () => {
  const schema = retroOutputSchemaForEvidence(["human-edit"]);
  const finding = { category: "Audio", scope: "all", lesson: "Speech-forward mix", disposition: "preference", evidence: ["human-edit"], counterevidence: [], target_skill: null, proposed_change: null };
  assert.equal(schema.safeParse({ summary: "Inference", findings: [finding] }).success, false);
  const reasoning = { basis: "inferred", confidence: "high", rationale: "Human lowered competing music under speech", alternatives: ["This source alone was mastered too loud"] };
  assert.equal(schema.safeParse({ summary: "Inference", findings: [{ ...finding, reasoning }] }).success, true);
  assert.equal(schema.safeParse({ summary: "Inference", findings: [{ ...finding, reasoning, evidence: ["invented"] }] }).success, false);
  assert.match(RETRO_INFERENCE_POLICY, /Actively infer/);
  assert.match(RETRO_INFERENCE_POLICY, /never a quotation/);
});

test("supported inferred taste can activate; ambiguity, unknown actors and conflicts remain suggested", () => {
  createProject("inference", "web");
  recordMemoryEvent("inference", { id: "human-edit", actor: "human", type: "timeline.snapshot", summary: "Lowered music under voice" });
  recordMemoryEvent("inference", { id: "unknown-edit", actor: "unknown", type: "timeline.snapshot", summary: "Changed music" });
  const checkpoint = createRetroCheckpoint("inference", "review", { timeline: readTimeline("inference") }, false);
  const base: RetroFinding = { category: "Audio", scope: "all", lesson: "Speech-forward mix", disposition: "preference", evidence: ["human-edit"], counterevidence: [],
    reasoning: { basis: "inferred", confidence: "high", rationale: "The human lowered competing music beneath speech", alternatives: ["Source loudness correction"] } };
  acceptRetroOutput("inference", checkpoint, { summary: "Inferred reasons, not quoted instructions", findings: [
    base,
    { ...base, lesson: "Uncertain mix", reasoning: { ...base.reasoning!, confidence: "medium" } },
    { ...base, lesson: "Unknown author mix", evidence: ["unknown-edit"] },
    { ...base, lesson: "Conflicting mix", counterevidence: ["unknown-edit"] },
  ] });
  const preferences = readEditingProfile().preferences;
  assert.equal(preferences.find(p => p.text === base.lesson)?.status, "active");
  assert.equal(preferences.find(p => p.text === base.lesson)?.reasoning?.basis, "inferred");
  for (const text of ["Uncertain mix", "Unknown author mix", "Conflicting mix"]) assert.equal(preferences.find(p => p.text === text)?.status, "suggested");
});

test("inferred reusable craft is a pending skill candidate with retained rationale", () => {
  createProject("craft", "web");
  recordMemoryEvent("craft", { id: "edit", actor: "human", type: "timeline.snapshot", summary: "Lowered competing music" });
  const checkpoint = createRetroCheckpoint("craft", "review", { timeline: readTimeline("craft") }, false);
  checkpoint.checkpoint.core_skills = [{ name: "audio-balance", version: "fixture" }];
  acceptRetroOutput("craft", checkpoint, { summary: "Possible reusable mix check", findings: [{ category: "Audio", scope: "all", lesson: "Check speech masking", disposition: "skill_candidate", evidence: ["edit"], counterevidence: [], target_skill: "audio-balance", proposed_change: "Check competing music levels beneath speech.", reasoning: { basis: "inferred", confidence: "medium", rationale: "The correction may indicate a missing mix check", alternatives: ["Personal preference for quieter music"] } }] });
  const candidate = readSkillCandidates("craft")[0];
  assert.equal(candidate.status, "pending");
  assert.equal(candidate.reasoning?.basis, "inferred");
});
