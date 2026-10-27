import type { MediaContextCoverage } from './schema';

/** Discrete observations never certify the time between them. Empty detections
 * still count as examined frames; track presence is not a coverage authority. */
export function discreteObservationCoverage(times: number[], duration: number): MediaContextCoverage {
  const observed = [...new Set(times.filter(t => Number.isFinite(t) && t >= 0 && t <= duration))].sort((a,b) => a-b);
  const gaps: Array<[number, number]> = [];
  let previous = 0;
  for (const time of observed) { if (time > previous) gaps.push([previous, time]); previous = time; }
  if (duration > previous) gaps.push([previous, duration]);
  return {
    timebase: 'source_seconds', status: observed.length ? 'partial' : 'unavailable',
    ranges: observed.map(t => [t,t]), gaps,
    observation_kind: 'discrete_frames', observed_times_seconds: observed,
  };
}
