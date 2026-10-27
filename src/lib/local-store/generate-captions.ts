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
import { parseG2pOutput, MFA_G2P_MODEL } from "@/lib/instruments/oov";
import { captionStylePropsFromRaw, SPEECH_CAPTIONS_HIDE_PUNCTUATION } from "@/lib/timeline/captions";
import { workerCommand } from "@/lib/worker-command";

const revision = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function error(message: string, status = 400): never { throw Object.assign(new Error(message), { status }); }
async function fingerprint(file: string) {
  const stat = await fs.stat(file);
  return `${stat.size}:${stat.mtimeMs}:${stat.ino}`;
}
type Session = { elementId: string; revision: string; sourcePath: string; fingerprint: string };
const busy = new Set<string>();

export function buildGeneratedCaptions(source: TimelineElement, alignment: TranscriptWord[], wordLimit?: number): TimelineElement[] {
  if (!Number.isFinite(source.playback_rate) || source.playback_rate <= 0 || !Number.isFinite(source.duration) || source.duration <= 0)
    error("The selected clip has invalid timing.");
  const words = validateAlignment(alignment).map((word) => ({ ...word,
    start: word.start + source.trim_start, end: word.end + source.trim_start }));
  if (!words.length) error("No aligned speech was found.");
  const sourceEnd = timelineTimeToSourceTime(source, source.duration);
  const sourceDuration=source.props?.source_duration_seconds;
  if(typeof sourceDuration==="number" && sourceEnd>sourceDuration-(source.trim_end??0)+0.04) error("The clip extends past its source. Correct its trim before transcribing.");
  if (words.some((word) => !Number.isFinite(word.start) || !Number.isFinite(word.end) || word.start < source.trim_start || word.end > sourceEnd + 0.001)) error("Alignment falls outside the selected clip.");
  if (wordLimit != null && (!Number.isInteger(wordLimit) || wordLimit < 1 || wordLimit > 12)) error("Words per line must be between 1 and 12.");
  return groupAlignedWordsByNaturalBoundaries(words, wordLimit == null ? {} : { minWords: 1, preferredWords: wordLimit, maxWords: wordLimit }).map((cue) => {
    const caption: TimelineElement = {
      id: randomUUID(), project_id: source.project_id, type: "caption_text", source_url: null,
      beat_id: null, character_id: null, voice_clip_id: source.id,
      timeline_start: source.timeline_start + sourceTimeToTimelineTime(source, cue.start),
      duration: sourceTimeToTimelineTime(source, cue.end) - sourceTimeToTimelineTime(source, cue.start),
      lane_key: "captions_0", lane_index: 0, trim_start: 0, trim_end: null,
      volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false,
      removed_at: null, removed_reason: null, ...newRowTimestamps(),
      props: { text: cue.text, fontPreset: "anton", fontSizing: "fixed", fontSizePx: 92, maxWidth: 0.72,
        positionPreset: "bottom_center", styleVariant: "bold_outline", timingMode: wordLimit === 1 ? "single_word" : "phrase",
        activeWordColor: "#ff3b30", hidePunctuation: SPEECH_CAPTIONS_HIDE_PUNCTUATION, caption_timing: "mfa_alignment",
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
    const job = workerCommand(`scripts/${name}`, args);
    await run(job.command, job.args,
      { timeout: 15 * 60_000, maxBuffer: 4 * 1024 * 1024 });
  } catch (cause) {
    const result = cause as { stderr?: string; message?: string };
    const detail = result.stderr?.match(/Error: ([^\n]+)/)?.[1];
    error(detail ?? `Local caption processing failed. \`npx dreamcut doctor\` (source checkout: \`pnpm setup:check\`) shows which of FFmpeg, whisper-cli, MFA and their models are missing. ${result.message ?? ""}`);
  }
}

/** Preprocessing only. The transcript is reviewed before any timeline write. */
export function prepareCaptionTranscript(projectId: string, elementId: string, reviewedText?: string) {
  return traceOperation("captions.transcribe", () => prepareCaptionTranscriptInternal(projectId, elementId, reviewedText));
}
async function prepareCaptionTranscriptInternal(projectId: string, elementId: string, reviewedText?: string) {
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
    // Reuse only pronunciations explicitly reviewed for these same source bytes.
    const priorCaption=activeElements(timeline).find(row=>captionAudioSourceId(row)===source.id && typeof row.props?.caption_alignment_path==="string");
    const priorPath=priorCaption?.props?.caption_alignment_path;
    if(typeof priorPath==="string" && path.resolve(priorPath).startsWith(path.resolve(projectDir(projectId),"instruments","caption-generation")+path.sep)) {
      try {
        const priorDir=path.dirname(priorPath);
        const previous:Session=JSON.parse(await fs.readFile(path.join(priorDir,"session.json"),"utf8"));
        if(previous.sourcePath===session.sourcePath && previous.fingerprint===session.fingerprint)
          await fs.copyFile(path.join(priorDir,"pronunciations.json"),path.join(dir,"pronunciations.json"));
      } catch { /* No prior pronunciation review; alignment will ask if needed. */ }
    }
    await run("ffmpeg", ["-v", "error", "-y", "-ss", String(source.trim_start), "-i", media.absolutePath,
      "-t", String(timelineTimeToSourceTime(source, source.duration) - source.trim_start), "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", path.join(dir, "speech.wav")],
    { timeout: 120_000, maxBuffer: 1024 * 1024 });
    if (reviewedText == null) await script("transcribe.ts", [path.join(dir, "speech.wav"), "--out", path.join(dir, "transcript.json")]);
    await fs.writeFile(path.join(dir, "session.json"), JSON.stringify(session));
    const transcript = reviewedText == null ? JSON.parse(await fs.readFile(path.join(dir, "transcript.json"), "utf8")) : { text: reviewedText };
    return { sessionId, text: transcript.text as string };
  } finally { busy.delete(key); }
}

/** Human UI action: forced-align reviewed text, then commit the complete rail as one undoable edit. */
export function generateReviewedCaptions(projectId: string, sessionId: string, text: string, wordLimit?: number, pronunciations?: Record<string,string>) {
  return traceOperation("captions.align-and-create", () => generateReviewedCaptionsInternal(projectId, sessionId, text, wordLimit, pronunciations));
}
async function generateReviewedCaptionsInternal(projectId: string, sessionId: string, text: string, wordLimit?: number, pronunciations?: Record<string,string>) {
  if (!/^[a-f0-9-]{36}$/.test(sessionId) || !text.trim() || text.length > 100_000) error("Invalid caption generation request.");
  const dir = path.join(projectDir(projectId), "instruments", "caption-generation", sessionId);
  const key = `${projectId}:${sessionId}`;
  if (busy.has(key)) error("Caption generation is already running.", 409);
  busy.add(key);
  try {
    const session: Session = JSON.parse(await fs.readFile(path.join(dir, "session.json"), "utf8"));
    if (revision(readTimeline(projectId)) !== session.revision) error("The timeline changed. Start caption generation again for the current edit.", 409);
    await fs.writeFile(path.join(dir, "reviewed.txt"), text.trim());
    const pronunciationPath=path.join(dir,"pronunciations.json");
    if (pronunciations) {
      const review=JSON.parse(await fs.readFile(pronunciationPath,"utf8"));
      const entries=Object.entries(pronunciations);
      if(entries.length>100 || entries.some(([word,spelling])=>!review[word] || typeof spelling!=="string" || !/^[a-zA-Z -]{1,100}$/.test(spelling) || !spelling.trim())) error("Write how each unfamiliar word sounds using ordinary letters.");
      const tokens=[...new Set(entries.flatMap(([,spelling])=>spelling.toLowerCase().split(/[ -]+/).filter(Boolean)))];
      const input=path.join(dir,"pronunciation-spellings.txt"),output=path.join(dir,"pronunciation-spellings.dict");
      await fs.writeFile(input,tokens.join("\n")+"\n");
      const mfa=process.env.MFA_BIN ?? "mfa";
      await run(mfa,["g2p",input,MFA_G2P_MODEL,output,"--overwrite"],{timeout:120000,maxBuffer:4*1024*1024});
      const generated=parseG2pOutput(await fs.readFile(output,"utf8"));
      for(const [word,spelling] of entries){
        const parts=spelling.toLowerCase().split(/[ -]+/).filter(Boolean).map(token=>generated.get(token));
        if(parts.some(part=>!part)) error("Could not read that pronunciation. Try another spelling.");
        review[word].confirmed_pronunciation=parts.join(" ");review[word].confirmed_from_spelling=spelling;
      }
      await fs.writeFile(pronunciationPath,JSON.stringify(review));
    }
    try { await script("align.ts", [path.join(dir, "speech.wav"), path.join(dir, "reviewed.txt"), "--out", path.join(dir, "alignment.json")]); }
    catch(cause) {
      if((cause as Error).message.includes("Pronunciation confirmation required")) {
        const review=JSON.parse(await fs.readFile(pronunciationPath,"utf8"));
        return {needsPronunciation:true as const,sessionId,text,words:Object.keys(review).filter(word=>!review[word].confirmed_pronunciation)};
      }
      throw cause;
    }
    const words = validateAlignment(JSON.parse(await fs.readFile(path.join(dir, "alignment.json"), "utf8")));
    return await withProjectLock(projectId, async () => {
      const timeline = readTimeline(projectId);
      if (revision(timeline) !== session.revision || await fingerprint(session.sourcePath) !== session.fingerprint)
        error("The source or timeline changed. Start caption generation again; nothing was overwritten.", 409);
      const source = activeElements(timeline).find((row) => row.id === session.elementId)!;
      const captions = buildGeneratedCaptions(source, words, wordLimit);
      const alignmentPath = path.join(dir, "source-alignment.json");
      const alignmentJson = JSON.stringify(words.map((word) => ({ ...word, start: word.start + source.trim_start, end: word.end + source.trim_start })));
      await fs.writeFile(alignmentPath, alignmentJson);
      for (const caption of captions) caption.props = { ...caption.props, caption_alignment_path: alignmentPath,
        caption_alignment_sha256: createHash("sha256").update(alignmentJson).digest("hex") };
      const replaced = activeElements(timeline).filter((row) => captionFollowsAudio(row) && captionAudioSourceId(row) === source.id);
      if (replaced.length) for (const caption of captions) {
        const previous = replaced.find(row => row.timeline_start + row.duration > caption.timeline_start) ?? replaced[0]!;
        caption.props = { ...caption.props, ...captionStylePropsFromRaw(previous.props),
          timingMode: wordLimit === 1 ? "single_word" : previous.props?.timingMode === "single_word" ? "phrase" : previous.props?.timingMode ?? "phrase",
          // Punctuation the creator switched back on stays on through a regenerate.
          ...(previous.props?.hidePunctuation === false ? { hidePunctuation: false } : {}) };
        caption.lane_key = previous.lane_key;
        caption.lane_index = previous.lane_index;
        bindGeneratedCaption(caption, source);
      }
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
