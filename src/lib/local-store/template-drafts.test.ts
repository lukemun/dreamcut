import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createTemplateDraft, deleteTemplateDraft, listTemplateDrafts, resolveTemplateDraftMedia, saveTemplateDraft, updateTemplateDraft } from "./template-drafts";
import { readUserEffectRecipes, resolveUserEffectMedia, userGuideEffects } from "./user-effect-recipes";

const video = Buffer.from("not really a video, but unchanged bytes");
function profile(t: test.TestContext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "template-drafts-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test("a dropped video becomes a draft holding an unchanged copy", t => {
  const dir = profile(t);
  const draft = createTemplateDraft({ buffer: video, originalName: "whip_pan-reference.MOV" }, dir);
  assert.equal(draft.title, "whip pan reference");
  assert.equal(draft.stage, "new");
  assert.deepEqual(fs.readFileSync(resolveTemplateDraftMedia(draft.id, dir)!.file), video);
  assert.equal(resolveTemplateDraftMedia(draft.id, dir)!.contentType, "video/quicktime");
  assert.deepEqual(listTemplateDrafts(dir).map(item => item.id), [draft.id]);
});

test("only videos are accepted", t => {
  const dir = profile(t);
  assert.throws(() => createTemplateDraft({ buffer: video, originalName: "notes.txt" }, dir), /MP4, MOV or WebM/);
  assert.throws(() => createTemplateDraft({ buffer: Buffer.alloc(0), originalName: "a.mp4" }, dir), /empty/);
  assert.deepEqual(listTemplateDrafts(dir), []);
});

test("the creator marks the effect, says what to copy and hands it to an agent", t => {
  const dir = profile(t);
  const { id } = createTemplateDraft({ buffer: video, originalName: "a.mp4" }, dir);
  let draft = updateTemplateDraft(id, { note: "the glitchy cut", mark: { start: 1.5, end: 3 } }, dir);
  assert.deepEqual(draft.mark, { start: 1.5, end: 3 });
  assert.throws(() => updateTemplateDraft(id, { mark: { start: 3, end: 1 } }, dir));
  draft = updateTemplateDraft(id, { request: true }, dir, new Date("2026-10-22T10:00:00Z"));
  assert.equal(draft.stage, "requested");
  assert.equal(draft.requested_at, "2026-10-22T10:00:00.000Z");
  assert.equal(updateTemplateDraft(id, { mark: null }, dir).mark, undefined);
  assert.throws(() => updateTemplateDraft(id, { stage: "new" }, dir));
});

test("discarding removes only that draft", t => {
  const dir = profile(t);
  const keep = createTemplateDraft({ buffer: video, originalName: "keep.mp4" }, dir);
  const drop = createTemplateDraft({ buffer: video, originalName: "drop.mp4" }, dir);
  deleteTemplateDraft(drop.id, dir);
  assert.deepEqual(listTemplateDrafts(dir).map(item => item.id), [keep.id]);
  assert.throws(() => deleteTemplateDraft("../keep", dir), /Unknown draft/);
});

test("saving adds a reference card to the creator's templates and clears the draft", async t => {
  const dir = profile(t);
  const { id } = createTemplateDraft({ buffer: video, originalName: "Glitch Reveal.mp4" }, dir);
  updateTemplateDraft(id, { note: "the RGB split on the cut", mark: { start: 2, end: 4 } }, dir);
  const { template_id } = await saveTemplateDraft(id, dir, async () => Buffer.from("jpeg"));
  assert.equal(template_id, "user-glitch-reveal");
  const [recipe] = readUserEffectRecipes(dir).recipes;
  assert.equal(recipe.title, "Glitch Reveal");
  assert.equal(recipe.description, "the RGB split on the cut");
  assert.equal(recipe.reference.url, undefined);
  assert.equal(recipe.reference.source_start_seconds, 2);
  assert.equal(recipe.reference.source_end_seconds, 4);
  assert.deepEqual(recipe.reference.playback_window, {start: 2, end: 4});
  assert.match(recipe.prompt, /Study only 2–4 seconds/);
  assert.match(userGuideEffects(dir)[0].video!, /#t=2,4$/);
  assert.deepEqual(fs.readFileSync(resolveUserEffectMedia("glitch-reveal", dir)!.file), video);
  assert.ok(resolveUserEffectMedia("glitch-reveal", dir, "poster"));
  assert.equal(userGuideEffects(dir)[0].origin, "user");
  assert.deepEqual(listTemplateDrafts(dir), []);

  const second = createTemplateDraft({ buffer: video, originalName: "Glitch Reveal.mp4" }, dir);
  assert.equal((await saveTemplateDraft(second.id, dir, async () => { throw new Error("no ffmpeg"); })).template_id, "user-glitch-reveal-2");
  assert.equal(readUserEffectRecipes(dir).recipes[1].reference.poster, undefined);
  assert.equal(readUserEffectRecipes(dir).recipes[1].reference.source_end_seconds, undefined);
});


test("overlapping poster preparation preserves both template saves", async t => {
  const dir = profile(t);
  const first = createTemplateDraft({ buffer: video, originalName: "Same title.mp4" }, dir);
  const second = createTemplateDraft({ buffer: video, originalName: "Same title.mp4" }, dir);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const firstSave = saveTemplateDraft(first.id, dir, async () => { await pending; return Buffer.from("first"); });
  const secondSave = await saveTemplateDraft(second.id, dir, async () => Buffer.from("second"));
  release();
  const savedFirst = await firstSave;
  assert.notEqual(savedFirst.template_id, secondSave.template_id);
  assert.equal(readUserEffectRecipes(dir).recipes.length, 2);
  assert.equal(listTemplateDrafts(dir).length, 0);
});


test("saving preserves the entire maximum-length note in the recreation prompt", async t => {
  const dir = profile(t);
  const {id} = createTemplateDraft({buffer:video,originalName:"Demo.mp4"},dir);
  const note = "n".repeat(2000);
  updateTemplateDraft(id,{note},dir);
  await saveTemplateDraft(id,dir,async()=>Buffer.from("jpeg"));
  assert.ok(readUserEffectRecipes(dir).recipes[0].prompt.endsWith(note));
});
