import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { renderStyleProfile, syncStyleProfile } from "./style-profile";
import type { EditingPreference } from "./editing-memory";

const template = fs.readFileSync("templates/style/STYLE.md", "utf8");
const item = (status: EditingPreference["status"], text: string): EditingPreference => ({ id: status, text, status, scope: "project", project_id: "one-project", category: "Visuals", origin: "human", evidence: ["user-choice"], updated_at: "2026-09-19" });

test("one STYLE combines categories without promoting drafts or losing scope", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "user-profile-test-"));
  const rows: EditingPreference[] = [item("active", "Playful cutouts."), { ...item("active", "Use proposals."), category: "Workflow" }, { ...item("suggested", "Review export mixes."), category: "Delivery" }];
  const style = fs.readFileSync(syncStyleProfile(directory, rows), "utf8");
  assert.match(style, /Playful cutouts/);
  assert.match(style, /Use proposals\./);
  assert.doesNotMatch(style.split("## Developing ideas")[0], /Review export mixes/);
  assert.match(style, /project: one-project/);
  assert.match(style, /Evidence: user-choice/);
  assert.equal(fs.existsSync(path.join(directory, "USER.md")), false);
  const changed = rows.map(p => p.text === "Use proposals." ? { ...p, status: "retired" as const } : p);
  const revised = fs.readFileSync(syncStyleProfile(directory, changed), "utf8");
  assert.doesNotMatch(revised.split("## Retired")[0], /Use proposals\./);
  assert.match(revised, /Use proposals\./);
  fs.writeFileSync(path.join(directory, "USER.md"), "My own user document");
  syncStyleProfile(directory, rows);
  assert.equal(fs.readFileSync(path.join(directory, "USER.md"), "utf8"), "My own user document");
});

test("style projection separates active, suggested and retired guidance and preserves scopes", () => {
  const result = renderStyleProfile(template, [item("active", "Use clean graphics."), item("suggested", "Try Scratchpad."), item("retired", "Use all cutouts.")]);
  const approved = result.split("## Developing ideas")[0];
  assert.match(approved, /Use clean graphics/);
  assert.doesNotMatch(approved, /Try Scratchpad|Use all cutouts/);
  assert.match(result, /project: one-project/);
  assert.match(result, /Evidence: user-choice/);
});

test("template cannot promote or reinterpret placeholder-like preference text", () => {
  const result = renderStyleProfile(template, [item("active", "{{SUGGESTED_PREFERENCES}}")]);
  assert.match(result, /\{\{SUGGESTED_PREFERENCES\}\}/);
  assert.throws(() => renderStyleProfile("unrecognized", []), /Unknown/);
});

test("scaffold is repeatable, syncs approved changes, and preserves unrelated personal files", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "style-profile-test-"));
  const file = syncStyleProfile(directory, []);
  assert.equal(fs.readFileSync(file, "utf8"), renderStyleProfile(template, []));
  syncStyleProfile(directory, [item("active", "Keep faces readable.")]);
  assert.match(fs.readFileSync(file, "utf8"), /Keep faces readable/);
  fs.writeFileSync(file, "Hand-authored personal style");
  assert.throws(() => syncStyleProfile(directory, []), /preserve it/);
  assert.equal(fs.readFileSync(file, "utf8"), "Hand-authored personal style");
});
