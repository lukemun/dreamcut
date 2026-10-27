import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { readEditingProfile, writeEditingProfile, readPersonalStyleDocument, savePersonalStyleDocument, effectivePreferences, type EditingPreference } from "./editing-memory";
import { derivedStyle, initialStyle, styleBlocks, withStyleLock } from "./style-document";
import { spawn, spawnSync } from "node:child_process";
const item = (text: string, extra: Partial<EditingPreference> = {}): EditingPreference => ({ id: randomUUID(), text, scope: "all", status: "active", category: "Visuals", origin: "human", updated_at: "2026-01-01", evidence: ["kept-evidence"], ...extra });
function setup(preferences: EditingPreference[] = []) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "style-document-"));
  process.env.DREAMCUT_PROFILE_DIR = directory;
  fs.writeFileSync(path.join(directory,"preferences.json"), JSON.stringify({version:1,learning:true,agent_retros:true,preferences}));
  return directory;
}
test("migrates active personal defaults only and preserves legacy data, scope and provenance", () => {
  const a = item("Keep complete silhouettes.");
  const vertical = item("Large captions.", {category:"Captions",scope:"vertical-social"});
  const project = item("Blue only here.",{scope:"project",project_id:"demo"});
  const suggestion = item("Try grain.",{status:"suggested"});
  const retired = item("Use red.",{status:"retired"});
  const directory=setup([a,vertical,project,suggestion,retired]);
  fs.writeFileSync(path.join(directory,"STYLE.md"),"<!-- openedit-style-projection:v1 -->\nold projection");
  const profile=readEditingProfile(), doc=readPersonalStyleDocument();
  assert.match(doc.markdown,/Keep complete silhouettes/);
  assert.doesNotMatch(doc.markdown,/Blue only here|Try grain|Use red/);
  assert.deepEqual(profile.preferences.find(p=>p.id===a.id)?.evidence,a.evidence);
  assert.equal(effectivePreferences("demo","16:9").some(p=>p.text===vertical.text),false);
  assert.equal(effectivePreferences("demo","9:16").some(p=>p.text===vertical.text),true);
  assert.equal(effectivePreferences("other","16:9").some(p=>p.text===project.text),false);
  assert.match(fs.readFileSync(path.join(directory,"style-history","migration.json"),"utf8"),/old projection/);
});
test("file edits become authoritative, survive settings writes, and stale saves fail", () => {
  const directory=setup([item("Old rule.")]);
  const stale=readEditingProfile();
  const doc=readPersonalStyleDocument();
  fs.writeFileSync(path.join(directory,"STYLE.md"),"# My style\n\n## Avoid\n\nRapid flashing.\n");
  const active=effectivePreferences("demo","9:16");
  assert.equal(active.some(p=>p.text.includes("Old rule")),false);
  assert.equal(active.some(p=>p.text==="Avoid:\nRapid flashing."),true);
  assert.throws(()=>writeEditingProfile(stale),/changed elsewhere/);
  assert.throws(()=>savePersonalStyleDocument("overwrite",doc.revision),/changed elsewhere/);
  const latest=readEditingProfile();latest.learning=false;writeEditingProfile(latest);
  assert.match(readPersonalStyleDocument().markdown,/## Avoid/);
  const previous=readPersonalStyleDocument();
  const next=savePersonalStyleDocument("# My style\n\nNew direction.",previous.revision);
  assert.equal(effectivePreferences("demo","9:16")[0]?.text,"New direction.");
  savePersonalStyleDocument(previous.markdown,next.revision);
  assert.equal(readPersonalStyleDocument().markdown,previous.markdown);
});
test("compatibility preference edits preserve custom content and only modify their own block", () => {
  setup([item("First rule."),item("Second rule.")]);
  const profile=readEditingProfile();
  const first=profile.preferences.find(p=>p.text==="First rule.")!;first.status="retired";
  profile.preferences.push(item("New vertical rule.",{scope:"vertical-social"}));
  writeEditingProfile(profile);
  assert.doesNotMatch(readPersonalStyleDocument().markdown,/First rule/);
  assert.match(readPersonalStyleDocument().markdown,/Second rule/);
  assert.equal(effectivePreferences("demo","16:9").some(p=>p.text==="New vertical rule."),false);
  assert.equal(effectivePreferences("demo","9:16").some(p=>p.text==="New vertical rule."),true);
});
test("headings end vertical scope correctly and do not promote pending instructions", () => {
  const rows=[item("Approved."),item("Pending.",{status:"suggested"})];
  const text=initialStyle(rows)+"\n## Vertical videos\n\nPortrait only.\n\n## Visuals\n\nEverywhere.\n";
  const derived=derivedStyle(text,rows);
  assert.equal(derived.find(p=>p.text==="Pending.")?.status,"suggested");
  assert.equal(derived.find(p=>p.text==="Portrait only.")?.scope,"vertical-social");
  assert.equal(derived.find(p=>p.text==="Everywhere.")?.scope,"all");
  assert.equal(styleBlocks("# My style\n\n```\n## Not a heading\n```",[]).length,1);
});
test("existing hand-authored Markdown is preserved and missing migrated documents fail visibly", () => {
  const directory=setup([item("Old JSON.")]);
  fs.writeFileSync(path.join(directory,"STYLE.md"),"# My style\n\nMy own words.");
  assert.equal(readEditingProfile().preferences.some(p=>p.text==="Old JSON."),false);
  assert.match(readPersonalStyleDocument().markdown,/My own words/);
  const fresh=setup();readEditingProfile();fs.unlinkSync(path.join(fresh,"STYLE.md"));
  assert.throws(()=>readEditingProfile(),/STYLE.md is missing/);
});

test("new preferences join their existing heading instead of repeating it", () => {
  setup([item("Blur the whole frame.")]);
  const profile=readEditingProfile();
  profile.preferences.push(item("Keep captions low.",{category:"Captions"}),item("Post stand-alone cards first.",{category:"Workflow"}),item("Short vertical hooks.",{scope:"vertical-social",category:"Pacing"}));
  writeEditingProfile(profile);
  const markdown=readPersonalStyleDocument().markdown;
  for (const heading of ["Text and captions","How I like to work","Visuals and transitions"]) assert.equal(markdown.split(`## ${heading}\n`).length-1,1,heading);
  assert.match(markdown,/## Text and captions\n\nKeep captions low\.\n\n## Visuals and transitions\n\nBlur the whole frame\.\n/);
  assert.match(markdown,/## How I like to work\n\nPost stand-alone cards first\.\n/);
  assert.match(markdown,/## Vertical videos\n\n### Pacing and storytelling\n\nShort vertical hooks\.\n$/);
  const again=readEditingProfile();
  again.preferences.push(item("Second vertical rule.",{scope:"vertical-social",category:"Pacing"}));
  writeEditingProfile(again);
  const after=readPersonalStyleDocument().markdown;
  assert.equal(after.split("## Vertical videos\n").length-1,1);
  assert.match(after,/### Pacing and storytelling\n\nShort vertical hooks\.\n\nSecond vertical rule\.\n$/);
  assert.equal(effectivePreferences("demo","9:16").filter(p=>/vertical/.test(p.text)).length,2);
  assert.equal(effectivePreferences("demo","16:9").some(p=>/vertical/.test(p.text)),false);
});

const lockDirectory = () => fs.mkdtempSync(path.join(os.tmpdir(), "style-lock-"));
const lockFile = (directory: string) => path.join(directory, ".style-write.lock");
const deadPid = () => {
  const child = spawnSync(process.execPath, ["-e", "process.stdout.write(String(process.pid))"], { encoding: "utf8" });
  return Number(child.stdout);
};
for (const [name, contents] of [["an empty lock", ""], ["a garbage pid", "not-a-pid"], ["a zero pid", "0"], ["a negative pid", "-1"], ["a dead pid", () => String(deadPid())]] as const) {
  test(`style lock treats ${name} as stale`, () => {
    const directory = lockDirectory();
    fs.writeFileSync(lockFile(directory), typeof contents === "function" ? contents() : contents);
    assert.equal(withStyleLock(directory, () => fs.readFileSync(lockFile(directory), "utf8")), String(process.pid));
    assert.deepEqual(fs.readdirSync(directory), []);
  });
}
test("style lock respects a live holder and stays held", () => {
  const directory = lockDirectory();
  fs.writeFileSync(lockFile(directory), String(process.pid));
  assert.throws(() => withStyleLock(directory, () => assert.fail("ran under a live lock")), /being saved elsewhere/);
  assert.equal(fs.readFileSync(lockFile(directory), "utf8"), String(process.pid));
  fs.unlinkSync(lockFile(directory));
  assert.throws(() => withStyleLock(directory, () => withStyleLock(directory, () => 0)), /being saved elsewhere/);
  assert.deepEqual(fs.readdirSync(directory), []);
});
test("concurrent style writers never hold the lock together, even while breaking a stale lock", async () => {
  const directory = lockDirectory();
  fs.writeFileSync(lockFile(directory), "");
  const log = path.join(directory, "writers.log");
  const writer = `
    const fs = require("node:fs");
    const { withStyleLock } = require(${JSON.stringify(path.join(import.meta.dirname, "style-document.ts"))});
    const log = ${JSON.stringify(log)};
    for (let i = 0; i < 20; i++) {
      try {
        withStyleLock(${JSON.stringify(directory)}, () => {
          fs.appendFileSync(log, "enter\\n");
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5);
          fs.appendFileSync(log, "exit\\n");
        });
      } catch (error) { if (!/being saved elsewhere/.test(error.message)) throw error; }
    }`;
  const exits = await Promise.all(Array.from({ length: 6 }, () => new Promise<number | null>(resolve => {
    spawn(process.execPath, ["--import", "tsx", "-e", writer], { stdio: "inherit" }).on("exit", resolve);
  })));
  assert.deepEqual(exits, Array(6).fill(0));
  const entries = fs.readFileSync(log, "utf8").trim().split("\n");
  assert.ok(entries.length >= 2);
  entries.forEach((entry, index) => assert.equal(entry, index % 2 ? "exit" : "enter", `writers overlapped at line ${index}`));
  assert.deepEqual(fs.readdirSync(directory), ["writers.log"]);
});
