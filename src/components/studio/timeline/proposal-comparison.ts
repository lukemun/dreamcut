import type {TimelineElement} from './types';
import {sourceTimeToTimelineTime, timelineTimeToSourceTime} from '@/lib/timeline/speed-steps';

/** Compare matching source moments even when the draft retimes or ripples clips. */
export function mapProposalComparisonTime(time: number, from: TimelineElement[], to: TimelineElement[], end = false) {
  const candidates = from.filter(e => !e.removed_at && (e.type === 'video_clip' || e.type === 'still')
    && (end ? e.timeline_start < time && e.timeline_start + e.duration >= time - 1e-5
      : e.timeline_start <= time + 1e-5 && e.timeline_start + e.duration > time));
  candidates.sort((a,b) => Number(b.lane_key === 'visual_0') - Number(a.lane_key === 'visual_0'));
  for (const source of candidates) {
    const target = to.find(e => e.id === source.id && !e.removed_at);
    if (!target) continue;
    const local = Math.max(0, time - source.timeline_start);
    const mapped = source.type === 'video_clip'
      ? sourceTimeToTimelineTime(target, timelineTimeToSourceTime(source, local))
      : local;
    return target.timeline_start + Math.min(target.duration, mapped);
  }
  return time;
}
