/**
 * Voice pitch: a clip's `props.pitch_semitones` moves its sound up or down without
 * changing its speed or timing. 0 (or absent) is the clip as recorded; -12..+12 is
 * one octave either way. Preview shifts it live in the browser (pitch-shift-worklet.ts);
 * export applies the same ratio with FFmpeg (pitchShiftFilters). It composes with
 * playback_rate, speed steps and speed changes, which keep owning timing.
 */

export const PITCH_SEMITONES_MIN = -12;
export const PITCH_SEMITONES_MAX = 12;
/** Clip types whose own sound the pitch dial changes. */
export const PITCH_ELEMENT_TYPES: ReadonlySet<string> = new Set(["video_clip", "vo_segment", "vo_full"]);

/** The stored semitone shift, bounded; anything missing or invalid is no shift. */
export function readPitchSemitones(props: Record<string, unknown> | null | undefined): number {
  const value = Number(props?.pitch_semitones);
  if (!Number.isFinite(value)) return 0;
  return Math.max(PITCH_SEMITONES_MIN, Math.min(PITCH_SEMITONES_MAX, value));
}

/** Frequency ratio for a semitone shift: -12 halves every pitch, +12 doubles it. */
export function pitchRatio(semitones: number): number {
  return 2 ** (semitones / 12);
}

/**
 * FFmpeg filters that shift pitch by `semitones` and leave duration alone: play the samples
 * at `ratio` times the rate (pitch and speed both move), return to the output rate, then
 * undo the speed change with atempo. Empty for no shift.
 */
export function pitchShiftFilters(semitones: number, sampleRate: number, tempoFilters: (rate: number) => string[]): string[] {
  if (!semitones) return [];
  const ratio = pitchRatio(semitones);
  return [`asetrate=${sampleRate * ratio}`, `aresample=${sampleRate}`, ...tempoFilters(1 / ratio)];
}
