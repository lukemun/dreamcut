// Chunk planning for forced alignment of long recordings.
//
// MFA aligns one utterance at a time with a beam search; on a multi-minute utterance the
// search drifts by seconds. A long recording is therefore cut at real pauses (audio energy)
// into utterances of roughly 10-40 s, each chunk gets its own slice of the reviewed text,
// MFA times every word inside its chunk, and the chunk offset is added back.
//
// ASR (whisper) is used only to decide which reviewed words were spoken inside which chunk:
// a cut is kept only when matched ASR words pin the reviewed text on both sides of it. ASR
// never sets a word boundary (AGENTS.md take-selection gate); MFA times every word.

export type WordInterval = { word: string; start: number; end: number };
export type ScriptToken = { text: string; start: number; end: number };
export type TimeSpan = { start: number; end: number };
export type AlignmentGroup = { audio_start: number; audio_end: number; word_start: number; word_end: number };

export const ALIGNMENT_SEGMENTATION_VERSION = 1;
/** Recordings at or below this length keep the single-pass alignment. */
export const SINGLE_PASS_MAX_SECONDS = 45;
export const CHUNK_DEFAULTS = { minSeconds: 10, targetSeconds: 25, maxSeconds: 40, minSilenceSeconds: 0.25 } as const;

/** The reviewed-text word pattern; one token per aligned word (the count invariant). */
const SCRIPT_WORD = /[A-Za-z0-9]+(?:['’][A-Za-z]+)*[.,!?;:]?/g;

export function scriptTokens(text: string): ScriptToken[] {
  return [...text.matchAll(SCRIPT_WORD)].map((m) => ({ text: m[0], start: m.index!, end: m.index! + m[0].length }));
}

export function normalizeWord(word: string) {
  return word.toLowerCase().replace(/’/g, "'").replace(/[^a-z0-9']/g, "").replace(/^'+|'+$/g, "");
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
function integerWords(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${integerWords(n % 100)}` : ""}`;
  for (const [size, name] of [[1e9, "billion"], [1e6, "million"], [1e3, "thousand"]] as const) {
    if (n >= size) return `${integerWords(Math.floor(n / size))} ${name}${n % size ? ` ${integerWords(n % size)}` : ""}`;
  }
  return String(n);
}

/** Spoken form of an ASR number token ("3.5%" → "three point five percent"), for matching only. */
export function verbalizeNumber(token: string) {
  const match = /^(\$)?(\d[\d,]*)(?:\.(\d+))?(%)?$/.exec(token);
  if (!match) return token;
  const whole = Number(match[2].replace(/,/g, ""));
  if (!Number.isSafeInteger(whole) || whole >= 1e12) return token;
  const parts = [integerWords(whole)];
  if (match[3]) parts.push("point", ...[...match[3]].map((d) => ONES[Number(d)]));
  if (match[4]) parts.push("percent");
  if (match[1]) parts.push("dollars");
  return parts.join(" ");
}

/** ASR text → normalized words, splitting the way the reviewed text is tokenized. */
export function asrWords(text: string) {
  const spoken = text.replace(/\[[^\]]*\]|\([^)]*\)/g, " ").replace(/\$?\d[\d,]*(?:\.\d+)?%?/g, (token) => ` ${verbalizeNumber(token)} `);
  return scriptTokens(spoken).map((t) => normalizeWord(t.text)).filter(Boolean);
}

/** Text of words [wordStart, wordEnd) as written in the reviewed text (punctuation and spacing kept). */
export function sliceText(text: string, tokens: ScriptToken[], wordStart: number, wordEnd: number) {
  if (wordEnd <= wordStart) return "";
  return text.slice(tokens[wordStart].start, tokens[wordEnd - 1].end).replace(/\s+/g, " ").trim();
}

/** Per-frame level in dBFS of 16-bit PCM. */
export function frameLevels(samples: Int16Array, sampleRate: number, frameSeconds = 0.01) {
  const size = Math.max(1, Math.round(sampleRate * frameSeconds));
  const levels = new Float64Array(Math.floor(samples.length / size));
  for (let f = 0; f < levels.length; f++) {
    let energy = 0;
    for (let i = f * size, end = i + size; i < end; i++) energy += samples[i] * samples[i];
    levels[f] = 10 * Math.log10(energy / size / (32768 * 32768) + 1e-12);
  }
  return levels;
}

function percentile(sorted: Float64Array, p: number) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * sorted.length)))];
}

/** Silence threshold between the recording's noise floor (10th pct) and speech level (90th pct). */
export function silenceThreshold(levels: Float64Array) {
  const sorted = Float64Array.from(levels).sort();
  const floor = percentile(sorted, 0.1), speech = percentile(sorted, 0.9);
  return floor + 0.3 * (speech - floor);
}

/** Runs of frames below the threshold lasting at least `minSeconds`. */
export function findSilences(levels: Float64Array, frameSeconds: number, opts: { minSeconds?: number; thresholdDb?: number } = {}): TimeSpan[] {
  const minFrames = Math.ceil((opts.minSeconds ?? CHUNK_DEFAULTS.minSilenceSeconds) / frameSeconds - 1e-9);
  const threshold = opts.thresholdDb ?? silenceThreshold(levels);
  const out: TimeSpan[] = [];
  let runStart = -1;
  for (let f = 0; f <= levels.length; f++) {
    const quiet = f < levels.length && levels[f] < threshold;
    if (quiet && runStart < 0) runStart = f;
    if (!quiet && runStart >= 0) {
      if (f - runStart >= minFrames) out.push({ start: round(runStart * frameSeconds), end: round(f * frameSeconds) });
      runStart = -1;
    }
  }
  return out;
}

/**
 * Cut points (seconds) at silence midpoints so chunks run about min..max seconds. From each
 * chunk start the longest silence whose midpoint lies in [start+min, start+max] wins (ties go
 * to the one nearest start+target); with none in range the first later silence is used. A
 * final remainder shorter than `minSeconds` joins the previous chunk.
 */
export function planCuts(silences: TimeSpan[], duration: number, opts: Partial<typeof CHUNK_DEFAULTS> = {}) {
  const { minSeconds, targetSeconds, maxSeconds } = { ...CHUNK_DEFAULTS, ...opts };
  const mids = silences
    .filter((s) => s.start > 0 && s.end < duration)
    .map((s) => ({ mid: round((s.start + s.end) / 2), length: s.end - s.start }));
  const cuts: number[] = [];
  let start = 0;
  while (duration - start > maxSeconds) {
    const inRange = mids.filter((m) => m.mid >= start + minSeconds && m.mid <= start + maxSeconds);
    let pick: { mid: number; length: number } | undefined = inRange.sort((a, b) => b.length - a.length || Math.abs(a.mid - start - targetSeconds) - Math.abs(b.mid - start - targetSeconds) || a.mid - b.mid)[0];
    pick ??= mids.find((m) => m.mid > start + maxSeconds);
    if (!pick || duration - pick.mid < 1) break;
    cuts.push(pick.mid);
    start = pick.mid;
  }
  if (cuts.length && duration - cuts.at(-1)! < minSeconds) cuts.pop();
  return cuts;
}

export type AlignmentOp = { op: "match" | "substitute" | "delete" | "insert"; a: number; b: number };

/**
 * Global sequence alignment (Needleman-Wunsch: match +2, substitution -1, gap -1), as the
 * edit path in order. "delete" consumes an element of `a` only, "insert" an element of `b` only
 * (its `a` is the index of the next element of `a`).
 */
export function alignmentPath(a: string[], b: string[]): AlignmentOp[] {
  const n = a.length, m = b.length, width = m + 1;
  const score = new Int32Array((n + 1) * width);
  const move = new Uint8Array((n + 1) * width); // 0 diag, 1 up (gap in b), 2 left (gap in a)
  for (let i = 1; i <= n; i++) { score[i * width] = -i; move[i * width] = 1; }
  for (let j = 1; j <= m; j++) { score[j] = -j; move[j] = 2; }
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const diag = score[(i - 1) * width + j - 1] + (a[i - 1] === b[j - 1] ? 2 : -1);
      const up = score[(i - 1) * width + j] - 1, left = score[i * width + j - 1] - 1;
      const k = i * width + j;
      if (diag >= up && diag >= left) { score[k] = diag; move[k] = 0; }
      else if (up >= left) { score[k] = up; move[k] = 1; }
      else { score[k] = left; move[k] = 2; }
    }
  }
  const ops: AlignmentOp[] = [];
  for (let i = n, j = m; i > 0 || j > 0;) {
    const k = i * width + j;
    if (i > 0 && j > 0 && move[k] === 0) { ops.push({ op: a[i - 1] === b[j - 1] ? "match" : "substitute", a: i - 1, b: j - 1 }); i--; j--; }
    else if (i > 0 && (j === 0 || move[k] === 1)) { ops.push({ op: "delete", a: i - 1, b: j }); i--; }
    else { ops.push({ op: "insert", a: i, b: j - 1 }); j--; }
  }
  return ops.reverse();
}

/** Per element of `a`, the index of the identical element of `b` it aligns to, or -1. */
export function alignSequences(a: string[], b: string[]) {
  const matched = new Array<number>(a.length).fill(-1);
  for (const op of alignmentPath(a, b)) if (op.op === "match") matched[op.a] = op.b;
  return matched;
}

/** Marker for speech heard in a chunk but absent from the reviewed text (MFA aligns it as spoken noise). */
export const UNSCRIPTED_MARKER = "[unscripted]";

/**
 * Where a chunk's audio holds speech the reviewed text leaves out (a false start, a repeat),
 * MFA otherwise stretches neighbouring words over it and drifts. Positions (indices into
 * `words`, 0..words.length) before which one spoken-noise marker goes: wherever the alignment
 * path inserts ASR words. A run at the chunk's start or end needs `edgeMinWords` ASR words, since
 * ASR adds stray words at edges. The marker carries no text and its interval is discarded; MFA
 * still times every reviewed word.
 */
export function unscriptedMarkerPositions(words: string[], asr: string[], edgeMinWords = 2) {
  const runs = new Map<number, number>();
  for (const op of alignmentPath(words.map(normalizeWord), asr)) if (op.op === "insert") runs.set(op.a, (runs.get(op.a) ?? 0) + 1);
  return [...runs].filter(([at, count]) => (at > 0 && at < words.length) || count >= edgeMinWords).map(([at]) => at).sort((x, y) => x - y);
}

/** Reviewed text of words [wordStart, wordEnd) with markers before the given relative positions. */
export function chunkText(text: string, tokens: ScriptToken[], wordStart: number, wordEnd: number, markers: number[] = []) {
  const pieces: string[] = [];
  let from = wordStart;
  for (const at of markers) {
    const absolute = wordStart + at;
    if (absolute > from) pieces.push(sliceText(text, tokens, from, absolute));
    pieces.push(UNSCRIPTED_MARKER);
    from = Math.max(from, absolute);
  }
  if (wordEnd > from) pieces.push(sliceText(text, tokens, from, wordEnd));
  return pieces.join(" ");
}

/**
 * Drop the intervals MFA gave the unscripted markers: MFA labels a bracketed word `[bracketed]`
 * (corpus alignment) or `<unk>` (single-file alignment). Reviewed-text tokens never carry brackets.
 */
export function dropMarkerIntervals(words: WordInterval[]) {
  return words.filter((w) => !/^(?:\[[^\]]*\]|<[^>]*>|\{[^}]*\})$/.test(w.word));
}

/**
 * Assign reviewed words to audio chunks. `chunkAsr[k]` is the ASR text heard inside chunk k.
 * Reviewed words are sequence-aligned to the concatenated ASR words; a matched word belongs
 * to the chunk its ASR word was heard in. At the cut between chunks k and k+1, L is the last
 * reviewed word matched into chunk ≤k and R the first matched into chunk ≥k+1. The cut is kept
 * when L is in chunk k, R in chunk k+1, at least `anchorWords` of the reviewed words just
 * before L (inclusive) are in chunk k and just after R (inclusive) in chunk k+1, and either L
 * and R are adjacent or the unmatched words between them can be placed: chunk k heard no
 * unmatched ASR words after L's match while chunk k+1 heard at least half as many before R's
 * match (they belong to k+1), or the reverse (they belong to k). Otherwise the two chunks merge. Returns contiguous groups
 * covering every word.
 */
export function assignWordsToChunks(words: string[], chunkSpans: TimeSpan[], chunkAsr: string[][], anchorWords = 2): { groups: AlignmentGroup[]; dropped_cuts: number[]; matched_words: number } {
  const asr: string[] = [], tag: number[] = [];
  chunkAsr.forEach((list, k) => list.forEach((w) => { asr.push(w); tag.push(k); }));
  const normalized = words.map(normalizeWord);
  const matched = alignSequences(normalized, asr);
  const chunkOf = matched.map((j) => (j < 0 ? -1 : tag[j]));
  const splits: number[] = [], dropped: number[] = [];
  const window = anchorWords + 1;
  for (let k = 0; k < chunkSpans.length - 1; k++) {
    let left = -1, right = -1;
    for (let j = 0; j < chunkOf.length; j++) {
      if (chunkOf[j] >= 0 && chunkOf[j] <= k) left = j;
      if (chunkOf[j] > k) { right = j; break; }
    }
    let split = -1;
    if (left >= 0 && right > left && chunkOf[left] === k && chunkOf[right] === k + 1) {
      const before = chunkOf.slice(Math.max(0, left - window + 1), left + 1).filter((c) => c === k).length;
      const after = chunkOf.slice(right, right + window).filter((c) => c === k + 1).length;
      const anchored = before >= Math.min(anchorWords, left + 1) && after >= Math.min(anchorWords, chunkOf.length - right);
      const trailing = tag.filter((t, j) => t === k && j > matched[left]).length;
      const leading = tag.filter((t, j) => t === k + 1 && j < matched[right]).length;
      if (anchored) {
        if (right === left + 1) split = right;
        else if (trailing === 0 && leading * 2 >= right - left - 1) split = left + 1;
        else if (leading === 0 && trailing * 2 >= right - left - 1) split = right;
      }
    }
    if (split >= 0) splits.push(split); else dropped.push(chunkSpans[k].end);
  }
  const groups: AlignmentGroup[] = [];
  let first = 0, wordStart = 0, si = 0;
  for (let k = 0; k < chunkSpans.length; k++) {
    const last = k === chunkSpans.length - 1;
    if (!last && dropped.includes(chunkSpans[k].end)) continue;
    const wordEnd = last ? words.length : splits[si++];
    groups.push({ audio_start: chunkSpans[first].start, audio_end: chunkSpans[k].end, word_start: wordStart, word_end: wordEnd });
    first = k + 1; wordStart = wordEnd;
  }
  return { groups, dropped_cuts: dropped, matched_words: matched.filter((j) => j >= 0).length };
}

/**
 * MFA occasionally reports one word as two adjacent intervals with the same label (seen when
 * a long stretch of non-speech precedes the word: the first interval spans the silence). When
 * the count exceeds the script by such duplicates only, keep the shorter interval of each pair.
 * Returns the words unchanged otherwise (the caller's count check decides).
 */
export function reconcileDuplicateWords(words: WordInterval[], tokens: string[]) {
  if (words.length <= tokens.length) return { words, merged: 0 };
  const labels = words.map((w) => normalizeWord(w.word));
  const matched = alignSequences(labels, tokens.map(normalizeWord));
  const drop = new Set<number>();
  for (let i = 0; i < words.length; i++) {
    if (matched[i] >= 0) continue;
    const contiguous = (n: number) => Math.abs(n < i ? words[i].start - words[n].end : words[n].start - words[i].end) < 0.02;
    const n = [i - 1, i + 1].find((c) => c >= 0 && c < words.length && matched[c] >= 0 && !drop.has(c) && labels[c] === labels[i] && contiguous(c));
    if (n === undefined) return { words, merged: 0 };
    drop.add(words[i].end - words[i].start > words[n].end - words[n].start ? i : n);
  }
  const merged = drop.size;
  const out = words.filter((_, i) => !drop.has(i));
  return out.length === tokens.length ? { words: out, merged } : { words, merged: 0 };
}

/**
 * Shrink a group's audio to where ASR (with voice detection) heard speech, plus `padSeconds`.
 * An edge that lands in sound moves out to the middle of a pause within `reachSeconds`, so no
 * word is cut; ambient noise above the silence threshold can leave no pause nearby, and the
 * padding alone then stands. A take with a long quiet stretch before or after the words
 * otherwise reaches MFA whole, and MFA stretches the first words back over the stretch to any
 * small noise there. ASR only bounds the audio; MFA still times every word. A group with no
 * heard speech is returned unchanged.
 */
export function trimToSpeech(group: AlignmentGroup, speech: TimeSpan[], silences: TimeSpan[], padSeconds = 1.5, reachSeconds = 1): AlignmentGroup {
  const heard = speech.filter((s) => s.end > group.audio_start && s.start < group.audio_end);
  if (!heard.length) return group;
  let start = Math.min(...heard.map((s) => s.start)) - padSeconds;
  let end = Math.max(...heard.map((s) => s.end)) + padSeconds;
  if (!silences.some((s) => s.start <= start && start <= s.end)) {
    const before = silences.filter((s) => s.end <= start && s.end >= start - reachSeconds).at(-1);
    if (before) start = (before.start + before.end) / 2;
  }
  if (!silences.some((s) => s.start <= end && end <= s.end)) {
    const after = silences.find((s) => s.start >= end && s.start <= end + reachSeconds);
    if (after) end = (after.start + after.end) / 2;
  }
  return { ...group, audio_start: round(Math.max(group.audio_start, start)), audio_end: round(Math.min(group.audio_end, end)) };
}

/** Merge group `index` with its shorter neighbour (by audio length). */
export function mergeWithNeighbour(groups: AlignmentGroup[], index: number) {
  if (groups.length < 2) return groups.slice();
  const prev = groups[index - 1], next = groups[index + 1];
  const withPrev = !next || (prev && prev.audio_end - prev.audio_start <= next.audio_end - next.audio_start);
  const a = withPrev ? index - 1 : index, b = a + 1;
  const merged = { audio_start: groups[a].audio_start, audio_end: groups[b].audio_end, word_start: groups[a].word_start, word_end: groups[b].word_end };
  return [...groups.slice(0, a), merged, ...groups.slice(b + 1)];
}

/**
 * Shift each group's chunk-relative MFA words by its audio offset and concatenate. Every group
 * must return exactly its word count; reviewed spellings replace MFA labels by position.
 */
export function stitchAlignments(groups: AlignmentGroup[], results: WordInterval[][], tokens: string[]): WordInterval[] {
  if (results.length !== groups.length) throw new Error("Each chunk needs an alignment result.");
  const out: WordInterval[] = [];
  groups.forEach((group, g) => {
    const expected = group.word_end - group.word_start;
    const words = [...results[g]].sort((a, b) => a.start - b.start);
    if (words.length !== expected) throw new Error(`Chunk ${g} returned ${words.length} words for ${expected} script words.`);
    words.forEach((w, i) => {
      const previousEnd = out.at(-1)?.end ?? 0;
      const start = round(Math.max(w.start + group.audio_start, previousEnd));
      const end = round(Math.max(w.end + group.audio_start, start + 0.01));
      out.push({ word: tokens[group.word_start + i], start, end });
    });
  });
  if (out.length !== tokens.length) throw new Error(`Stitched ${out.length} words for ${tokens.length} script words.`);
  return out;
}

/** Words from MFA JSON output (`tiers.words.entries`), with clitic labels joined to the previous word. */
export function parseMfaWords(mfa: unknown): WordInterval[] {
  const intervals: WordInterval[] = [];
  const entries = (mfa as { tiers?: { words?: { entries?: unknown } } })?.tiers?.words?.entries;
  if (Array.isArray(entries)) {
    for (const entry of entries) {
      if (!Array.isArray(entry) || entry.length < 3) continue;
      const [start, end, label] = entry;
      if (typeof start !== "number" || typeof end !== "number" || typeof label !== "string" || !label || label === "<eps>") continue;
      if (label.startsWith("'") && intervals.length) {
        intervals.at(-1)!.word += label;
        intervals.at(-1)!.end = end;
      } else intervals.push({ word: label, start, end });
    }
  }
  if (intervals.length) return intervals;
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (!node || typeof node !== "object") return;
    const item = node as Record<string, unknown>;
    const label = item.label ?? item.text ?? item.mark;
    const start = item.begin ?? item.start ?? item.xmin;
    const end = item.end ?? item.stop ?? item.xmax;
    if (typeof label === "string" && typeof start === "number" && typeof end === "number" && label.trim() && !/^<.*>$/.test(label)) intervals.push({ word: label.trim(), start, end });
    Object.values(item).forEach(walk);
  };
  walk(mfa);
  return intervals;
}

/** Minimal 16-bit PCM WAV reader/writer for chunk extraction (sample-exact offsets). */
export function readPcm16Wav(buffer: Buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") throw new Error("Not a WAV file.");
  let offset = 12, sampleRate = 0, channels = 0, bits = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4), size = buffer.readUInt32LE(offset + 4);
    if (id === "fmt ") { channels = buffer.readUInt16LE(offset + 10); sampleRate = buffer.readUInt32LE(offset + 12); bits = buffer.readUInt16LE(offset + 22); }
    if (id === "data") {
      if (channels !== 1 || bits !== 16) throw new Error("Alignment audio must be 16-bit mono PCM.");
      const data = buffer.subarray(offset + 8, offset + 8 + size);
      return { sampleRate, samples: new Int16Array(data.buffer.slice(data.byteOffset, data.byteOffset + (data.length & ~1))) };
    }
    offset += 8 + size + (size & 1);
  }
  throw new Error("WAV has no data chunk.");
}

export function pcm16Wav(samples: Int16Array, sampleRate: number) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0); header.writeUInt32LE(36 + samples.length * 2, 4); header.write("WAVE", 8);
  header.write("fmt ", 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write("data", 36); header.writeUInt32LE(samples.length * 2, 40);
  return Buffer.concat([header, Buffer.from(samples.buffer, samples.byteOffset, samples.length * 2)]);
}

function round(value: number) {
  return Math.round(value * 1000) / 1000;
}
