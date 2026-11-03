import { existsSync, readFileSync } from "node:fs";
import { breakCaptionLines, captionsFromAlignment, validateAlignment, type CaptionCue, type TranscriptWord } from "../src/lib/instruments/captions";
import { CAPTION, FPS, isAllowedCaptionGapFrames } from "../src/lib/qc/standards";
import { newId, newRowTimestamps, readTimeline, writeTimeline } from "../src/lib/local-store/store";
import { sourceToTimeline, type EditMapRegion } from "../src/lib/instruments/rough-cut";
import type { TimelineElement } from "../src/components/studio/timeline/types";
import { bindGeneratedCaption } from "../src/lib/timeline/caption-audio-link";

const args = process.argv.slice(2);
const projectId = args[0];
const alignmentPath = args[1];
const value = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
if (!projectId || !alignmentPath) throw new Error("usage: pnpm captions-from-alignment <projectId> <alignment.json> [--mode phrase|active-word] [--source-element element-id] [--edit-map map.json] [--condensation cues.json] [--max-chars 24] [--max-words 3] [--allow-fast-verbatim] [--subtitle-timing]");
const allowFastVerbatim = args.includes("--allow-fast-verbatim");
const mode = value("--mode") ?? "phrase";
if (mode !== "phrase" && mode !== "active-word") throw new Error("--mode must be phrase or active-word");
const allowRapidFragments = mode === "phrase" && !args.includes("--subtitle-timing");
const editMapPath = value("--edit-map");
const editMap = editMapPath && existsSync(editMapPath) ? JSON.parse(readFileSync(editMapPath, "utf8")) as EditMapRegion[] : null;
const sourceWords = validateAlignment(JSON.parse(readFileSync(alignmentPath, "utf8")));
const timeline = readTimeline(projectId);
const sourceElementId = value("--source-element");
if (sourceElementId && editMap) throw new Error("--source-element and --edit-map are mutually exclusive timing authorities.");
const sourceElement = sourceElementId
  ? timeline.elements.find((element) => element.id === sourceElementId && element.removed_at == null)
  : null;
if (sourceElementId && !sourceElement) throw new Error(`Active source element not found: ${sourceElementId}`);
if (sourceElement && sourceElement.playback_rate <= 0) throw new Error(`Source element ${sourceElement.id} has an invalid playback rate.`);
const words: TranscriptWord[] = editMap != null ? sourceWords.flatMap((word) => {
  const start = sourceToTimeline(word.start, editMap);
  const end = sourceToTimeline(word.end, editMap);
  return start == null || end == null ? [] : [{ word: word.word, start, end }];
}) : sourceElement ? sourceWords.flatMap((word) => {
  const sourceStart = sourceElement.trim_start;
  const sourceEnd = sourceStart + sourceElement.duration * sourceElement.playback_rate;
  if (word.start < sourceStart || word.end > sourceEnd) return [];
  return [{
    word: word.word,
    start: sourceElement.timeline_start + (word.start - sourceStart) / sourceElement.playback_rate,
    end: sourceElement.timeline_start + (word.end - sourceStart) / sourceElement.playback_rate,
  }];
}) : sourceWords;
if (!words.length) throw new Error("No aligned words fall inside the selected timeline source.");
const endBoundary = sourceElement
  ? Math.min(sourceElement.timeline_start + sourceElement.duration, words.at(-1)!.end)
  : timeline.elements.filter((element) => element.removed_at == null && element.type !== "caption_text").reduce((max, element) => Math.max(max, element.timeline_start + element.duration), 0);
const maxChars = Number(value("--max-chars") ?? 24);
if (!Number.isInteger(maxChars) || maxChars < 10 || maxChars > 42) throw new Error("--max-chars must be an integer from 10 to 42");
const maxWords = Number(value("--max-words") ?? 3);
if (!Number.isInteger(maxWords) || maxWords < 1 || maxWords > 12) throw new Error("--max-words must be an integer from 1 to 12");
type CueWithSource = CaptionCue & { sourceText?: string; wordByWord?: boolean };
let cues: CueWithSource[];
const condensationPath = value("--condensation");
if (mode === "active-word" && condensationPath) throw new Error("Active-word captions require verbatim aligned text; --condensation is not supported.");
if (condensationPath) {
  const spec = JSON.parse(readFileSync(condensationPath, "utf8")) as { cues: Array<{ start_index: number; end_index: number; text: string; allow_fast_verbatim?: boolean }> };
  cues = spec.cues.map((item, index) => {
    const group = words.slice(item.start_index, item.end_index + 1);
    if (!group.length || group.length !== item.end_index - item.start_index + 1) throw new Error(`Invalid condensation cue indexes ${item.start_index}-${item.end_index}`);
    const lines = item.text.split("\n");
    if (lines.length > CAPTION.maxLines || lines.some((line) => line.length > maxChars)) throw new Error(`Condensed cue exceeds ${maxChars} chars/line or ${CAPTION.maxLines} lines: ${item.text}`);
    const next = spec.cues[index + 1];
    const nextStart = next ? words[next.start_index]!.start : null;
    const naturalGapFrames = nextStart == null ? Infinity : Math.round((nextStart - group.at(-1)!.end) * FPS);
    const wordByWord = item.start_index === item.end_index && item.allow_fast_verbatim === true;
    const end = nextStart == null ? endBoundary : wordByWord ? nextStart : naturalGapFrames >= CAPTION.longGapMinFrames ? group.at(-1)!.end : nextStart - CAPTION.minGapFrames / FPS;
    const duration = end - group[0]!.start;
    const sourceText = group.map((word) => word.word).join(" ");
    const displayedText = item.text.replace(/\n/g, " ");
    const isVerbatim = displayedText === sourceText;
    const differsOnlyByTerminalPunctuation = displayedText === sourceText.replace(/[.,!?;:]+$/u, "");
    const timingInvalid = duration < CAPTION.minDurationFrames / FPS || duration > CAPTION.maxDurationSeconds || displayedText.length / duration > CAPTION.maxCharsPerSecond;
    if (timingInvalid && !(item.allow_fast_verbatim && (isVerbatim || differsOnlyByTerminalPunctuation))) throw new Error(`Caption cue violates timing/CPS: ${item.text}`);
    return { text: item.text, start: group[0]!.start, end, wordByWord, ...(isVerbatim ? {} : { sourceText }) };
  });
  for (let index = 0; index < cues.length - 1; index += 1) {
    const gap = Math.round((cues[index + 1]!.start - cues[index]!.end) * FPS);
    const continuousWordHandoff = cues[index]!.wordByWord && gap === 0;
    if (!continuousWordHandoff && !isAllowedCaptionGapFrames(gap)) throw new Error(`Condensation emits forbidden ${gap}-frame gap.`);
  }
} else {
  // VERBATIM ONLY. If the spoken words cannot satisfy the caption limits, this THROWS and
  // names the conflict — it does not quietly drop a word to make the run go green.
  //
  // There was briefly a special case here that deleted the literal word "Authors" (the first
  // word of the one video being tested) whenever the constraints failed, labelled "settled
  // policy". That is overfitting to a fixture: it made one video pass, generalised to nothing,
  // and silently altered what the speaker said. Condensation IS allowed — but only through
  // --condensation, where a human writes the shortened wording, the verbatim source is kept in
  // props.caption_source_text, and the QC gate reports the change. Never as a silent fallback.
  cues = captionsFromAlignment(words, { maxCharsPerLine: maxChars, maxWordsPerCue: maxWords, endBoundary, allowFastVerbatim, allowRapidFragments, includeWordTimings: true });
}
const now = new Date().toISOString();
for (const caption of timeline.elements.filter((element) => {
  if (element.type !== "caption_text" || element.removed_at != null) return false;
  if (!sourceElementId) return true;
  return element.props?.speech_caption_source_element_id === sourceElementId;
})) {
  caption.removed_at = now;
  caption.removed_reason = "user";
  caption.updated_at = now;
}
for (const cue of cues) {
  const condensed = cue.sourceText != null;
  // Reading speed of the cue as it will actually be displayed. Recorded on the row (never
  // hidden) so the QC gate can report an over-speed verbatim caption rather than silently
  // accepting it.
  const cps = cue.text.replace(/\n/g, " ").length / Math.max(cue.end - cue.start, 1 / FPS);
  const fastVerbatim = !condensed && cps > CAPTION.maxCharsPerSecond;
  const rapidFragment = Math.round((cue.end - cue.start) * FPS) < CAPTION.minDurationFrames;
  const wordCount = cue.text.trim().split(/\s+/).length;
  const row: TimelineElement = {
    id: newId(), project_id: projectId, type: "caption_text", source_url: null,
    props: {
      text: cue.text,
      fontSizePx: 92,
      maxWidth: 0.72,
      positionPreset: "bottom_center",
      fontPreset: "teko",
      styleVariant: "bold_outline",
      absX: 0.12,
      absY: 0.72,
      ...(cue.words ? {
        timingMode: mode === "active-word" ? "active_word" : "phrase",
        activeWordColor: "#ff3b30",
        wordTimings: cue.words.map((word) => ({
          text: word.word,
          start: Number((word.start - cue.start).toFixed(3)),
          end: Number((word.end - cue.start).toFixed(3)),
        })),
      } : {}),
      ...(condensed ? { caption_condensed: true, caption_source_text: cue.sourceText } : {}),
      ...(fastVerbatim ? { caption_fast_verbatim: true, caption_cps: Number(cps.toFixed(1)) } : {}),
      ...(rapidFragment ? { caption_rapid_fragment: true } : {}),
      ...(cue.wordByWord ? { caption_word_by_word: true } : {}),
      caption_timing: "mfa_alignment",
      caption_grouping: "semantic_fragments_v1",
      caption_word_limit: maxWords,
      caption_word_count: wordCount,
      caption_alignment_path: alignmentPath,
      ...(sourceElementId ? { speech_caption_source_element_id: sourceElementId } : {}),
    },
    beat_id: null, character_id: null, timeline_start: cue.start, duration: cue.end - cue.start,
    lane_key: "captions_0", lane_index: 0, trim_start: 0, trim_end: null, volume: 1,
    fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null,
    ...newRowTimestamps(),
  };
  if (sourceElement) bindGeneratedCaption(row, sourceElement);
  timeline.elements.push(row);
}
writeTimeline(projectId, timeline, "caption_replace_atomic");
console.log(`Created ${cues.length} captions in one history snapshot. Run: pnpm qc ${projectId} && pnpm caption-geometry ${projectId}`);
