import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject, readTimeline, writeTimeline } from "./store";
import { POST as createProposal } from "@/app/api/projects/[projectId]/timeline/proposals/route";
import { readProposal } from "./proposals";
import { timelineRevision } from "@/lib/agent/timeline-editor-agent-apply";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { memoryEvents } from "./editing-memory";
import { listPersonalStyles, savePersonalStyle, personalStyleSnapshot, styleInputSchema } from "./personal-styles";
import { validateEffectCatalog, effectRecipeSchema } from "../effects/recipes";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "personal-styles-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
test.after(() => fs.rmSync(root, { recursive: true, force: true }));
const input = { name: "Private caption style", description: "Readable white captions", bundles: [{ skill: "caption-craft", parameters: { font_size: 64, fill: "#ffffff", max_words: 4 } }], authorization: { kind: "explicit_request", instruction: "Save this as my Private caption style" } };

test("personal styles require explicit direction and reject invalid skill references", () => {
  createProject("styles", "web");
  const { authorization: _, ...silent } = input;
  assert.equal(styleInputSchema.safeParse(silent).success, false);
  assert.throws(() => savePersonalStyle("styles", { ...input, bundles: [{ skill: "missing-skill", parameters: { x: 1 } }] }), /Unavailable skill/);
  assert.throws(() => savePersonalStyle("styles", { ...input, bundles: [{ skill: "caption-craft", parameters: {} }] }), /explicit parameters/);
  assert.throws(() => savePersonalStyle("styles", { ...input, bundles: [{ skill: "caption-craft", recipe_id: "FX-08", parameters: { x: 1 } }] }), /unavailable/);
});
test("style saves retain source, immutable revisions and values without editing a timeline or leaking into its ledger", () => {
  const timeline = readTimeline("styles");
  const first = savePersonalStyle("styles", input);
  const pinned = personalStyleSnapshot(first.id, 1);
  assert.deepEqual(pinned.style.bundles, input.bundles);
  assert.match(pinned.sha256, /^[a-f0-9]{64}$/);
  assert.equal(listPersonalStyles().length, 1);
  const next = savePersonalStyle("styles", { ...input, name: "Renamed", bundles: [{ skill: "caption-craft", parameters: { font_size: 72 } }] }, { id: first.id, expected_revision: 1 });
  assert.equal(next.revision, 2);
  assert.deepEqual(next.source_edit, first.source_edit);
  assert.throws(() => personalStyleSnapshot(first.id, 1), /Style changed/);
  assert.throws(() => savePersonalStyle("styles", input, { id: first.id, expected_revision: 1 }), /Style changed/);
  const old = JSON.parse(fs.readFileSync(path.join(root, "profile/personal-styles/revisions", first.id, "1.json"), "utf8"));
  assert.deepEqual(old, first);
  assert.deepEqual(readTimeline("styles"), timeline);
  const ledger = JSON.stringify(memoryEvents("styles"));
  assert.ok(ledger.includes("style.saved"));
  assert.ok(!ledger.includes(input.name));
  assert.ok(!ledger.includes("font_size"));
});
test("catalog packages actual artifacts with reciprocal skill evidence; partial entries cannot claim completion", () => {
  const catalog = validateEffectCatalog();
  assert.ok(catalog.entries.length >= 14);
  for (const id of ["FX-08", "FX-SCRATCHPAD"]) {
    const recipe = catalog.entries.find(e => e.catalog_id === id)!.recipe;
    assert.equal(recipe.status, "partial");
    assert.ok(recipe.recreation);
    assert.equal(effectRecipeSchema.safeParse({ ...recipe, status: "complete" }).success, false);
    assert.equal(effectRecipeSchema.safeParse({ ...recipe, recreation: null }).success, false);
  }
});
test("catalog validation rejects changed artifact bytes and orphan skill evidence", () => {
  const dir = path.join(root, "catalog-fixture");
  const catalog = validateEffectCatalog();
  const entry = structuredClone(catalog.entries.find(e => e.catalog_id === "FX-08")!);
  const recipe = entry.recipe;
  fs.mkdirSync(path.join(dir, "docs/effects"), { recursive: true });
  fs.mkdirSync(path.join(dir, ".agents/skills", recipe.skill, "references"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".agents/skills", recipe.skill, "SKILL.md"), "references/effect-evidence.json");
  for (const item of [recipe.reference, recipe.recreation!, ...recipe.evidence.before, ...recipe.evidence.after]) {
    const dest = path.resolve(dir, "docs/effects", item.path);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.resolve("docs/effects", item.path), dest);
  }
  const receiptFile = path.resolve(dir, "docs/effects", recipe.evidence_path);
  const receipt = { entries: [{ catalog_id: entry.catalog_id, catalog: `../../../../docs/effects/catalog.json#${entry.catalog_id}`, recipe }] };
  fs.writeFileSync(receiptFile, JSON.stringify(receipt));
  fs.writeFileSync(path.join(dir, "docs/effects/catalog.json"), JSON.stringify({ schema_version: 1, entries: [entry] }));
  validateEffectCatalog(dir);
  receipt.entries.push({ ...receipt.entries[0], catalog_id: "FX-ORPHAN" });
  fs.writeFileSync(receiptFile, JSON.stringify(receipt));
  assert.throws(() => validateEffectCatalog(dir), /Orphan/);
  receipt.entries.pop(); fs.writeFileSync(receiptFile, JSON.stringify(receipt));
  fs.appendFileSync(path.resolve(dir, "docs/effects", recipe.reference.path), "changed");
  assert.throws(() => validateEffectCatalog(dir), /hash mismatch/);
});

test("style reuse pins a local revision on a pending proposal, never applies it, and rejects stale style versions", async () => {
  const id = "style-proposal"; createProject(id, "web");
  const now = new Date().toISOString();
  const element: TimelineElement = { id: "11111111-1111-4111-8111-111111111111", project_id: id, type: "still", source_url: "/fixture.png", props: {}, beat_id: null, character_id: null, timeline_start: 0, duration: 4, lane_key: "visual_0", lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null, created_at: now, updated_at: now };
  writeTimeline(id, { elements: [element], transitions: [] }, "test-fixture");
  const style = savePersonalStyle(id, { ...input, bundles: [{ skill: "visual-timing", parameters: { duration: 3 } }] });
  const proposal = { schema_version: 2, project_id: id, expected_revision: timelineRevision(id), mode: "workshop", decision: "propose", summary: "Use the saved three-second timing", assumptions: [], unresolved_gaps: [], caps: { max_mutations: 1, requested_mutations: 1, max_renders: 0 }, options: [{ id: "timing", label: "Timing", recommended: true, summary: "Hold for three seconds", requested_mutations: 1, operations: [{ element_id: element.id, patch: { duration: 3 } }] }] };
  const request = () => new Request("http://localhost/api/proposals", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ proposal, personal_style: {id: style.id, revision: 1} }) });
  const before = readTimeline(id);
  const response = await createProposal(request(), {params:Promise.resolve({projectId:id})});
  assert.equal(response.status, 201, await response.clone().text());
  const body = await response.json();
  const stored = readProposal(id, body.proposal_id);
  assert.equal(stored.status, "pending");
  assert.deepEqual(stored.personal_style, { id: style.id, revision: 1, sha256: personalStyleSnapshot(style.id, 1).sha256 });
  assert.equal(JSON.stringify(stored).includes(input.name), false);
  assert.deepEqual(readTimeline(id), before);
  savePersonalStyle(id, input, { id: style.id, expected_revision: 1 });
  const stale = await createProposal(request(), {params:Promise.resolve({projectId:id})});
  assert.equal(stale.status, 409);
  assert.deepEqual(readTimeline(id), before);
});
