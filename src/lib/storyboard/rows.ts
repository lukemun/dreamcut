import { insertStoryboardShot, type StoryboardAsset, type StoryboardContent, type StoryboardShot, type TranscriptWord } from "./model";

/**
 * The storyboard's rows: each row is one shot, its picture on the left and its words on the right.
 * A talking video starts as one row; splitting it at a moment in its playback makes two rows that share
 * the source, each with its own part of the video and its own script.
 */
const frames = (seconds: number) => Math.round(seconds * 30) / 30;
/** A photo row's starting length; a video row starts as the whole video. */
export const PHOTO_ROW_SECONDS = 3;

export function newRow(asset: StoryboardAsset, id: string): StoryboardShot {
  if (asset.kind === "audio") throw new Error("Rows hold photos and videos. Audio stays in Media.");
  const duration = asset.kind === "image" ? PHOTO_ROW_SECONDS : Math.floor((asset.duration ?? 0) * 30) / 30;
  if (!(duration > 0)) throw new Error(`“${asset.name}” is still preparing. Try again when it is ready.`);
  return { id, source: asset.source, start: 0, duration, label: "", note: "", text: "" };
}
/** Adds a row before `beforeId` (or at the end), bringing its source into the board. */
export function insertRow(board: StoryboardContent, row: StoryboardShot, beforeId?: string): StoryboardContent {
  return insertStoryboardShot({ ...board, sources: board.sources.includes(row.source) ? board.sources : [...board.sources, row.source] }, row, beforeId);
}

/** Words whose middle falls inside the shot's source window. */
export const wordsInShot = (words: TranscriptWord[], shot: Pick<StoryboardShot, "start" | "duration">) =>
  words.filter(w => { const middle = (w.start + w.end) / 2; return middle >= shot.start && middle < shot.start + shot.duration; });
export const wordsText = (words: TranscriptWord[]) => words.map(w => w.text).join(" ");

/** Puts a source's transcript on a row: its words and, as the row's text, what is said in it. */
export function applyTranscript(shot: StoryboardShot, sourceWords: TranscriptWord[]): StoryboardShot {
  const words = wordsInShot(sourceWords, shot);
  if (!words.length) throw new Error("No speech in this part of the video.");
  return { ...shot, words, script: wordsText(words) };
}

/** Character offset where the script's `count`-th whitespace-separated word begins (or its end). */
export function scriptOffset(script: string, count: number): number {
  const tokens = [...script.matchAll(/\S+/g)];
  return count >= tokens.length ? script.length : tokens[count].index!;
}
/** The word being spoken at `seconds` on the source clock, or -1 between sentences and outside the words. */
export function spokenWord(words: TranscriptWord[], seconds: number): number {
  for (let i = words.length - 1; i >= 0; i--) if (words[i].start <= seconds) return seconds <= words[i].end + .25 ? i : -1;
  return -1;
}

/**
 * Splits a row at a moment in its playback (source-clock seconds). A transcribed row cuts in the
 * pause between words nearest that moment, so no word is cut in half, and each part keeps the script
 * spoken in it: words are counted against the transcript, so typed corrections that keep the word
 * count keep the text split exact. An untranscribed row cuts on the frame and keeps its script on the
 * first part. Visuals keep their moment in time.
 */
export function splitRowAt(board: StoryboardContent, shotId: string, seconds: number, newId: string): StoryboardContent {
  const shot = board.shots.find(s => s.id === shotId);
  if (!shot) throw new Error("This row is no longer on the storyboard.");
  const end = shot.start + shot.duration, words = shot.words ?? [], script = shot.script ?? "";
  let cut = frames(seconds), count = 0;
  if (words.length > 1) {
    // Gaps between words, each cut at its middle; take the one nearest the playhead.
    const gaps = words.slice(1).map((w, i) => ({ count: i + 1, at: frames((words[i].end + w.start) / 2) })).filter(g => g.at > shot.start && g.at < end);
    const nearest = gaps.reduce<typeof gaps[number] | undefined>((best, g) => !best || Math.abs(g.at - seconds) < Math.abs(best.at - seconds) ? g : best, undefined);
    if (nearest) ({ at: cut, count } = nearest);
  }
  if (cut <= shot.start || cut >= end) throw new Error("Pause the video inside this row, away from its start and end, then split.");
  const firstDuration = frames(cut - shot.start), at = count ? scriptOffset(script, count) : script.length;
  // Visuals keep their place in time: those starting after the cut move to the second row.
  const visuals = shot.visuals ?? [];
  const first: StoryboardShot = { ...shot, duration: firstDuration, script: script.slice(0, at).trimEnd() || undefined, words: count ? words.slice(0, count) : undefined,
    visuals: visuals.filter(v => v.at <= firstDuration - 1 / 30).map(v => ({ ...v, duration: Math.min(v.duration, frames(firstDuration - v.at)) })) };
  const second: StoryboardShot = { id: newId, source: shot.source, start: cut, duration: frames(end - cut), label: "", note: "", text: "",
    ...(shot.groupId ? { groupId: shot.groupId } : {}), script: script.slice(at).trimStart() || undefined, words: count ? words.slice(count) : undefined,
    visuals: visuals.filter(v => v.at > firstDuration - 1 / 30).map(v => ({ ...v, at: Math.max(0, frames(v.at - firstDuration)) })) };
  for (const row of [first, second]) for (const key of ["visuals", "words", "script"] as const) if (row[key] === undefined || (Array.isArray(row[key]) && !row[key]!.length)) delete row[key];
  const index = board.shots.findIndex(s => s.id === shotId), shots = [...board.shots];
  shots.splice(index, 1, first, second);
  return { ...board, shots };
}
