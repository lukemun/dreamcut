import { execFile } from "node:child_process";

import sharp from "sharp";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { searchSfxCatalog, type SfxRole, type SfxSearchHit } from "@/lib/sfx-catalog/search";

/**
 * SFX audition preparation for agents that cannot listen: what happens at a cue (picture,
 * speech, existing audio), a shortlist of catalog sounds placed so each one's measured peak
 * lands on the cue, and an image of every candidate's loudness envelope on the cue's time
 * axis. The creator still auditions by ear through proposal options.
 */

const AUDIO_TYPES = new Set(["sound_effect", "music", "vo_segment", "vo_full"]);
const SPEECH_TYPES = new Set(["vo_segment", "vo_full"]);
/** Role loudness reference for sound effects, shared with element_normalize. */
export const SFX_REFERENCE_LUFS = -18;
/** Sit an effect 6 dB lower when it lands on speech. */
const UNDER_SPEECH_GAIN = 0.5;

function elementLabel(element: TimelineElement): string {
  const props = element.props ?? {};
  const label = [props.title, props.label, props.text, props.name].find((value) => typeof value === "string" && value.trim());
  if (typeof label === "string") return label.trim().slice(0, 80);
  const file = element.source_url?.split("/").pop();
  return file ? decodeURIComponent(file).slice(0, 80) : element.type;
}

export type CueContext = {
  cue_seconds: number;
  window: { start_seconds: number; end_seconds: number };
  picture: Array<{ element_id: string; type: string; lane_key: string; label: string; start_seconds: number; end_seconds: number; at_cue: "enters" | "exits" | "on_screen" | "nearby" }>;
  speech: Array<{ element_id: string; text: string; start_seconds: number; end_seconds: number }>;
  /** "words" when caption word timings exist; "captions" spans include pauses between words. */
  speech_basis: "words" | "captions";
  words_near_cue: Array<{ text: string; start_seconds: number; end_seconds: number }>;
  speech_before_end_seconds: number | null;
  speech_after_start_seconds: number | null;
  speaking_at_cue: boolean;
  audio: Array<{ element_id: string; type: string; lane_key: string; label: string; start_seconds: number; end_seconds: number; volume: number }>;
};

/** Everything on the timeline around a cue, with entrances and exits near the cue called out. */
export function cueContext(elements: TimelineElement[], cueSeconds: number, contextSeconds = 1.5): CueContext {
  const start = Math.max(0, cueSeconds - contextSeconds);
  const end = cueSeconds + contextSeconds;
  const overlaps = (element: TimelineElement) => element.timeline_start < end && element.timeline_start + element.duration > start;
  const near = (time: number) => Math.abs(time - cueSeconds) <= 0.25;
  const captions = elements.filter((element) => element.type === "caption_text");
  // Word timings (caption-relative) are exact speech; caption spans also cover pauses.
  const words = captions.flatMap((element) => {
    const timings = element.props?.wordTimings;
    if (!Array.isArray(timings)) return [];
    return timings.flatMap((word) => {
      const value = word as { text?: unknown; start?: unknown; end?: unknown };
      return typeof value.text === "string" && typeof value.start === "number" && typeof value.end === "number"
        ? [{ text: value.text, start: element.timeline_start + value.start, end: element.timeline_start + value.end }]
        : [];
    });
  });
  const wordCaptionIds = new Set(captions.filter((element) => Array.isArray(element.props?.wordTimings)).map((element) => element.id));
  const speechSpans = [
    ...words,
    ...captions.filter((element) => !wordCaptionIds.has(element.id)).map((element) => ({ start: element.timeline_start, end: element.timeline_start + element.duration })),
    ...elements.filter((element) => SPEECH_TYPES.has(element.type) && words.length === 0).map((element) => ({ start: element.timeline_start, end: element.timeline_start + element.duration })),
  ];
  const before = speechSpans.filter((span) => span.end <= cueSeconds).map((span) => span.end);
  const after = speechSpans.filter((span) => span.start >= cueSeconds).map((span) => span.start);
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    cue_seconds: round(cueSeconds),
    window: { start_seconds: round(start), end_seconds: round(end) },
    picture: elements
      .filter((element) => !AUDIO_TYPES.has(element.type) && element.type !== "caption_text" && overlaps(element))
      .map((element) => {
        const elementEnd = element.timeline_start + element.duration;
        const atCue = near(element.timeline_start) ? "enters" as const
          : near(elementEnd) ? "exits" as const
            : element.timeline_start <= cueSeconds && elementEnd >= cueSeconds ? "on_screen" as const : "nearby" as const;
        return { element_id: element.id, type: element.type, lane_key: element.lane_key, label: elementLabel(element), start_seconds: round(element.timeline_start), end_seconds: round(elementEnd), at_cue: atCue };
      })
      .sort((a, b) => a.start_seconds - b.start_seconds),
    speech: captions.filter(overlaps).map((element) => ({
      element_id: element.id,
      text: typeof element.props?.text === "string" ? element.props.text.slice(0, 200) : "",
      start_seconds: round(element.timeline_start),
      end_seconds: round(element.timeline_start + element.duration),
    })),
    speech_basis: words.length > 0 ? "words" : "captions",
    words_near_cue: words.filter((word) => word.end >= cueSeconds - 0.6 && word.start <= cueSeconds + 0.6)
      .map((word) => ({ text: word.text, start_seconds: round(word.start), end_seconds: round(word.end) })),
    speech_before_end_seconds: before.length ? round(Math.max(...before)) : null,
    speech_after_start_seconds: after.length ? round(Math.min(...after)) : null,
    speaking_at_cue: speechSpans.some((span) => span.start < cueSeconds && span.end > cueSeconds),
    audio: elements.filter((element) => AUDIO_TYPES.has(element.type) && overlaps(element)).map((element) => ({
      element_id: element.id,
      type: element.type,
      lane_key: element.lane_key,
      label: elementLabel(element),
      start_seconds: round(element.timeline_start),
      end_seconds: round(element.timeline_start + element.duration),
      volume: element.volume,
    })),
  };
}

export type AuditionPlacement = {
  timeline_start: number;
  source_start_seconds: number;
  source_end_seconds: number;
  peak_at_seconds: number;
  audible_until_seconds: number;
  overlaps_next_speech_seconds: number;
  volume: number;
  lane_key: string;
};

/** First sound_effect_N lane with nothing in the clip's span. */
export function freeSfxLane(elements: TimelineElement[], start: number, end: number): { lane_key: string; lane_index: number } {
  const lastLane = 31;
  for (let index = 0; index <= lastLane; index += 1) {
    const lane = `sound_effect_${index}`;
    const busy = elements.some((element) => element.lane_key === lane && element.timeline_start < end - 1e-6 && element.timeline_start + element.duration > start + 1e-6);
    if (!busy) return { lane_key: lane, lane_index: index };
  }
  // Every lane is busy: stack on the last one.
  return { lane_key: `sound_effect_${lastLane}`, lane_index: lastLane };
}

/** Place a sound so its measured peak lands on the cue, trimming its head if the cue is near zero. */
export function placeAtCue(hit: SfxSearchHit, context: CueContext): AuditionPlacement & { lane_index: number } {
  const peak = hit.analysis.peak_time_seconds ?? 0;
  let start = context.cue_seconds - peak;
  let sourceStart = 0;
  if (start < 0) {
    sourceStart = -start;
    start = 0;
  }
  const activeEnd = hit.analysis.active_end_seconds ?? hit.duration_seconds;
  const audibleUntil = start + Math.max(0, activeEnd - sourceStart);
  const next = context.speech_after_start_seconds;
  const overlapsSpeech = next != null && audibleUntil > next ? audibleUntil - next : 0;
  const lufs = hit.analysis.integrated_lufs;
  let volume = lufs != null ? 10 ** ((SFX_REFERENCE_LUFS - lufs) / 20) : 1;
  if (context.speaking_at_cue || overlapsSpeech > 0.05) volume *= UNDER_SPEECH_GAIN;
  volume = Math.max(0.05, Math.min(2, volume));
  const round = (value: number) => Math.round(value * 1000) / 1000;
  return {
    timeline_start: round(start),
    source_start_seconds: round(sourceStart),
    source_end_seconds: round(hit.duration_seconds),
    peak_at_seconds: round(context.cue_seconds),
    audible_until_seconds: round(audibleUntil),
    overlaps_next_speech_seconds: round(overlapsSpeech),
    volume: Math.round(volume * 100) / 100,
    lane_key: "",
    lane_index: 0,
  };
}

const ENVELOPE_RATE = 4000;
const ENVELOPE_BIN_SECONDS = 0.01;

/** Loudness envelope (0..1 per 10 ms) of an audio file, decoded with ffmpeg. */
export function audioEnvelope(absolutePath: string, maxSeconds = 12): Promise<number[]> {
  return new Promise((resolve, reject) => {
    execFile("ffmpeg", ["-v", "error", "-i", absolutePath, "-t", String(maxSeconds), "-ac", "1", "-ar", String(ENVELOPE_RATE), "-f", "f32le", "-"],
      { encoding: "buffer", maxBuffer: 64 * 1024 * 1024, timeout: 20_000 }, (error, stdout) => {
        if (error) {
          reject(new Error(`Could not read audio for its waveform: ${error.message}`));
          return;
        }
        const samples = new Float32Array(stdout.buffer, stdout.byteOffset, Math.floor(stdout.byteLength / 4));
        const binSize = Math.round(ENVELOPE_RATE * ENVELOPE_BIN_SECONDS);
        const bins: number[] = [];
        for (let offset = 0; offset < samples.length; offset += binSize) {
          let sum = 0;
          const end = Math.min(samples.length, offset + binSize);
          for (let index = offset; index < end; index += 1) sum += samples[index]! * samples[index]!;
          bins.push(Math.sqrt(sum / Math.max(1, end - offset)));
        }
        const peak = Math.max(1e-6, ...bins);
        resolve(bins.map((value) => value / peak));
      });
  });
}

const escapeXml = (text: string) => text.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]!);

/**
 * One image the agent can read: the cue window's time axis, picture entrances/exits,
 * speech spans, and each candidate's envelope where it would play, with its peak marked.
 */
export async function renderAuditionImage(
  context: CueContext,
  candidates: Array<{ label: string; placement: AuditionPlacement; envelope: number[] }>,
): Promise<Buffer> {
  const width = 1200;
  const left = 220;
  const right = 20;
  const plot = width - left - right;
  const header = 70;
  const laneHeight = 26;
  const rowHeight = 86;
  const pictureRows = Math.min(6, context.picture.length);
  const top = header + (pictureRows + 1) * laneHeight + 10;
  const height = top + candidates.length * rowHeight + 30;
  const { start_seconds: t0, end_seconds: t1 } = context.window;
  const x = (time: number) => left + ((time - t0) / (t1 - t0)) * plot;
  const clampX = (time: number) => Math.max(left, Math.min(left + plot, x(time)));
  const parts: string[] = [
    `<rect width="${width}" height="${height}" fill="#111418"/>`,
    `<text x="20" y="28" fill="#e8ecf2" font-size="18" font-family="Helvetica, Arial" font-weight="700">SFX audition at ${context.cue_seconds.toFixed(2)}s</text>`,
    `<text x="20" y="50" fill="#9aa4b2" font-size="13" font-family="Helvetica, Arial">Window ${t0.toFixed(2)}–${t1.toFixed(2)}s · bars are timeline spans · waveforms show where each sound plays · ▲ = its loudest moment</text>`,
  ];
  for (let tick = Math.ceil(t0 * 4) / 4; tick <= t1 + 1e-9; tick += 0.25) {
    const major = Math.abs(tick * 2 - Math.round(tick * 2)) < 1e-6;
    parts.push(`<line x1="${x(tick)}" x2="${x(tick)}" y1="${header - 6}" y2="${height - 24}" stroke="${major ? "#2a313b" : "#1b2027"}"/>`);
    if (major) parts.push(`<text x="${x(tick)}" y="${height - 8}" fill="#7d8796" font-size="11" text-anchor="middle" font-family="Helvetica, Arial">${tick.toFixed(1)}s</text>`);
  }
  context.picture.slice(0, pictureRows).forEach((item, index) => {
    const y = header + index * laneHeight;
    const color = item.at_cue === "enters" ? "#3d8bfd" : item.at_cue === "exits" ? "#f0a23b" : "#4a5361";
    parts.push(`<text x="20" y="${y + 17}" fill="#c6ccd6" font-size="12" font-family="Helvetica, Arial">${escapeXml(item.label.slice(0, 26))}</text>`);
    parts.push(`<rect x="${clampX(item.start_seconds)}" y="${y + 5}" width="${Math.max(2, clampX(item.end_seconds) - clampX(item.start_seconds))}" height="16" rx="3" fill="${color}"/>`);
  });
  const speechY = header + pictureRows * laneHeight;
  parts.push(`<text x="20" y="${speechY + 17}" fill="#c6ccd6" font-size="12" font-family="Helvetica, Arial">${context.speech_basis === "words" ? "Speech (words)" : "Speech (captions)"}</text>`);
  const spans = context.speech_basis === "words"
    ? context.words_near_cue
    : context.speech;
  for (const span of spans) {
    parts.push(`<rect x="${clampX(span.start_seconds)}" y="${speechY + 5}" width="${Math.max(2, clampX(span.end_seconds) - clampX(span.start_seconds))}" height="16" rx="3" fill="#2fbf71" opacity="0.8"/>`);
  }
  candidates.forEach((candidate, index) => {
    const y = top + index * rowHeight;
    const mid = y + rowHeight / 2;
    parts.push(`<text x="20" y="${mid - 4}" fill="#e8ecf2" font-size="13" font-weight="700" font-family="Helvetica, Arial">${index + 1}. ${escapeXml(candidate.label.slice(0, 24))}</text>`);
    parts.push(`<text x="20" y="${mid + 14}" fill="#9aa4b2" font-size="11" font-family="Helvetica, Arial">vol ${candidate.placement.volume.toFixed(2)}${candidate.placement.overlaps_next_speech_seconds > 0 ? ` · tail +${candidate.placement.overlaps_next_speech_seconds.toFixed(2)}s into speech` : ""}</text>`);
    parts.push(`<line x1="${left}" x2="${left + plot}" y1="${mid}" y2="${mid}" stroke="#2a313b"/>`);
    const startTime = candidate.placement.timeline_start;
    const points: string[] = [];
    const lower: string[] = [];
    candidate.envelope.forEach((value, bin) => {
      // Where this slice of the source plays on the timeline, after any trimmed head.
      const sourceTime = bin * ENVELOPE_BIN_SECONDS;
      if (sourceTime < candidate.placement.source_start_seconds) return;
      const playTime = startTime + sourceTime - candidate.placement.source_start_seconds;
      if (playTime < t0 || playTime > t1) return;
      const amplitude = value * (rowHeight / 2 - 10);
      points.push(`${x(playTime).toFixed(1)},${(mid - amplitude).toFixed(1)}`);
      lower.unshift(`${x(playTime).toFixed(1)},${(mid + amplitude).toFixed(1)}`);
    });
    if (points.length > 1) parts.push(`<polygon points="${[...points, ...lower].join(" ")}" fill="#7aa7ff" opacity="0.85"/>`);
    const peakX = x(candidate.placement.peak_at_seconds);
    parts.push(`<path d="M ${peakX - 6} ${y + rowHeight - 6} L ${peakX + 6} ${y + rowHeight - 6} L ${peakX} ${y + rowHeight - 16} Z" fill="#ffd166"/>`);
  });
  parts.push(`<line x1="${x(context.cue_seconds)}" x2="${x(context.cue_seconds)}" y1="${header - 10}" y2="${height - 24}" stroke="#ff5d73" stroke-width="2"/>`);
  parts.push(`<text x="${x(context.cue_seconds) + 4}" y="${header - 12}" fill="#ff5d73" font-size="12" font-family="Helvetica, Arial">cue</text>`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${parts.join("")}</svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

export type AuditionRequest = {
  cue_seconds: number;
  role: SfxRole;
  query?: string;
  candidate_ids?: string[];
  max_candidates?: number;
  context_seconds?: number;
};

export { searchSfxCatalog };
