import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { emptyStoryboard, storyboardContentSchema } from "./model";
import { saveScriptPassage, moveScriptPassage, readScriptDocument, saveScriptDocument, applyScriptWrite, storyboardScriptWriteSchema, linkScriptVisuals, unlinkScriptVisual, editScriptText, applyScriptLinks, storyboardScriptLinkSchema } from "./script";
import { createProject, readTimeline } from "../local-store/store";
import { readStoryboard, updateStoryboard } from "../local-store/storyboard";

test("script passages preserve independent media and reject conflicting edits", () => {
  const a = { id: randomUUID(), title: "Opening", text: "First line.\nSecond line." };
  const b = { id: randomUUID(), title: "Ending", text: "Goodbye." };
  const legacy = emptyStoryboard();
  assert.equal(storyboardContentSchema.parse(legacy).script, undefined);
  const board = saveScriptPassage(saveScriptPassage(legacy, a), b);
  const moved = moveScriptPassage(board, b.id, -1);
  assert.deepEqual(moved.script?.map(p => p.id), [b.id, a.id]);
  assert.strictEqual(moved.shots, legacy.shots);
  assert.strictEqual(moved.sources, legacy.sources);
  const changed = saveScriptPassage(board, { ...a, text: "Another writer" }, a);
  assert.throws(() => saveScriptPassage(changed, { ...a, text: "My draft" }, a), /changed/);
  assert.throws(() => saveScriptPassage(legacy, a, a), /changed/);
  assert.equal(storyboardContentSchema.safeParse({ ...board, script: [a, a] }).success, false);
});

test("script-only saves persist, undo and redo without touching the timeline", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-script-test-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("script-fixture", "web");
    const before = readTimeline("script-fixture");
    const passage = { id: randomUUID(), title: "Opening", text: "A script before media." };
    const legacy = saveScriptPassage(emptyStoryboard(), passage);
    const content = saveScriptDocument(legacy, { ...readScriptDocument(legacy), markdown: "# Freeform notes", marks: [] }, readScriptDocument(legacy));
    const saved = await updateStoryboard("script-fixture", { action: "save", revision: 0, content });
    assert.deepEqual(readStoryboard("script-fixture").content.script, [passage]);
    await assert.rejects(updateStoryboard("script-fixture", { action: "save", revision: 0, content }), /changed/);
    const undone = await updateStoryboard("script-fixture", { action: "undo", revision: saved.revision });
    assert.equal(undone.content.script, undefined);
    const redone = await updateStoryboard("script-fixture", { action: "redo", revision: undone.revision });
    assert.deepEqual(redone.content.scriptDocument, content.scriptDocument);
    assert.deepEqual(readTimeline("script-fixture"), before);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("document marks follow outside edits, flag replaced words, and can be repaired", async () => {
  const { readScriptDocument, markScriptRange, editScriptText, saveScriptDocument, scriptDocumentSchema } = await import("./script");
  const board = emptyStoryboard(), original = readScriptDocument(board);
  let doc = markScriptRange({ ...original, enabled: true, markdown: "Intro. Key point. End." }, { id: randomUUID(), label: "Point", start: 7, end: 17 });
  doc = editScriptText(doc, "New intro. Key point. End.");
  assert.equal(doc.markdown.slice(doc.marks[0].start, doc.marks[0].end), "Key point.");
  assert.equal(doc.marks[0].needsReview, false);
  doc = editScriptText(doc, "New intro. Better point. End.");
  assert.equal(doc.marks[0].needsReview, true);
  assert.equal(doc.marks[0].quote, "Key point.");
  doc = markScriptRange(doc, { ...doc.marks[0], start: 11, end: 24 });
  assert.equal(doc.marks[0].quote, "Better point.");
  assert.equal(doc.marks[0].needsReview, false);
  const saved = saveScriptDocument(board, doc, original);
  assert.strictEqual(saved.shots, board.shots);
  assert.throws(() => saveScriptDocument(saved, original, original), /changed elsewhere/);
  const hidden = saveScriptDocument(saved, { ...doc, enabled: false }, doc);
  assert.equal(readScriptDocument(hidden).markdown, doc.markdown);
  assert.deepEqual(readScriptDocument(hidden).marks, doc.marks);
  const cleared = editScriptText(doc, "");
  assert.equal(cleared.marks[0].needsReview, true);
  assert.equal(scriptDocumentSchema.safeParse(cleared).success, true);
});

test("agent script writes fill, append and mark sections without moving existing marks", () => {
  const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
  let n = 0; const id = () => ids[n++];
  const filled = applyScriptWrite(emptyStoryboard(), storyboardScriptWriteSchema.parse({ revision: 0, blocks: [{ text: "Welcome to the recap." }, { text: "Thursday tells the story.", section: "Thursday" }] }), id);
  const doc = readScriptDocument(filled);
  assert.equal(doc.markdown, "Welcome to the recap.\n\nThursday tells the story.");
  assert.deepEqual(doc.marks.map(m => [m.label, doc.markdown.slice(m.start, m.end)]), [["Thursday", "Thursday tells the story."]]);
  const appended = readScriptDocument(applyScriptWrite(filled, storyboardScriptWriteSchema.parse({ revision: 1, blocks: [{ text: "See you next week.", section: "Close" }] }), id));
  assert.equal(appended.markdown, `${doc.markdown}\n\nSee you next week.`);
  assert.deepEqual(appended.marks.map(m => m.quote), ["Thursday tells the story.", "See you next week."]);
  const replaced = readScriptDocument(applyScriptWrite(filled, storyboardScriptWriteSchema.parse({ revision: 1, mode: "replace", blocks: [{ text: "Only this." }] })));
  assert.deepEqual([replaced.markdown, replaced.marks.length], ["Only this.", 0]);
  assert.throws(() => applyScriptWrite(filled, storyboardScriptWriteSchema.parse({ revision: 1, blocks: [{ text: "x".repeat(20000) }, ...Array.from({ length: 5 }, () => ({ text: "y".repeat(20000) }))] })), /at most 100000/);
});

test("visuals link to sections, ranges become sections, and links survive text edits", () => {
  const ids = ["33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444"]; let n = 0;
  const doc = readScriptDocument(applyScriptWrite(emptyStoryboard(), storyboardScriptWriteSchema.parse({ revision: 0, blocks: [{ text: "Thursday tells the story.", section: "Thursday" }, { text: "Oil spiked on Friday." }] }), () => ids[n++]));
  const linked = linkScriptVisuals(doc, [{ id: ids[0] }, { start: 27, end: 48 }], ["sources/spy.png", "sources/rsp.png"], false, () => ids[n++]);
  assert.deepEqual(linked.marks.map(m => [m.label, m.visuals]), [["Thursday", ["sources/spy.png", "sources/rsp.png"]], ["Oil spiked on Friday.", ["sources/spy.png", "sources/rsp.png"]]]);
  assert.deepEqual(linkScriptVisuals(linked, [{ id: ids[0] }], ["sources/spy.png"]).marks[0].visuals, ["sources/spy.png", "sources/rsp.png"]);
  assert.deepEqual(linkScriptVisuals(linked, [{ id: ids[0] }], ["sources/oil.png"], true).marks[0].visuals, ["sources/oil.png"]);
  assert.deepEqual(unlinkScriptVisual(linked, ids[0], "sources/spy.png").marks[0].visuals, ["sources/rsp.png"]);
  assert.deepEqual(editScriptText(linked, `Intro. ${linked.markdown}`).marks[0].visuals, ["sources/spy.png", "sources/rsp.png"]);
  assert.throws(() => linkScriptVisuals(doc, [{ id: "55555555-5555-4555-8555-555555555555" }], ["sources/spy.png"]), /no longer exists/);
});

test("agent links check the quoted text and add linked visuals to Media", () => {
  const board = applyScriptWrite(emptyStoryboard(), storyboardScriptWriteSchema.parse({ revision: 0, blocks: [{ text: "Oil spiked on Friday." }] }));
  const assets = [{ source: "sources/oil.png", kind: "image" }, { source: "sources/voice.m4a", kind: "audio" }];
  const next = applyScriptLinks(board, storyboardScriptLinkSchema.parse({ revision: 1, links: [{ start: 0, end: 10, quote: "Oil spiked", label: "Oil", visuals: ["sources/oil.png"] }] }), assets);
  assert.deepEqual(readScriptDocument(next).marks.map(m => [m.label, m.quote, m.visuals]), [["Oil", "Oil spiked", ["sources/oil.png"]]]);
  assert.deepEqual(next.sources, ["sources/oil.png"]);
  assert.throws(() => applyScriptLinks(board, storyboardScriptLinkSchema.parse({ revision: 1, links: [{ start: 0, end: 10, quote: "Gas spiked", visuals: ["sources/oil.png"] }] }), assets), /changed/);
  assert.throws(() => applyScriptLinks(board, storyboardScriptLinkSchema.parse({ revision: 1, links: [{ start: 0, end: 3, quote: "Oil", visuals: ["sources/voice.m4a"] }] }), assets), /audio/);
});
