import { sourceTimeToTimelineTime, timelineTimeToSourceTime } from '@/lib/timeline/speed-steps';
import { instrumentHitKey, type InstrumentId, type InstrumentResult, type InstrumentSettings } from '@/lib/timeline/instrument-analysis';
import type { TimelineElement } from './types';

export const RHYTHM_ROWS_HEIGHT = 312;
export function rhythmRowsHeight(collapsed: boolean, collapsedInstruments: readonly InstrumentId[]) {
  return collapsed ? 48 : 64 + 24 + 4 * 56 - new Set(collapsedInstruments).size * 24;
}
export function clearRhythmInstrumentHits(result: InstrumentResult, settings: InstrumentSettings, instrument: InstrumentId): InstrumentSettings {
  return { ...settings, marked_hits: rhythmMarkedKeys(result, settings).filter(key => !key.startsWith(`${instrument}:`)) };
}
export function rhythmSourceAt(clip: TimelineElement, time: number) {
  if (time < clip.timeline_start || time >= clip.timeline_start + clip.duration) return null;
  return timelineTimeToSourceTime(clip, time - clip.timeline_start);
}
export function rhythmTimelineAt(clip: TimelineElement, sourceTime: number) {
  const start = timelineTimeToSourceTime(clip, 0), end = timelineTimeToSourceTime(clip, clip.duration);
  if (sourceTime < start || sourceTime >= end) return null;
  return clip.timeline_start + sourceTimeToTimelineTime(clip, sourceTime);
}
/** Only explicitly marked hits are used for edit alignment. */
export function rhythmMarkedKeys(_result: InstrumentResult, settings: InstrumentSettings) {
  return settings.marked_hits ?? [];
}
export function editRhythmHit(result: InstrumentResult, settings: InstrumentSettings, instrument: InstrumentId, seconds: number, manual = false): InstrumentSettings {
  const key = instrumentHitKey(instrument, seconds), keys = rhythmMarkedKeys(result, settings);
  const marked = new Set(keys);
  if (manual || !marked.has(key)) marked.add(key); else marked.delete(key);
  return { ...settings, marked_hits: [...marked], excluded_hits: settings.excluded_hits.filter(k => k !== key),
    manual_hits: manual && !settings.manual_hits.some(h => instrumentHitKey(h.instrument, h.time_seconds) === key)
      ? [...settings.manual_hits, { instrument, time_seconds: seconds }] : settings.manual_hits };
}
