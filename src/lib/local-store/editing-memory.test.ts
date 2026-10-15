import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { z } from "zod";
import { createProject, readTimeline, writeMetadata, readMetadata } from "./store";
import { recordMemoryEvent, memoryEvents, readEditingProfile, writeEditingProfile, effectivePreferences, createRetroCheckpoint, acceptRetroOutput, readSkillCandidates, reviewSkillCandidate, retroOutputSchemaForEvidence, retroPath, memoryDir, migrateLegacyProfileDirectory, profileDir, createSkillMaintenanceJob, readSkillMaintenanceJob, resolveSkillMaintenanceJob, saveSkillMaintenanceJob, type RetroRecord } from "./editing-memory";
import { projectRetroClipState, runEditingRetro } from "./editing-retro";
import { runSkillMaintenance } from "./skill-maintenance";
import { readJsonFile } from "./atomic-json";
import { addFrameTag, readFrameTags, updateFrameTag } from "./frame-tags";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "editing-memory-test-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");

test("legacy profile data moves to the DreamCut directory without overwriting a current profile", () => {
  const migrationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-profile-migration-"));
  const legacy = path.join(migrationRoot, "OpenEdit", "profiles", "default");
  const current = path.join(migrationRoot, "DreamCut", "profiles", "default");
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, "preferences.json"), "legacy-profile");
  assert.equal(migrateLegacyProfileDirectory(current, legacy), current);
  assert.equal(fs.readFileSync(path.join(current, "preferences.json"), "utf8"), "legacy-profile");
  assert.equal(fs.existsSync(legacy), false);

  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, "preferences.json"), "do-not-overwrite");
  assert.equal(migrateLegacyProfileDirectory(current, legacy), current);
  assert.equal(fs.readFileSync(path.join(current, "preferences.json"), "utf8"), "legacy-profile");
});

test("a configured app-data folder keeps the profile inside it", () => {
  const saved = { profile: process.env.DREAMCUT_PROFILE_DIR, appData: process.env.DREAMCUT_APP_DATA_DIR };
  const appData = path.join(root, "custom app data");
  try {
    delete process.env.DREAMCUT_PROFILE_DIR;
    process.env.DREAMCUT_APP_DATA_DIR = appData;
    assert.equal(profileDir(), path.join(appData, "profiles", "default"));
  } finally {
    process.env.DREAMCUT_PROFILE_DIR = saved.profile;
    if (saved.appData === undefined) delete process.env.DREAMCUT_APP_DATA_DIR; else process.env.DREAMCUT_APP_DATA_DIR = saved.appData;
  }
});

test("retro evidence preserves spatial corrections without leaking media or transcript content", () => {
  const projected = projectRetroClipState({
    type: "still", timeline_start: 1, duration: 2, source_url: "/private/source.png",
    props: {
      text: "private transcript", media_scale: 0.42, media_offset_x: -0.2, media_offset_y: 0.1,
      sticker_outline: true, semantic_layout: { schema_version: 1, slot: "upper_right", size: "peer", private_note: "omit" },
      groupLayout: { kind: "paragraph_panel", row: 2, rows: 4, private_note: "omit" },
      keyframes: { media_offset_x: [{ t: 0, v: 0 }, { t: 1, v: 0.2 }], grade_contrast: [{ t: 0, v: 1 }] },
    },
  })!;
  assert.deepEqual(projected.layout, {
    media_scale: 0.42, media_offset_x: -0.2, media_offset_y: 0.1, sticker_outline: true,
    semantic_layout: { schema_version: 1, slot: "upper_right", size: "peer" },
    groupLayout: { kind: "paragraph_panel", row: 2, rows: 4 },
    spatial_keyframe_counts: { media_offset_x: 2 },
  });
  assert.equal("source_url" in projected, false);
  assert.equal(JSON.stringify(projected).includes("private transcript"), false);
  assert.equal(JSON.stringify(projected).includes("private_note"), false);
});

test("review notes persist without changing the video timeline", () => {
  createProject("notes", "web");
  const timeline = readTimeline("notes");
  const { tag } = addFrameTag("notes", 3);
  updateFrameTag("notes", tag.id, { note: "Tighten the gap" });
  const saved = readFrameTags("notes").tags[0]!;
  assert.equal(saved.note, "Tighten the gap");
  assert.deepEqual(readTimeline("notes"), timeline);
});

test("evidence is idempotent and tampering fails integrity validation", () => {
  createProject("ledger", "web");
  const input = { id: "same-event", type: "test", actor: "human" as const, summary: "Explicit correction" };
  recordMemoryEvent("ledger", input); recordMemoryEvent("ledger", input);
  assert.equal(memoryEvents("ledger").filter(e => e.id === input.id).length, 1);
  const dir = path.join(memoryDir("ledger"), "events");
  const file = fs.readdirSync(dir).map(name => path.join(dir, name)).find(file => JSON.parse(fs.readFileSync(file, "utf8")).id === input.id)!;
  const changed = JSON.parse(fs.readFileSync(file, "utf8")); changed.summary = "forged";
  fs.writeFileSync(file, JSON.stringify(changed));
  assert.throws(() => memoryEvents("ledger"), /integrity/);
});
test("personal defaults honor status and scope; project rules sort above global rules", () => {
  const base = { text: "Short captions", category: "Captions" as const, evidence: [], origin: "human" as const, updated_at: new Date().toISOString() };
  writeEditingProfile({ version: 1, learning: true, agent_retros: false, preferences: [
    { ...base, id: randomUUID(), status: "active", scope: "all" },
    { ...base, id: randomUUID(), status: "active", scope: "vertical-social" },
    { ...base, id: randomUUID(), status: "active", scope: "project", project_id: "one" },
    { ...base, id: randomUUID(), status: "suggested", scope: "all" },
    { ...base, id: randomUUID(), status: "retired", scope: "all" },
  ] });
  assert.equal(effectivePreferences("one", "9:16").length, 3);
  assert.deepEqual(effectivePreferences("one", "9:16").map(p => p.scope), ["project", "vertical-social", "all"]);
  assert.equal(effectivePreferences("two", "16:9").length, 1);
});
test("retro checkpoints freeze evidence and retries reuse the same checkpoint", async () => {
  createProject("frozen", "web");
  const timeline = readTimeline("frozen");
  const first = createRetroCheckpoint("frozen", "export-one", { timeline, metadata: readMetadata("frozen") });
  writeMetadata("frozen", { ...readMetadata("frozen"), title: "Changed after export" }, "title_change");
  const again = createRetroCheckpoint("frozen", "export-one", { different: true });
  assert.deepEqual(again, first);
  await runEditingRetro("frozen", "export-one");
  assert.equal(readJsonFile<RetroRecord>(retroPath("frozen", "export-one"), null!).status, "queued");
  assert.deepEqual(readTimeline("frozen"), timeline);
});
test("retro rejects invented evidence and automatically activates a single supported style choice", () => {
  createProject("lessons", "web");
  recordMemoryEvent("lessons", { id: "correction-one", actor: "human", type: "correction", summary: "Shorter captions" });
  recordMemoryEvent("lessons", { id: "correction-two", actor: "human", type: "correction", summary: "Shorter captions again" });
  const record = createRetroCheckpoint("lessons", "retro-one", { timeline: readTimeline("lessons") }, false);
  const finding = { category: "Captions", lesson: "Three words for this series", scope: "project", disposition: "preference", evidence: ["invented"], counterevidence: [] };
  assert.throws(() => acceptRetroOutput("lessons", record, { summary: "Learned something", findings: [finding] }), /outside/);
  acceptRetroOutput("lessons", record, { summary: "One caption choice", findings: [{ ...finding, scope: "vertical-social", evidence: ["correction-one"] }] });
  assert.equal(readEditingProfile().preferences.find(p => p.text === finding.lesson)?.status, "active");
  assert.equal(effectivePreferences("next-project", "9:16").some(p => p.text === finding.lesson), true);
  assert.equal(effectivePreferences("next-project", "16:9").some(p => p.text === finding.lesson), false);
  acceptRetroOutput("lessons", record, { summary: "Conflicting choice", findings: [{ ...finding, lesson: "Long captions instead", evidence: ["correction-two"], counterevidence: ["correction-one"] }] });
  assert.equal(readEditingProfile().preferences.find(p => p.text === "Long captions instead")?.status, "suggested");
  assert.equal(readEditingProfile().preferences.find(p => p.text === finding.lesson)?.status, "active");
});
test("missing agent executable leaves a durable actionable failure and permits retry", async () => {
  createProject("missing-runner", "web");
  writeEditingProfile({ ...readEditingProfile(), agent_retros: true });
  process.env.DREAMCUT_CODEX_EXECUTABLE = path.join(root, "does-not-exist");
  createRetroCheckpoint("missing-runner", "retry-me", { timeline: readTimeline("missing-runner") }, false);
  await runEditingRetro("missing-runner", "retry-me");
  const failed = readJsonFile<RetroRecord>(retroPath("missing-runner", "retry-me"), null!);
  assert.equal(failed.status, "failed"); assert.match(failed.error!, /unavailable/);
  writeEditingProfile({ ...readEditingProfile(), agent_retros: false });
  delete process.env.DREAMCUT_CODEX_EXECUTABLE;
});
test("failed exports never dispatch retros and duplicate citations do not become preferences", async () => {
  createProject("failed-export", "web");
  recordMemoryEvent("failed-export", { id: "one-correction", type: "correction", actor: "human", summary: "One correction only" });
  const record = createRetroCheckpoint("failed-export", "unfinished", { trigger: "export", timeline: readTimeline("failed-export") });
  await runEditingRetro("failed-export", record.id);
  assert.match(readJsonFile<RetroRecord>(retroPath("failed-export", record.id), null!).error!, /did not finish/);
  const evidence = (record.checkpoint.events as { id: string }[])[0]!.id;
  assert.throws(() => acceptRetroOutput("failed-export", record, { summary: "Insufficient evidence", findings: [{ category: "Pacing", lesson: "Duplicate-only finding", scope: "project", disposition: "preference", evidence: [evidence, evidence], counterevidence: [] }] }), /did not finish/);
  assert.equal(readEditingProfile().preferences.some(p => p.text === "Duplicate-only finding"), false);
});


test("retro generation schema restricts both citation arrays to supplied evidence", () => {
  const schema = retroOutputSchemaForEvidence(["chapter-one", "proposal-two"]);
  const finding = { category: "Pacing", lesson: "Keep real source breath", scope: "project",
    disposition: "observation", evidence: ["chapter-one"], counterevidence: ["proposal-two"], target_skill: null, proposed_change: null,
    reasoning: { basis: "inferred", rationale: "Changed timing suggests a pacing experiment", confidence: "medium", alternatives: ["Technical sync correction"] } };
  assert.equal(schema.safeParse({ summary: "Supported observation", findings: [finding] }).success, true);
  for (const id of ["preference-id", "history:chapter-one", "invented", "omitted-old-chapter"]) {
    assert.equal(schema.safeParse({ summary: "Invalid", findings: [{ ...finding, evidence: [id] }] }).success, false);
    assert.equal(schema.safeParse({ summary: "Invalid", findings: [{ ...finding, counterevidence: [id] }] }).success, false);
  }
  const empty = retroOutputSchemaForEvidence([]);
  assert.equal(empty.safeParse({ summary: "No evidence", findings: [] }).success, true);
  assert.equal(empty.safeParse({ summary: "No evidence", findings: [finding] }).success, false);
  const jsonSchema = z.toJSONSchema(schema) as { properties?: { findings?: { items?: { required?: string[] } } } };
  assert.deepEqual(jsonSchema.properties?.findings?.items?.required?.sort(), [
    "category", "counterevidence", "disposition", "evidence", "lesson", "proposed_change", "reasoning", "scope", "target_skill",
  ]);
});

test("rejected runner output is retained without adopting lessons", async () => {
  createProject("rejected-runner", "web");
  const originalProfile = readEditingProfile();
  writeEditingProfile({ ...originalProfile, learning: true, agent_retros: true });
  const executable = path.join(root, "fake-retro.cjs");
  fs.writeFileSync(executable, `#!${process.execPath}\nconst fs = require('node:fs');\nconst output = process.argv[process.argv.indexOf('--output-last-message') + 1];\nprocess.stdin.resume(); process.stdin.on('end', () => fs.writeFileSync(output, JSON.stringify({summary: 'Invalid attempt', findings: [{category: 'Pacing', lesson: 'Must not be adopted', scope: 'project', disposition: 'preference', evidence: ['invented'], counterevidence: []}]})));\n`);
  fs.chmodSync(executable, 0o755);
  process.env.DREAMCUT_CODEX_EXECUTABLE = executable;
  try {
    createRetroCheckpoint("rejected-runner", "diagnostic", { timeline: readTimeline("rejected-runner") }, false);
    await runEditingRetro("rejected-runner", "diagnostic");
    const record = readJsonFile<RetroRecord>(retroPath("rejected-runner", "diagnostic"), null!);
    assert.equal(record.status, "failed");
    const dir = path.join(memoryDir("rejected-runner"), "retro-attempts");
    const receipt = JSON.parse(fs.readFileSync(path.join(dir, fs.readdirSync(dir)[0]!), "utf8"));
    assert.equal(receipt.output.findings[0].evidence[0], "invented");
    assert.equal(receipt.checkpoint_revision, record.revision);
    assert.equal(readEditingProfile().preferences.some(p => p.text === "Must not be adopted"), false);
  } finally {
    delete process.env.DREAMCUT_CODEX_EXECUTABLE;
    const currentProfile = readEditingProfile();
    currentProfile.learning = originalProfile.learning;
    currentProfile.agent_retros = originalProfile.agent_retros;
    writeEditingProfile(currentProfile);
  }
});

test("approved skill improvements update the skill and append its evolution log", () => {
  const previousSkillsDir = process.env.DREAMCUT_SKILLS_DIR;
  const skillsDir = path.join(root, "reviewable-skills");
  const skillDir = path.join(skillsDir, "cut-pacing");
  fs.mkdirSync(skillDir, { recursive: true });
  const original = `---\nname: cut-pacing\ndescription: Refine pacing while preserving natural speech.\n---\n\n# Cut pacing\n\nKeep complete words.\n`;
  fs.writeFileSync(path.join(skillDir, "SKILL.md"), original);
  process.env.DREAMCUT_SKILLS_DIR = skillsDir;
  try {
    createProject("skill-promotion", "web");
    recordMemoryEvent("skill-promotion", { id: "pacing-correction", type: "correction", actor: "human", summary: "Preserve a real breath at joins" });
    const record = createRetroCheckpoint("skill-promotion", "promotion-retro", { timeline: readTimeline("skill-promotion") }, false);
    acceptRetroOutput("skill-promotion", record, { summary: "Pacing lesson", findings: [{ category: "Pacing", lesson: "A reusable cadence correction", scope: "all",
      disposition: "skill_candidate", evidence: ["pacing-correction"], counterevidence: [], target_skill: "cut-pacing", proposed_change: "Keep a real source breath at every spoken-word join." }] });
    const candidate = readSkillCandidates("skill-promotion")[0]!;
    assert.equal(candidate.status, "pending");
    const approved = reviewSkillCandidate("skill-promotion", candidate.id, "approve");
    assert.equal(approved.status, "approved");
    assert.match(fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8"), /Learned refinements[\s\S]*real source breath/);
    assert.match(fs.readFileSync(path.join(skillDir, "evolution.md"), "utf8"), new RegExp(candidate.id));
    assert.equal(readSkillCandidates("skill-promotion")[0]!.status, "approved");
  } finally {
    if (previousSkillsDir === undefined) delete process.env.DREAMCUT_SKILLS_DIR;
    else process.env.DREAMCUT_SKILLS_DIR = previousSkillsDir;
  }
});

test("rejected improvements stay inert and stale improvements merge additively", () => {
  const previousSkillsDir = process.env.DREAMCUT_SKILLS_DIR;
  const skillsDir = path.join(root, "guarded-skills");
  const skillDir = path.join(skillsDir, "caption-craft");
  fs.mkdirSync(skillDir, { recursive: true });
  const skillPath = path.join(skillDir, "SKILL.md");
  const original = `---\nname: caption-craft\ndescription: Create readable captions.\n---\n\n# Caption craft\n`;
  fs.writeFileSync(skillPath, original);
  process.env.DREAMCUT_SKILLS_DIR = skillsDir;
  const stage = (projectId: string, retroId: string, proposedChange: string) => {
    createProject(projectId, "web");
    recordMemoryEvent(projectId, { id: `${projectId}-evidence`, type: "correction", actor: "human", summary: proposedChange });
    const record = createRetroCheckpoint(projectId, retroId, { timeline: readTimeline(projectId) }, false);
    acceptRetroOutput(projectId, record, { summary: "Caption lesson", findings: [{ category: "Captions", lesson: proposedChange, scope: "all", disposition: "skill_candidate",
      evidence: [`${projectId}-evidence`], counterevidence: [], target_skill: "caption-craft", proposed_change: proposedChange }] });
    return readSkillCandidates(projectId)[0]!;
  };
  try {
    const rejected = stage("skill-rejection", "reject-retro", "Use fewer words.");
    reviewSkillCandidate("skill-rejection", rejected.id, "reject");
    assert.equal(fs.readFileSync(skillPath, "utf8"), original);

    const stale = stage("skill-stale", "stale-retro", "Raise captions above controls.");
    fs.writeFileSync(skillPath, `${original}\nExternally revised.\n`);
    const merged = reviewSkillCandidate("skill-stale", stale.id, "approve");
    assert.equal(merged.promotion_mode, "merged_onto_changed_skill");
    const mergedSkill = fs.readFileSync(skillPath, "utf8");
    assert.match(mergedSkill, /Externally revised/);
    assert.match(mergedSkill, /Learned refinements[\s\S]*Raise captions above controls/);

    const reconciledText = "Keep caption blocks inside the title-safe region.";
    const alreadyPresent = stage("skill-already-present", "present-retro", reconciledText);
    fs.appendFileSync(skillPath, `\n- ${reconciledText}\n`);
    const reconciled = reviewSkillCandidate("skill-already-present", alreadyPresent.id, "approve");
    assert.equal(reconciled.promotion_mode, "already_present");
    assert.equal(fs.readFileSync(skillPath, "utf8").split(reconciledText).length - 1, 1);
  } finally {
    if (previousSkillsDir === undefined) delete process.env.DREAMCUT_SKILLS_DIR;
    else process.env.DREAMCUT_SKILLS_DIR = previousSkillsDir;
  }
});

test("one maintenance run maps every skill, delegates selected work, and applies one reviewed bundle", async () => {
  const previousSkillsDir = process.env.DREAMCUT_SKILLS_DIR;
  const previousExecutable = process.env.DREAMCUT_CODEX_EXECUTABLE;
  const skillsDir = path.join(root, "maintenance-skills");
  for (const name of ["skill-a", "skill-b"]) {
    fs.mkdirSync(path.join(skillsDir, name), { recursive: true });
    fs.writeFileSync(path.join(skillsDir, name, "SKILL.md"), `---\nname: ${name}\ndescription: Maintain ${name}.\n---\n\n# ${name}\n\nCurrent guidance.\n`);
  }
  const executable = path.join(root, "fake-maintenance.cjs");
  fs.writeFileSync(executable, `#!${process.execPath}
const fs = require('node:fs');
const output = process.argv[process.argv.indexOf('--output-last-message') + 1];
let prompt = ''; process.stdin.on('data', chunk => prompt += chunk); process.stdin.on('end', () => {
  let result;
  if (prompt.includes('independent evaluator')) result = {summary:'One change passed independent review.', verdicts:[{skill:'skill-a',verdict:'approve',rationale:'The rewrite is focused and preserves the contract.',concerns:[]}]};
  else if (prompt.includes('bounded specialist worker')) result = {skill:'skill-a',outcome:'propose',summary:'Integrated the refinement into ordered guidance.',proposed_content:'---\\nname: skill-a\\ndescription: Maintain skill-a.\\n---\\n\\n# skill-a\\n\\nOrdered current guidance.\\n',research_sources:[],evaluation_cases:[{request:'Use skill A',expected_behavior:'Follow the ordered guidance.'}],included_refinements:['Ordered current guidance.'],risks:[]};
  else result = {summary:'Inspected both skills.',skills:[{skill:'skill-a',recommendation:'revise',rationale:'Its guidance needs consolidation.',focus:['ordering'],research_questions:[]},{skill:'skill-b',recommendation:'keep',rationale:'It is already concise.',focus:[],research_questions:[]}]};
  fs.writeFileSync(output, JSON.stringify(result));
});
`);
  fs.chmodSync(executable, 0o755);
  process.env.DREAMCUT_SKILLS_DIR = skillsDir;
  process.env.DREAMCUT_CODEX_EXECUTABLE = executable;
  try {
    createProject("skill-maintenance", "web");
    const queued = createSkillMaintenanceJob("skill-maintenance");
    const ready = await runSkillMaintenance("skill-maintenance", queued.id);
    assert.equal(ready.status, "ready");
    assert.equal(ready.inspections?.length, 2);
    assert.equal(ready.worker_count, 3);
    assert.deepEqual(ready.changes?.map(change => change.skill), ["skill-a"]);
    const applied = resolveSkillMaintenanceJob("skill-maintenance", ready.id, "apply");
    assert.equal(applied.status, "applied");
    assert.match(fs.readFileSync(path.join(skillsDir, "skill-a", "SKILL.md"), "utf8"), /Ordered current guidance/);
    assert.match(fs.readFileSync(path.join(skillsDir, "skill-a", "evolution.md"), "utf8"), new RegExp(ready.id));

    const stale = createSkillMaintenanceJob("skill-maintenance");
    saveSkillMaintenanceJob({ ...stale, status: "ready", updated_at: new Date().toISOString(), summary: "No changes", inspections: [], changes: [], worker_count: 1 });
    fs.appendFileSync(path.join(skillsDir, "skill-b", "SKILL.md"), "\nChanged during review.\n");
    assert.throws(() => resolveSkillMaintenanceJob("skill-maintenance", stale.id, "apply"), /stale/);
    assert.equal(readSkillMaintenanceJob(stale.id).status, "stale");
  } finally {
    if (previousSkillsDir === undefined) delete process.env.DREAMCUT_SKILLS_DIR;
    else process.env.DREAMCUT_SKILLS_DIR = previousSkillsDir;
    if (previousExecutable === undefined) delete process.env.DREAMCUT_CODEX_EXECUTABLE;
    else process.env.DREAMCUT_CODEX_EXECUTABLE = previousExecutable;
  }
});

test("opt-in auto-application activates future inferred or conflicting preferences without adopting old suggestions", () => {
  createProject("auto-style", "web");
  const profile = readEditingProfile();
  const oldId = randomUUID();
  profile.preferences.push({id:oldId,text:"An existing pending choice.",scope:"all",category:"Visuals",status:"suggested",origin:"retro",evidence:[],updated_at:new Date().toISOString()});
  profile.auto_apply_preferences = true;
  writeEditingProfile(profile);
  recordMemoryEvent("auto-style",{id:"new-choice",type:"correction",actor:"human",summary:"New choice"});
  recordMemoryEvent("auto-style",{id:"old-choice",type:"correction",actor:"human",summary:"Previous choice"});
  const record = createRetroCheckpoint("auto-style","auto-style-review",{timeline:readTimeline("auto-style")},false);
  acceptRetroOutput("auto-style",record,{summary:"A new personal choice",findings:[{category:"Visuals",lesson:"Prefer a gentle transition for this format.",scope:"vertical-social",disposition:"preference",evidence:["new-choice"],counterevidence:["old-choice"],reasoning:{basis:"inferred",confidence:"medium",rationale:"Bounded test inference",alternatives:["Project-specific choice"]}}]});
  const after = readEditingProfile();
  const learned = after.preferences.find(p=>p.text==="Prefer a gentle transition for this format.")!;
  assert.equal(learned.status,"active");
  assert.equal(learned.reasoning?.confidence,"medium");
  assert.equal(learned.evidence.length,2);
  assert.equal(after.preferences.find(p=>p.id===oldId)?.status,"suggested");
  assert.ok(effectivePreferences("future","9:16").some(p=>p.id===learned.id));
  assert.ok(!effectivePreferences("future","16:9").some(p=>p.id===learned.id));
  after.auto_apply_preferences=false; writeEditingProfile(after);
});
