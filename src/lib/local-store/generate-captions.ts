import { createHash, randomUUID } from "node:crypto";
import { runBackgroundCommand as run } from "./background-worker";
import fs from "node:fs/promises";
import path from "node:path";
import { projectDir } from "./paths";
import { resolveLocalMediaSource } from "./audio-effects";
import { activeElements, captureProjectHistorySnapshot, newRowTimestamps, readTimeline, withProjectLock, writeTimeline } from "./store";
import { bindGeneratedCaption, captionAudioSourceId, captionFollowsAudio } from "@/lib/timeline/caption-audio-link";
import { groupAlignedWordsByNaturalBoundaries } from "@/lib/timeline/caption-grouping";
import { validateAlignment, type TranscriptWord } from "@/lib/instruments/captions";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { sourceTimeToTimelineTime, timelineTimeToSourceTime } from "@/lib/timeline/speed-steps";
import { traceOperation } from "@/lib/observability/operations";

const revision = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function error(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
async function fingerprint(file: string) {
  const stat = await fs.stat(file);
  return `${stat.size}:${stat.mtimeMs}:${stat.ino}`;
}
type Session = { elementId: string; revision: string; sourcePath: string; fingerprint: string };
const busy = new Set<string>();

export function buildGeneratedCaptions(source: TimelineElement, alignment: TranscriptWord[]): TimelineElement[] {
  if (!Number.isFinite(source.playback_rate) || source.playback_rate <= 0 || !Number.isFinite(source.duration) || source.duration <= 0)
    error("The selected clip has invalid timing.");
  const words = validateAlignment(alignment).map((word) => ({ ...word,
    start: word.start + source.trim_start, end: word.end + source.trim_start }));
  if (!words.length) error("No aligned speech was found.");
  const sourceEnd = timelineTimeToSourceTime(source, source.duration);
  if (words.some((word) => !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < source.trim_start || word.end > sourceEnd + 0.001)) error("Alignment falls outside the selected clip.");
  return groupAlignedWordsByNaturalBoundaries(words).map((cue) => {
    const caption: TimelineElement = {
      id: randomUUID(), project_id: source.project_id, type: "caption_text", source_url: null,
      beat_id: null, character_id: null, voice_clip_id: source.id,
      timeline_start: source.timeline_start + sourceTimeToTimelineTime(source, cue.start),
      duration: sourceTimeToTimelineTime(source, cue.end) - sourceTimeToTimelineTime(source, cue.start),
      lane_key: "captions_0", lane_index: 0, trim_start: 0, trim_end: null,
      volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false,
      removed_at: null, removed_reason: null, ...newRowTimestamps(),
      props: { text: cue.text, fontPreset: "teko", fontSizePx: 92, maxWidth: 0.72,
        positionPreset: "bottom_center", styleVariant: "bold_outline", timingMode: "active_word",
        activeWordColor: "#ff3b30", caption_timing: "mfa_alignment",
        caption_single_line_contract: true,
        wordTimings: cue.words.map((word) => ({ text: word.word,
          start: sourceTimeToTimelineTime(source, word.start) - sourceTimeToTimelineTime(source, cue.start),
          end: sourceTimeToTimelineTime(source, word.end) - sourceTimeToTimelineTime(source, cue.start) })) },
    };
    bindGeneratedCaption(caption, source);
    return caption;
  });
}

async function script(name: string, args: string[]) {
  try {
    await run(process.execPath, ["--import", "tsx", path.resolve("scripts", name), ...args],
      { timeout: 15 * 60_000, maxBuffer: 4 * 1024 * 1024 });
  } catch (cause) {
    const result = cause as { stderr?: string; message?: string };
    const detail = result.stderr?.match(/Error: ([^\n]+)/)?.[1];
    error(detail ?? `Local caption processing failed. Check that ffmpeg, whisper-cli and MFA are installed. ${result.message ?? ""}`);
  }
}

/** Preprocessing only. The transcript is reviewed before any timeline write. */
export function prepareCaptionTranscript(projectId: string, elementId: string) {
  return traceOperation("captions.transcribe", () => prepareCaptionTranscriptInternal(projectId, elementId));
}
async function prepareCaptionTranscriptInternal(projectId: string, elementId: string) {
  const timeline = readTimeline(projectId);
  const source = activeElements(timeline).find((row) => row.id === elementId);
  if (!source || !["video_clip", "vo_full", "vo_segment"].includes(source.type) || !source.source_url) error("Select an audio or video speech clip.");
  if (source.position_locked) error("Unlock the source clip before generating captions.");
  const media = resolveLocalMediaSource(projectId, source.source_url);
  if (!media) error("Caption generation requires imported local media in this project.");
  if (!(source.playback_rate > 0 && source.duration > 0)) error("The selected clip has invalid timing.");
  const key = `${projectId}:${elementId}`;
  if (busy.has(key)) error("This clip is already being transcribed.", 409);
  busy.add(key);
  try {
    const sessionId = randomUUID();
    const dir = path.join(projectDir(projectId), "instruments", "caption-generation", sessionId);
    await fs.mkdir(dir, { recursive: true });
    const session: Session = { elementId, revision: revision(timeline), sourcePath: media.absolutePath,
      fingerprint: await fingerprint(media.absolutePath) };
    await run("ffmpeg", ["-v", "error", "-y", "-ss", String(source.trim_start), "-i", media.absolutePath,
      "-t", String(timelineTimeToSourceTime(source, source.duration) - source.trim_start), "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", path.join(dir, "speech.wav")],
    { timeout: 120_000, maxBuffer: 1024 * 1024 });
    await script("transcribe.ts", [path.join(dir, "speech.wav"), "--out", path.join(dir, "transcript.json")]);
    await fs.writeFile(path.join(dir, "session.json"), JSON.stringify(session));
    const transcript = JSON.parse(await fs.readFile(path.join(dir, "transcript.json"), "utf8"));
    return { sessionId, text: transcript.text as string };
  } finally { busy.delete(key); }
}

/** Human UI action: forced-align reviewed text, then commit the complete rail as one undoable edit. */
export function generateReviewedCaptions(projectId: string, sessionId: string, text: string) {
  return traceOperation("captions.align-and-create", () => generateReviewedCaptionsInternal(projectId, sessionId, text));
}
async function generateReviewedCaptionsInternal(projectId: string, sessionId: string, text: string) {
  if (!/^[a-f0-9-]{36}$/.test(sessionId) || !text.trim() || text.length > 100_000) error("Invalid caption generation request.");
  const dir = path.join(projectDir(projectId), "instruments", "caption-generation", sessionId);
  const key = `${projectId}:${sessionId}`;
  if (busy.has(key)) error("Caption generation is already running.", 409);
  busy.add(key);
  try {
    const session: Session = JSON.parse(await fs.readFile(path.join(dir, "session.json"), "utf8"));
    if (revision(readTimeline(projectId)) !== session.revision) error("The timeline changed. Start caption generation again for the current edit.", 409);
    await fs.writeFile(path.join(dir, "reviewed.txt"), text.trim());
    await script("align.ts", [path.join(dir, "speech.wav"), path.join(dir, "reviewed.txt"), "--out", path.join(dir, "alignment.json")]);
    const words = validateAlignment(JSON.parse(await fs.readFile(path.join(dir, "alignment.json"), "utf8")));
    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      if (revision(timeline) !== session.revision || await fingerprint(session.sourcePath) !== session.fingerprint)
        error("The source or timeline changed. Start caption generation again; nothing was overwritten.", 409);
      const source = activeElements(timeline).find((row) => row.id === session.elementId)!;
      const captions = buildGeneratedCaptions(source, words);
      const alignmentPath = path.join(dir, "source-alignment.json");
      const alignmentJson = JSON.stringify(words.map((word) => ({ ...word, start: word.start + source.trim_start, end: word.end + source.trim_start })));
      await fs.writeFile(alignmentPath, alignmentJson);
      for (const caption of captions) caption.props = { ...caption.props, caption_alignment_path: alignmentPath,
        caption_alignment_sha256: createHash("sha256").update(alignmentJson).digest("hex") };
      const replaced = activeElements(timeline).filter((row) => captionFollowsAudio(row) && captionAudioSourceId(row) === source.id);
      if (replaced.some((row) => row.position_locked)) error("Unlock existing linked captions before regenerating them.");
      const before = captureProjectHistorySnapshot(projectId, "generate_captions_before");
      const now = new Date().toISOString();
      for (const caption of replaced) Object.assign(caption, { removed_at: now, removed_reason: "caption_regenerated", updated_at: now });
      timeline.elements.push(...captions);
      writeTimeline(projectId, timeline, "generate_captions");
      const after = captureProjectHistorySnapshot(projectId, "generate_captions_after");
      return { history: { before, after }, count: captions.length };
    });
  } finally { busy.delete(key); }
}
