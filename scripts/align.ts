import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ALIGNMENT_SEGMENTATION_VERSION, type AlignmentGroup, asrWords, assignWordsToChunks, findSilences, frameLevels, mergeWithNeighbour, parseMfaWords, pcm16Wav, planCuts, readPcm16Wav, reconcileDuplicateWords, scriptTokens, silenceThreshold, SINGLE_PASS_MAX_SECONDS, chunkText, dropMarkerIntervals, stitchAlignments, type TimeSpan, trimToSpeech, unscriptedMarkerPositions, type WordInterval } from "../src/lib/instruments/alignment-chunks";
import { validateAlignment } from "../src/lib/instruments/captions";
import { dictionaryWords, findOovTokens, MFA_G2P_MODEL, MFA_G2P_MODEL_VERSION, parseG2pOutput } from "../src/lib/instruments/oov";

const args = process.argv.slice(2);
const audio = args[0];
const transcriptPath = args[1];
const value = (flag: string) => args.includes(flag) ? args[args.indexOf(flag) + 1] : undefined;
if (!audio || !transcriptPath) throw new Error("usage: pnpm align <audio.wav (16-bit mono)> <transcript.json|txt> [--pronunciations review.json] [--out alignment.json] [--segmentation report.json]");
const rawTranscript = readFileSync(transcriptPath, "utf8").trim();
const text = transcriptPath.endsWith(".json") ? JSON.parse(rawTranscript).text : rawTranscript;
if (typeof text !== "string" || !text.trim()) throw new Error("Transcript has no text.");
const out = value("--out") ?? `${audio}.alignment.json`;
const segmentationOut = value("--segmentation") ?? path.join(path.dirname(out), "alignment-segmentation.json");
const whisperModel = process.env.WHISPER_MODEL ?? path.join(os.homedir(), ".cache/whisper-models/ggml-small.bin");
// Voice detection keeps whisper segment times on the speech; without it a chunk opening on a long
// quiet stretch gets a first segment starting at 0, which cannot bound the speech.
const vadModel = process.env.WHISPER_VAD_MODEL ?? path.join(os.homedir(), ".cache/whisper-models/ggml-silero-v6.2.0.bin");
const reviewPath = value("--pronunciations") ?? path.join(path.dirname(out), "pronunciations.json");
const mfaBin = process.env.MFA_BIN ?? "mfa";
const MFA_MISSING = "MFA is not installed. Install Montreal Forced Aligner 3.x (`pnpm setup:check` names the command), then rerun.";
const mfaBeam = process.env.MFA_BEAM;
const mfaRoot = process.env.MFA_ROOT_DIR ?? path.join(process.env.HOME ?? "", ".local", "share", "mfa-data");
const dictionaryPath = process.env.MFA_DICTIONARY_PATH ?? path.join(mfaRoot, "pretrained_models", "dictionary", "english_us_mfa.dict");
if (!existsSync(dictionaryPath)) throw new Error(`MFA dictionary not found: ${dictionaryPath}. Run \`pnpm setup:speech\`, or set MFA_DICTIONARY_PATH.`);
const oovTokens = findOovTokens(text, dictionaryWords(readFileSync(dictionaryPath, "utf8")));
type Review = Record<string, { token: string; generated_pronunciation: string; confirmed_pronunciation: string; model_version: string }>;
let review: Review = {};
if (existsSync(reviewPath)) review = JSON.parse(readFileSync(reviewPath, "utf8"));
if (oovTokens.length) {
  const g2pInput = path.join(path.dirname(reviewPath), ".mfa-oov-tokens.txt");
  const g2pOutput = path.join(path.dirname(reviewPath), ".mfa-oov-pronunciations.txt");
  writeFileSync(g2pInput, `${oovTokens.join("\n")}\n`);
  try {
    execFileSync(mfaBin, ["g2p", g2pInput, MFA_G2P_MODEL, g2pOutput, "--overwrite"], { stdio: "inherit", env: { ...process.env, PATH: `${path.dirname(mfaBin)}:${process.env.PATH ?? ""}` } });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(MFA_MISSING);
    throw error;
  }
  const generated = parseG2pOutput(readFileSync(g2pOutput, "utf8"));
  for (const token of oovTokens) review[token] ??= { token, generated_pronunciation: generated.get(token) ?? "", confirmed_pronunciation: "", model_version: MFA_G2P_MODEL_VERSION };
}
for (const token of Object.keys(review)) if (!oovTokens.includes(token)) delete review[token];
if (Object.values(review).some((entry) => !entry.confirmed_pronunciation.trim() || entry.model_version !== MFA_G2P_MODEL_VERSION)) {
  mkdirSync(path.dirname(reviewPath), { recursive: true });
  writeFileSync(reviewPath, `${JSON.stringify(review, null, 2)}\n`);
  throw new Error(`Pronunciation confirmation required: edit ${reviewPath}, then rerun.`);
}
const tokens = scriptTokens(text);
const sourceWords = tokens.map((token) => token.text);
const work = path.join(path.dirname(out), ".mfa");
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const mfaEnv = { ...process.env, PATH: `${path.dirname(mfaBin)}:${process.env.PATH ?? ""}` };
const runMfa = (mfaArgs: string[]) => {
  if (mfaBeam) mfaArgs.push("--beam", mfaBeam);
  try {
    execFileSync(mfaBin, mfaArgs, { stdio: "inherit", env: mfaEnv });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") throw new Error(MFA_MISSING);
    throw error;
  }
};

function singlePass() {
  const textFile = path.join(work, "transcript.txt");
  const mfaOut = path.join(work, "alignment.json");
  writeFileSync(textFile, text);
  runMfa(["align_one_hf", audio, textFile, "english_mfa", mfaOut, "--use_g2p", "--output_format", "json", "--overwrite"]);
  const intervals = reconcileDuplicateWords(parseMfaWords(JSON.parse(readFileSync(mfaOut, "utf8"))), sourceWords).words;
  if (sourceWords.length !== intervals.length) throw new Error(`MFA returned ${intervals.length} words for ${sourceWords.length} script words; inspect ${mfaOut}.`);
  return intervals.sort((a, b) => a.start - b.start).map((word, index) => ({ ...word, word: sourceWords[index] }));
}

// Long recordings: cut at real pauses, let ASR say which reviewed words fall in which chunk,
// then MFA-align every chunk on its own (one corpus run) and shift back by the chunk offset.
function chunked(pcm: { sampleRate: number; samples: Int16Array }, report: Record<string, unknown>) {
  const { sampleRate, samples } = pcm;
  const duration = samples.length / sampleRate;
  const frameSeconds = 0.01;
  const levels = frameLevels(samples, sampleRate, frameSeconds);
  const threshold = silenceThreshold(levels);
  const silences = findSilences(levels, frameSeconds, { thresholdDb: threshold });
  Object.assign(report, { silence_threshold_db: Math.round(threshold * 10) / 10, silences: silences.length });
  const writeChunk = (file: string, start: number, end: number) => writeFileSync(file, pcm16Wav(samples.subarray(Math.round(start * sampleRate), Math.min(samples.length, Math.round(end * sampleRate))), sampleRate));

  // ASR only locates which words were spoken in each chunk; it never times a word.
  if (!existsSync(whisperModel)) throw new Error(`Whisper model missing: ${whisperModel}. Run \`pnpm setup:speech\`.`);
  const asrDir = path.join(work, "asr");
  mkdirSync(asrDir, { recursive: true });
  const asrCache = new Map<string, string[]>();
  const speechCache = new Map<string, TimeSpan[]>();
  const spanKey = (span: { start: number; end: number }) => `${span.start}-${span.end}`;
  const transcribeSpans = (spans: Array<{ start: number; end: number }>) => {
    const missing = spans.filter((span) => !asrCache.has(spanKey(span)));
    if (!missing.length) return;
    const files = missing.map((span) => { const file = path.join(asrDir, `c${String(asrCache.size + missing.indexOf(span)).padStart(4, "0")}.wav`); writeChunk(file, span.start, span.end); return file; });
    execFileSync("whisper-cli", [...(existsSync(vadModel) ? ["--vad", "--vad-model", vadModel] : []), "-m", whisperModel, "-l", "en", "-nf", "-np", "-oj", ...files.flatMap((file) => ["-f", file])], { stdio: ["ignore", "ignore", "pipe"], maxBuffer: 64 * 1024 * 1024 });
    missing.forEach((span, i) => {
      const segments: Array<{ text?: string; offsets?: { from?: number; to?: number } }> = JSON.parse(readFileSync(`${files[i]}.json`, "utf8")).transcription ?? [];
      asrCache.set(spanKey(span), asrWords(segments.map((s) => s.text ?? "").join(" ")));
      // Where words were heard (absolute seconds); bounds each chunk's audio, never a word.
      speechCache.set(spanKey(span), segments
        .filter((s) => asrWords(s.text ?? "").length && Number.isFinite(s.offsets?.from) && Number.isFinite(s.offsets?.to))
        .map((s) => ({ start: span.start + s.offsets!.from! / 1000, end: span.start + s.offsets!.to! / 1000 })));
    });
  };
  // A cut the reviewed text cannot be pinned to is replanned at another pause (up to 3 times);
  // the plan whose longest chunk is shortest wins.
  const excluded = new Set<number>();
  let best: { assignment: ReturnType<typeof assignWordsToChunks>; cuts: number[]; spans: Array<{ start: number; end: number }>; longest: number } | undefined;
  for (let pass = 0; pass < 4; pass++) {
    const cuts = planCuts(silences.filter((s) => !excluded.has(Math.round(((s.start + s.end) / 2) * 1000) / 1000)), duration);
    const edges = [0, ...cuts, duration];
    const spans = edges.slice(0, -1).map((start, i) => ({ start, end: edges[i + 1] }));
    transcribeSpans(spans);
    const assignment = assignWordsToChunks(sourceWords, spans, spans.map((span) => asrCache.get(spanKey(span))!));
    const longest = Math.max(...assignment.groups.map((g) => g.audio_end - g.audio_start));
    if (!best || longest < best.longest) best = { assignment, cuts, spans, longest };
    if (!assignment.dropped_cuts.length) break;
    assignment.dropped_cuts.forEach((cut) => excluded.add(cut));
  }
  const { assignment, cuts, spans } = best!;
  const groupAsr = (g: AlignmentGroup) => spans.filter((span) => span.end > g.audio_start && span.start < g.audio_end).flatMap((span) => asrCache.get(spanKey(span))!);
  Object.assign(report, { asr_model: path.basename(whisperModel), asr_chunks_transcribed: asrCache.size, planned_cuts: cuts, asr_matched_words: assignment.matched_words, dropped_cuts: assignment.dropped_cuts });

  // A long quiet stretch inside a group would let MFA stretch its first or last words over it.
  let groups = assignment.groups.map((g) => trimToSpeech(g, spans.flatMap((span) => speechCache.get(spanKey(span)) ?? []), silences));
  report.trimmed_to_speech = groups.map((g, i) => ({ from: [assignment.groups[i].audio_start, assignment.groups[i].audio_end], to: [g.audio_start, g.audio_end] })).filter((t) => t.from[0] !== t.to[0] || t.from[1] !== t.to[1]);
  const keyOf = (g: AlignmentGroup) => `${g.audio_start}:${g.audio_end}:${g.word_start}:${g.word_end}`;
  const results = new Map<string, WordInterval[]>();
  const mergedAfterFailure: number[] = [];
  const failures: Array<AlignmentGroup & { round: number; mfa_words: number | null }> = [];
  report.mfa_failures = failures;
  let duplicateIntervals = 0;
  const markerCount = new Map<string, number>();
  for (let round = 0; ; round++) {
    const pending = groups.filter((g) => !results.has(keyOf(g)));
    const corpus = path.join(work, `corpus-${round}`), speaker = path.join(corpus, "speaker"), output = path.join(work, `aligned-${round}`);
    mkdirSync(speaker, { recursive: true });
    pending.forEach((g, i) => {
      const name = `g${String(i).padStart(4, "0")}`;
      writeChunk(path.join(speaker, `${name}.wav`), g.audio_start, g.audio_end);
      // Speech the reviewed text leaves out gets a spoken-noise marker so MFA does not stretch words over it.
      const markers = unscriptedMarkerPositions(sourceWords.slice(g.word_start, g.word_end), groupAsr(g));
      markerCount.set(keyOf(g), markers.length);
      writeFileSync(path.join(speaker, `${name}.lab`), chunkText(text, tokens, g.word_start, g.word_end, markers));
    });
    runMfa(["align_hf", corpus, "english_mfa", output, "--use_g2p", "--output_format", "json", "--overwrite", "--clean", "--single_speaker", "-t", path.join(work, "tmp")]);
    const failed: AlignmentGroup[] = [];
    pending.forEach((g, i) => {
      const file = [path.join(output, "speaker", `g${String(i).padStart(4, "0")}.json`), path.join(output, `g${String(i).padStart(4, "0")}.json`)].find(existsSync);
      const parsed = file ? dropMarkerIntervals(parseMfaWords(JSON.parse(readFileSync(file, "utf8")))) : [];
      const { words, merged } = reconcileDuplicateWords(parsed, sourceWords.slice(g.word_start, g.word_end));
      duplicateIntervals += merged;
      if (words.length === g.word_end - g.word_start) results.set(keyOf(g), words);
      else { failed.push(g); failures.push({ ...g, round, mfa_words: file ? words.length : null }); }
    });
    if (!failed.length) break;
    if (round >= 3 || groups.length < 2) throw new Error(`MFA could not align ${failed.length} chunk(s) after merging.`);
    for (const g of failed) {
      const index = groups.findIndex((candidate) => keyOf(candidate) === keyOf(g));
      if (index < 0) continue;
      mergedAfterFailure.push(g.audio_start);
      groups = mergeWithNeighbour(groups, index);
    }
  }
  Object.assign(report, { merged_after_mfa_failure: mergedAfterFailure, mfa_duplicate_intervals_dropped: duplicateIntervals, unscripted_speech_markers: groups.reduce((sum, g) => sum + (markerCount.get(keyOf(g)) ?? 0), 0), chunks: groups.map((g) => ({ ...g, unscripted_speech_markers: markerCount.get(keyOf(g)) ?? 0 })) });
  return stitchAlignments(groups, groups.map((g) => results.get(keyOf(g))!), sourceWords);
}

let pcm: ReturnType<typeof readPcm16Wav>;
try {
  pcm = readPcm16Wav(readFileSync(audio));
} catch {
  const converted = path.join(work, "input.wav");
  execFileSync("ffmpeg", ["-v", "error", "-y", "-i", audio, "-vn", "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", converted], { stdio: "inherit" });
  pcm = readPcm16Wav(readFileSync(converted));
}
const durationSeconds = pcm.samples.length / pcm.sampleRate;
const report: Record<string, unknown> = { version: ALIGNMENT_SEGMENTATION_VERSION, method: "mfa", duration_seconds: Math.round(durationSeconds * 1000) / 1000, script_words: sourceWords.length };
let aligned: WordInterval[];
if (durationSeconds <= SINGLE_PASS_MAX_SECONDS || process.env.ALIGN_SINGLE_PASS === "1") {
  aligned = singlePass();
  Object.assign(report, { strategy: "single_pass", reason: durationSeconds <= SINGLE_PASS_MAX_SECONDS ? "short_recording" : "forced" });
} else {
  try {
    aligned = chunked(pcm, report);
    report.strategy = "chunked";
  } catch (error) {
    // Graceful fallback: the whole recording as one utterance (the previous behaviour).
    console.error(`Chunked alignment failed (${(error as Error).message}); aligning as one utterance.`);
    delete report.chunks;
    aligned = singlePass();
    Object.assign(report, { strategy: "single_pass", reason: "chunked_failed", chunked_error: (error as Error).message });
  }
}
const words = validateAlignment(aligned);
if (!words.length) throw new Error("MFA output contained no word intervals.");
if (words.length !== sourceWords.length) throw new Error(`Aligned ${words.length} words for ${sourceWords.length} script words.`);
writeFileSync(out, `${JSON.stringify(words, null, 2)}\n`);
writeFileSync(segmentationOut, `${JSON.stringify(report, null, 2)}\n`);
// Bound scratch: chunk audio and MFA temporary data are only needed during the run.
if (process.env.ALIGN_KEEP_WORK !== "1") for (const name of readdirSync(work)) if (name === "asr" || name === "tmp" || name === "input.wav" || name.startsWith("corpus-")) rmSync(path.join(work, name), { recursive: true, force: true });
console.log(out);
