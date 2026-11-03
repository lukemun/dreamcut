import { detectOnsets, normalize, smooth } from "@/lib/sound-synth/visual-activity";

/**
 * How well a sound follows a visual activity curve, both sampled on the same timeline
 * bins: loudness-envelope correlation, onset offsets in ms and sound with no visual cause.
 * Shared by visual_activity_prepare's check and the sound-sync eval scorer.
 */

export type AlignmentThresholds = {
  /** Envelope-to-activity Pearson correlation at zero lag. */
  min_correlation: number;
  /** Median absolute onset offset, ms. */
  max_median_onset_ms: number;
  /** Share of the sound's energy where nothing is changing on screen. */
  max_uncaused_fraction: number;
};

export const DEFAULT_ALIGNMENT_THRESHOLDS: AlignmentThresholds = {
  min_correlation: 0.6,
  max_median_onset_ms: 40,
  max_uncaused_fraction: 0.15,
};

/** Unmatched visual onsets count as this many ms late in the median. */
export const MISSED_ONSET_MS = 250;

export function pearson(left: ArrayLike<number>, right: ArrayLike<number>, lag = 0) {
  // lag > 0 compares left[i] with right[i + lag] (the sound late by lag bins).
  let n = 0;
  let sumL = 0;
  let sumR = 0;
  for (let index = 0; index < left.length; index += 1) {
    const other = index + lag;
    if (other < 0 || other >= right.length) continue;
    sumL += left[index]!;
    sumR += right[other]!;
    n += 1;
  }
  if (n < 3) return 0;
  const meanL = sumL / n;
  const meanR = sumR / n;
  let cov = 0;
  let varL = 0;
  let varR = 0;
  for (let index = 0; index < left.length; index += 1) {
    const other = index + lag;
    if (other < 0 || other >= right.length) continue;
    const dl = left[index]! - meanL;
    const dr = right[other]! - meanR;
    cov += dl * dr;
    varL += dl * dl;
    varR += dr * dr;
  }
  if (varL <= 1e-12 || varR <= 1e-12) return 0;
  return cov / Math.sqrt(varL * varR);
}

/** Best correlation within ±maxLagSeconds; positive lag_ms means the sound trails the picture. */
export function bestLag(curve: ArrayLike<number>, envelope: ArrayLike<number>, rate: number, maxLagSeconds = 0.15) {
  const maxLag = Math.round(maxLagSeconds * rate);
  let best = { lag_ms: 0, correlation: pearson(curve, envelope, 0) };
  for (let lag = -maxLag; lag <= maxLag; lag += 1) {
    const correlation = pearson(curve, envelope, lag);
    if (correlation > best.correlation + 1e-9) best = { lag_ms: Math.round((lag / rate) * 1000), correlation };
  }
  return best;
}

/** Match each visual onset to the nearest sound onset within tolerance. Offsets are sound minus picture, ms. */
export function matchOnsets(visual: readonly number[], sound: readonly number[], toleranceSeconds = 0.25) {
  const used = new Set<number>();
  const matches: Array<{ visual_seconds: number; sound_seconds: number; offset_ms: number }> = [];
  const missed: number[] = [];
  for (const time of visual) {
    let bestIndex = -1;
    let bestDistance = Infinity;
    sound.forEach((candidate, index) => {
      const distance = Math.abs(candidate - time);
      if (!used.has(index) && distance <= toleranceSeconds && distance < bestDistance) {
        bestIndex = index;
        bestDistance = distance;
      }
    });
    if (bestIndex < 0) missed.push(time);
    else {
      used.add(bestIndex);
      matches.push({ visual_seconds: time, sound_seconds: sound[bestIndex]!, offset_ms: Math.round((sound[bestIndex]! - time) * 1000) });
    }
  }
  const extra = sound.filter((_, index) => !used.has(index));
  return { matches, missed, extra };
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

/**
 * Share of the sound's energy that falls where the picture is still. The curve is
 * widened 50 ms before and `tailSeconds` after activity so natural decays are allowed.
 */
export function uncausedFraction(curve: ArrayLike<number>, envelope: ArrayLike<number>, rate: number, threshold = 0.05, tailSeconds = 0.3) {
  const scaled = normalize(curve);
  const before = Math.round(0.05 * rate);
  const after = Math.round(tailSeconds * rate);
  const caused = new Uint8Array(scaled.length);
  for (let index = 0; index < scaled.length; index += 1) {
    if (scaled[index]! <= threshold) continue;
    for (let other = Math.max(0, index - before); other <= Math.min(scaled.length - 1, index + after); other += 1) caused[other] = 1;
  }
  let total = 0;
  let uncaused = 0;
  for (let index = 0; index < envelope.length; index += 1) {
    const energy = envelope[index]! * envelope[index]!;
    total += energy;
    if (!caused[index]) uncaused += energy;
  }
  return total > 0 ? uncaused / total : 0;
}

/** Spans (seconds from the window start) where the sound is audible with no visual cause. */
export function uncausedSpans(curve: ArrayLike<number>, envelope: ArrayLike<number>, rate: number, threshold = 0.05, tailSeconds = 0.3) {
  const scaled = normalize(curve);
  const env = normalize(envelope);
  const after = Math.round(tailSeconds * rate);
  const before = Math.round(0.05 * rate);
  const spans: Array<[number, number]> = [];
  let open: number | null = null;
  for (let index = 0; index <= env.length; index += 1) {
    let caused = false;
    if (index < env.length) {
      for (let other = Math.max(0, index - after); other <= Math.min(scaled.length - 1, index + before); other += 1) {
        if (scaled[other]! > threshold) { caused = true; break; }
      }
    }
    const bad = index < env.length && env[index]! > 0.1 && !caused;
    if (bad && open == null) open = index;
    if (!bad && open != null) {
      if (index - open >= Math.round(0.05 * rate)) spans.push([open / rate, index / rate]);
      open = null;
    }
  }
  return spans;
}

export type AlignmentReport = {
  correlation: number;
  best_lag_ms: number;
  correlation_at_best_lag: number;
  onsets: {
    visual_seconds: number[];
    sound_seconds: number[];
    offsets_ms: number[];
    median_abs_offset_ms: number | null;
    missed_visual_seconds: number[];
    extra_sound_seconds: number[];
  };
  uncaused_energy_fraction: number;
  uncaused_spans_seconds: Array<[number, number]>;
  pass: boolean;
  failures: string[];
};

/**
 * Compare a sound's linear loudness envelope with a visual activity curve on the same
 * bins (`windowStart` only offsets the reported times). The envelope is smoothed 20 ms.
 */
export function alignmentReport(
  curve: ArrayLike<number>,
  envelope: ArrayLike<number>,
  rate: number,
  windowStart = 0,
  thresholds: AlignmentThresholds = DEFAULT_ALIGNMENT_THRESHOLDS,
): AlignmentReport {
  const visual = normalize(curve);
  const sound = normalize(smooth(envelope, Math.max(0, Math.round(0.02 * rate))));
  const correlation = pearson(visual, sound);
  const lag = bestLag(visual, sound, rate);
  const visualOnsets = detectOnsets(visual, rate);
  const soundOnsets = detectOnsets(sound, rate);
  const matched = matchOnsets(visualOnsets, soundOnsets);
  const scored = [...matched.matches.map((match) => Math.abs(match.offset_ms)), ...matched.missed.map(() => MISSED_ONSET_MS)];
  const medianOffset = median(scored);
  const uncaused = uncausedFraction(visual, sound, rate);
  const failures: string[] = [];
  if (correlation < thresholds.min_correlation) failures.push(`loudness follows the picture with correlation ${correlation.toFixed(2)} (needs ${thresholds.min_correlation})`);
  if (medianOffset != null && medianOffset > thresholds.max_median_onset_ms) failures.push(`onsets are ${Math.round(medianOffset)} ms off at the median (allowed ${thresholds.max_median_onset_ms})`);
  if (uncaused > thresholds.max_uncaused_fraction) failures.push(`${Math.round(uncaused * 100)}% of the sound plays while nothing changes on screen (allowed ${Math.round(thresholds.max_uncaused_fraction * 100)}%)`);
  const at = (time: number) => Number((windowStart + time).toFixed(3));
  return {
    correlation: Number(correlation.toFixed(3)),
    best_lag_ms: lag.lag_ms,
    correlation_at_best_lag: Number(lag.correlation.toFixed(3)),
    onsets: {
      visual_seconds: visualOnsets.map(at),
      sound_seconds: soundOnsets.map(at),
      offsets_ms: matched.matches.map((match) => match.offset_ms),
      median_abs_offset_ms: medianOffset == null ? null : Math.round(medianOffset),
      missed_visual_seconds: matched.missed.map(at),
      extra_sound_seconds: matched.extra.map(at),
    },
    uncaused_energy_fraction: Number(uncaused.toFixed(3)),
    uncaused_spans_seconds: uncausedSpans(visual, sound, rate).map(([from, to]) => [at(from), at(to)] as [number, number]),
    pass: failures.length === 0,
    failures,
  };
}

export const MIN_TURN_RESPONSE = 1.25;

/**
 * Does the sound change where the stroke turns? For each turn (seconds from the window
 * start), compare the sound within ±30 ms with the drawing around it (±200 ms, away from
 * any turn): its brightness (share of energy above the high-pass) and its loudness. A turn
 * counts the larger of the two ratios, or 0 when the sound there is under half as loud as the
 * stroke around it; the median across turns must reach MIN_TURN_RESPONSE.
 */
export function turnResponse(turns: readonly number[], full: ArrayLike<number>, bright: ArrayLike<number>, rate: number, windowStart = 0) {
  let peak = 0;
  for (let index = 0; index < full.length; index += 1) peak = Math.max(peak, full[index]!);
  const audible = (index: number) => full[index]! > 0.05 * peak;
  const near = Math.round(0.03 * rate);
  const around = Math.round(0.2 * rate);
  const keepAway = Math.round(0.06 * rate);
  const turnBins = turns.map((time) => Math.round(time * rate));
  const mean = (indices: number[], value: (index: number) => number) => (indices.length ? indices.reduce((sum, index) => sum + value(index), 0) / indices.length : 0);
  const brightness = (index: number) => bright[index]! / Math.max(1e-9, full[index]!);
  const perTurn = turnBins.map((bin, order) => {
    const at: number[] = [];
    const ref: number[] = [];
    for (let index = Math.max(0, bin - around); index <= Math.min(full.length - 1, bin + around); index += 1) {
      if (!audible(index)) continue;
      if (Math.abs(index - bin) <= near) at.push(index);
      else if (turnBins.every((other) => Math.abs(index - other) > keepAway)) ref.push(index);
    }
    const brightnessRatio = at.length && ref.length ? mean(at, brightness) / Math.max(1e-9, mean(ref, brightness)) : 0;
    const loudnessRatio = at.length && ref.length ? mean(at, (index) => full[index]!) / Math.max(1e-9, mean(ref, (index) => full[index]!)) : 0;
    return {
      time_seconds: Number((windowStart + turns[order]!).toFixed(3)),
      brightness_ratio: Number(brightnessRatio.toFixed(2)),
      loudness_ratio: Number(loudnessRatio.toFixed(2)),
      // A near-silent sound at the turn has an unstable brightness, and no audible change: it scores 0.
      response: Number((loudnessRatio < 0.5 ? 0 : Math.max(brightnessRatio, loudnessRatio)).toFixed(2)),
    };
  });
  const sorted = perTurn.map((turn) => turn.response).sort((left, right) => left - right);
  const median = sorted.length ? (sorted.length % 2 ? sorted[(sorted.length - 1) / 2]! : (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2) : null;
  return { turns: perTurn, median_response: median == null ? null : Number(median.toFixed(2)), pass: median != null && median >= MIN_TURN_RESPONSE };
}
