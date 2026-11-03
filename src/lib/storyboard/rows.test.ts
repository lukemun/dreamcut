import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { emptyStoryboard, storyboardContentSchema, type StoryboardAsset } from "./model";
import { applyTranscript, insertRow, newRow, scriptOffset, splitRowAt, spokenWord } from "./rows";

const video: StoryboardAsset = { source: "talk.mp4", name: "talk.mp4", kind: "video", url: "/talk.mp4", duration: 6, ready: true, generated: false };
const words = [
  { text: "Hi,", start: 0.1, end: 0.4 }, { text: "welcome", start: 0.4, end: 0.9 }, { text: "back.", start: 0.9, end: 1.4 },
  { text: "Today", start: 2.0, end: 2.4 }, { text: "we", start: 2.4, end: 2.6 }, { text: "edit.", start: 2.6, end: 3.2 },
];

test("a dropped video becomes one row of the whole video, and its transcript becomes the row's text", () => {
  const row = newRow(video, randomUUID());
  assert.equal(row.duration, 6);
  const board = insertRow(emptyStoryboard(), applyTranscript(row, words));
  assert.deepEqual(board.sources, ["talk.mp4"]);
  assert.equal(board.shots[0].script, "Hi, welcome back. Today we edit.");
  storyboardContentSchema.parse(board);
  assert.throws(() => newRow({ ...video, kind: "audio" }, randomUUID()), /Audio stays in Media/);
});

test("splitting at the playhead cuts in the nearest pause between words, and each row keeps its script", () => {
  const row = applyTranscript(newRow(video, randomUUID()), words);
  const board = insertRow(emptyStoryboard(), { ...row, visuals: [{ id: randomUUID(), source: "talk.mp4", start: 0, at: 4, duration: 1, label: "", note: "" }] });
  // Paused at 1.9s, just after "back." ends: the cut lands in that pause (1.7s), on a frame.
  const [first, second] = splitRowAt(board, row.id, 1.9, randomUUID()).shots;
  assert.equal(first.start, 0); assert.equal(first.duration, 1.7); assert.equal(second.start, 1.7); assert.equal(second.duration, 4.3);
  assert.equal(first.script, "Hi, welcome back."); assert.equal(second.script, "Today we edit.");
  assert.equal(first.words!.length, 3); assert.equal(second.words!.length, 3);
  // The visual keeps its moment in time: 4s into the video is 2.3s into the second row.
  assert.equal(first.visuals, undefined); assert.equal(second.visuals![0].at, 2.3);
  // Paused mid-word, the cut moves to the nearest pause instead of cutting the word.
  const mid = splitRowAt(board, row.id, 0.5, randomUUID()).shots;
  assert.equal(mid[0].script, "Hi,"); assert.equal(mid[1].script, "welcome back. Today we edit.");
  storyboardContentSchema.parse(splitRowAt(board, row.id, 1.9, randomUUID()));
  // Without a transcript the cut is on the frame and the script stays with the first part.
  const plain = insertRow(emptyStoryboard(), { ...newRow(video, randomUUID()), script: "My notes" });
  const [a, b] = splitRowAt(plain, plain.shots[0].id, 2.51, randomUUID()).shots;
  assert.equal(a.duration, 2.5); assert.equal(a.script, "My notes"); assert.equal(b.script, undefined);
  assert.throws(() => splitRowAt(plain, plain.shots[0].id, 0, randomUUID()), /inside this row/);
});

test("the spoken word follows playback and is empty in pauses", () => {
  assert.equal(spokenWord(words, 0.5), 1);
  assert.equal(spokenWord(words, 1.8), -1);
  assert.equal(spokenWord(words, 2.1), 3);
  assert.equal(scriptOffset("Hi,  welcome back.", 1), 5);
});
