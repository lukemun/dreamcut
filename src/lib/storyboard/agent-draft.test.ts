import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { emptyStoryboard, storyboardUnits, type StoryboardAsset, type StoryboardContent } from "./model";
import { applyStoryboardDraft, storyboardAgentSummary, storyboardDraftSchema, StoryboardDraftError } from "./agent-draft";

const video = (source: string, duration = 30, ready = true): StoryboardAsset => ({ source, name: source.split("/").pop()!, kind: "video", duration, ready, url: `/m/${source}`, generated: false });
const assets: StoryboardAsset[] = [
  video("sources/talk.mp4"),
  { source: "sources/product.jpg", name: "product.jpg", kind: "image", ready: true, url: "/m/p", generated: false },
  { source: "audio/music.mp3", name: "music.mp3", kind: "audio", duration: 60, ready: true, url: "/m/a", generated: false },
  video("sources/raw.mov", 20, false),
];
const draft = (beats: unknown, extra: object = {}) => storyboardDraftSchema.parse({ revision: 0, beats, ...extra });
const talk = (start: number, end: number, label = "Shot", more: object = {}) => ({ source: "sources/talk.mp4", start, end, label, ...more });

test("a draft becomes named beats of source-window shots with notes, text and transitions", () => {
  const board = applyStoryboardDraft(emptyStoryboard(), draft([
    { name: "Intro", shots: [talk(0, 4.2, "Hook", { note: "Why I quit", text: "I quit." }), talk(4.2, 6, "Setup")] },
    { shots: [{ source: "sources/product.jpg", start: 0, end: 1.5, label: "Product still", transition_into: "glitch" }] },
  ]), assets, randomUUID);
  assert.equal(board.mode, "freeform");
  assert.deepEqual(board.sources.sort(), ["sources/product.jpg", "sources/talk.mp4"]);
  assert.equal(board.groups.length, 1);
  assert.equal(board.groups[0].name, "Intro");
  const units = storyboardUnits(board);
  assert.equal(units.length, 2, "named beat stays together; unnamed beat is a single unit");
  assert.deepEqual(units[0].map(s => [s.label, s.start, s.duration, s.note, s.text]), [["Hook", 0, 4.2, "Why I quit", "I quit."], ["Setup", 4.2, 1.8, "", ""]]);
  assert.equal(units[1][0].transitionNote, "glitch");
  assert.equal(units[1][0].groupId, undefined);
});

test("replace swaps the story, append keeps it, and the reference plan is preserved", () => {
  const first = applyStoryboardDraft(emptyStoryboard(), draft([{ name: "A", shots: [talk(0, 2)] }]), assets, randomUUID);
  const withRef: StoryboardContent = { ...first, mode: "reference" };
  const replaced = applyStoryboardDraft(withRef, draft([{ name: "B", shots: [talk(2, 3)] }]), assets, randomUUID);
  assert.deepEqual(replaced.shots.map(s => s.start), [2]);
  assert.deepEqual(replaced.groups.map(g => g.name), ["B"]);
  assert.equal(replaced.mode, "freeform");
  const appended = applyStoryboardDraft(first, draft([{ name: "B", shots: [talk(2, 3)] }], { mode: "append" }), assets, randomUUID);
  assert.deepEqual(appended.shots.map(s => s.start), [0, 2]);
  assert.deepEqual(appended.groups.map(g => g.name), ["A", "B"]);
});

test("unusable sources and windows are refused with the shot named", () => {
  const refuse = (beats: unknown, pattern: RegExp) => assert.throws(() => applyStoryboardDraft(emptyStoryboard(), draft(beats), assets, randomUUID), (e: Error) => e instanceof StoryboardDraftError && pattern.test(e.message));
  refuse([{ shots: [{ source: "sources/missing.mp4", start: 0, end: 1, label: "x" }] }], /Beat 1, shot 1: unknown source/);
  refuse([{ shots: [talk(0, 1), { source: "audio/music.mp3", start: 0, end: 1, label: "x" }] }], /Beat 1, shot 2: audio/);
  refuse([{ shots: [{ source: "sources/raw.mov", start: 0, end: 1, label: "x" }] }], /still preparing/);
  refuse([{ shots: [talk(28, 31)] }], /30\.00s long/);
  assert.throws(() => draft([{ shots: [talk(1, 1.01)] }]), /one frame after start/);
  assert.throws(() => draft([{ shots: [{ ...talk(0, 1), clip: true }] }]), /Unrecognized key/);
});

test("the agent summary lists beats, shots on the source clock and usable sources", () => {
  const content = applyStoryboardDraft(emptyStoryboard(), draft([{ name: "Intro", shots: [talk(1, 3.5, "Hook", { transition_into: "cut" })] }]), assets, randomUUID);
  const summary = storyboardAgentSummary({ revision: 7, content, canUndo: true, canRedo: false }, assets);
  assert.equal(summary.revision, 7);
  assert.deepEqual(summary.beats.map(b => [b.name, b.shots.map(s => [s.label, s.start, s.end, s.transition_into])]), [["Intro", [["Hook", 1, 3.5, "cut"]]]]);
  assert.equal(summary.sources.find(s => s.source === "sources/raw.mov")?.ready, false);
});
