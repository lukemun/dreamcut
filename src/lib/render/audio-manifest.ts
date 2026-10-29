import type { AudioSample } from "../frame-runtime/session";
/** A reverse run starts at `sourceStart` and moves backward through the source. */
export type AudioRun = { id: string; src: string; firstFrame: number; sourceStart: number; rate: number; preservePitch: boolean; reverse?: boolean; pitch?: number; gains: number[] };
/** Split only where source continuity breaks, never once per gain keyframe. */
export function audioRuns(frames: AudioSample[][], fps: number): AudioRun[] {
  if (!(fps > 0) || !Number.isFinite(fps)) throw new Error("Invalid audio frame rate");
  const runs: AudioRun[] = [], active = new Map<string, AudioRun>();
  frames.forEach((samples, frame) => {
    const seen = new Set<string>();
    for (const sample of samples) {
      if (seen.has(sample.id)) throw new Error(`Duplicate audio owner: ${sample.id}`);
      seen.add(sample.id);
      if (!Number.isFinite(sample.rate) || sample.rate <= 0 || !Number.isFinite(sample.time) || sample.time < 0 || !Number.isFinite(sample.volume) || sample.volume < 0) throw new Error(`Invalid audio clock: ${sample.id}`);
      let run = active.get(sample.id);
      const reverse = sample.reverse === true, direction = reverse ? -1 : 1;
      if (!run || run.src !== sample.src || run.rate !== sample.rate || run.preservePitch !== sample.preservePitch || Boolean(run.reverse) !== reverse || (run.pitch ?? 0) !== (sample.pitch ?? 0) || frame !== run.firstFrame + run.gains.length || Math.abs(sample.time - (run.sourceStart + direction * run.gains.length * run.rate / fps)) > .00001) {
        run = { id: sample.id, src: sample.src, firstFrame: frame, sourceStart: sample.time, rate: sample.rate, preservePitch: sample.preservePitch, ...(reverse ? { reverse: true } : {}), ...(sample.pitch ? { pitch: sample.pitch } : {}), gains: [] };
        runs.push(run); active.set(sample.id, run);
      }
      run.gains.push(sample.volume);
    }
    for (const id of active.keys()) if (!seen.has(id)) active.delete(id);
  });
  return runs.filter(run => run.gains.some(gain => gain > 0));
}
export function tempoFilters(rate: number) {
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("Invalid audio rate");
  const filters: string[] = [];
  while (rate > 2) { filters.push("atempo=2"); rate /= 2; }
  while (rate < .5) { filters.push("atempo=0.5"); rate *= 2; }
  if (rate !== 1) filters.push(`atempo=${rate}`);
  return filters;
}
