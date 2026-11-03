"use client";

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, LockKeyhole, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { instrumentColors, instrumentIds, instrumentLabels, visibleInstrumentHits, type InstrumentId, type InstrumentPayload } from '@/lib/timeline/instrument-analysis';
import type { TimelineElement } from './types';
import { readRhythmResponse } from './rhythm-view-window';
import { rhythmSourceAt, rhythmTimelineAt, rhythmRowsHeight } from './timeline-rhythm-rows';

export type TimelineRhythmView = { projectId: string; clip: TimelineElement; onClose: () => void; onReview: () => void };
export function TimelineRhythmRows({ view, top, sidebarWidth, width, scrollSec, pxPerSec, playhead, onSeek, onHeightChange }: {
  view: TimelineRhythmView; top: number; sidebarWidth: number; width: number; scrollSec: number; pxPerSec: number;
  playhead: number; onSeek: (time: number) => void; onHeightChange: (height: number) => void;
}) {
  const { clip } = view;
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedInstruments, setCollapsedInstruments] = useState<InstrumentId[]>([]);
  const [payload, setPayload] = useState<InstrumentPayload | null>(null);
  const [error, setError] = useState('');
  const height = rhythmRowsHeight(collapsed, collapsedInstruments);
  const contentWidth = Math.max(1, width - sidebarWidth);
  const viewEnd = scrollSec + contentWidth / pxPerSec;
  const url = `/api/projects/${encodeURIComponent(view.projectId)}/library/instruments`;

  useEffect(() => onHeightChange(height), [height, onHeightChange]);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const data = await readRhythmResponse<InstrumentPayload>(await fetch(`${url}?source_url=${encodeURIComponent(clip.source_url!)}`, { cache: 'no-store' }));
        if (active) { setPayload(data); setError(''); }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : 'Cannot read instruments'); }
    }
    void load();
    const refresh = () => void load();
    window.addEventListener('instrument-map-changed', refresh);
    return () => { active = false; window.removeEventListener('instrument-map-changed', refresh); };
  }, [url, clip.source_url]);

  return <section aria-label="Soundtrack instrument waveforms" className="absolute left-0 text-[var(--ink)]" style={{ top, width, height, background: 'var(--chrome-deep)', zIndex: 1 }} onPointerDown={event => event.stopPropagation()} onContextMenu={event => { event.preventDefault(); event.stopPropagation(); }}>
    <div className={`${collapsed ? 'h-12' : 'h-16'} min-w-0 border-y border-[var(--chrome-line)] px-3 text-xs`}>
      <div className="flex h-8 min-w-0 items-center gap-2">
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={collapsed ? 'Expand instrument waveforms' : 'Collapse instrument waveforms'} aria-expanded={!collapsed} onClick={() => setCollapsed(value => !value)}>{collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</Button>
        <LockKeyhole size={13} className="shrink-0" /><span className="min-w-0 flex-1 truncate">{String(clip.props?.title || 'Soundtrack')}</span>
        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={view.onReview}>Review hits</Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Hide instrument waveforms" onClick={view.onClose}><X size={14} /></Button>
      </div>
      {!collapsed && <div className="flex h-8 min-w-0 items-center text-[var(--ink-muted)]"><span role={error ? 'alert' : 'status'} className="truncate" title={error || payload?.message}>{error || (payload?.state === 'ready' ? `${payload.settings.marked_hits?.length ?? 0} selected hits · edit in Review hits` : payload?.message || (payload ? 'Separate instruments in Review hits.' : 'Loading instruments…'))}</span></div>}
    </div>
    {!collapsed && <div className="grid h-6 border-b border-[var(--chrome-line)] text-[10px] tabular-nums text-[var(--ink-muted)]" style={{ gridTemplateColumns: `${sidebarWidth}px minmax(0,1fr)` }}>
      <span className="border-r border-[var(--chrome-line)] pl-3">Time · click to seek</span>
      <div aria-label="Instrument time ruler; click to place playhead" className="relative cursor-crosshair overflow-hidden" onPointerDown={event => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); const bounds = event.currentTarget.getBoundingClientRect(); onSeek(Math.max(clip.timeline_start, Math.min(clip.timeline_start + clip.duration, scrollSec + (event.clientX - bounds.left) / pxPerSec))); }} onPointerMove={event => { if (event.buttons !== 1 || !event.currentTarget.hasPointerCapture(event.pointerId)) return; const bounds = event.currentTarget.getBoundingClientRect(); onSeek(Math.max(clip.timeline_start, Math.min(clip.timeline_start + clip.duration, scrollSec + (event.clientX - bounds.left) / pxPerSec))); }}>
        {Array.from({ length: Math.ceil(contentWidth / Math.max(1, pxPerSec * 5)) + 1 }, (_, index) => { const step = Math.max(1, Math.ceil(65 / Math.max(1, pxPerSec))); const tick = Math.ceil(scrollSec / step) * step + index * step; return <span key={tick} className="pointer-events-none absolute top-1" style={{ left: (tick - scrollSec) * pxPerSec }}>{tick.toFixed(0)}s</span>; })}
      </div>
    </div>}
    {!collapsed && instrumentIds.map(id => {
      const rowCollapsed = collapsedInstruments.includes(id);
      const lane = payload?.result?.lanes.find(candidate => candidate.id === id);
      const color = instrumentColors[id];
      const selectedHits = lane && payload?.settings
        ? visibleInstrumentHits(lane, { ...payload.settings, marked_hits: payload.settings.marked_hits ?? [] })
          .flatMap(hit => { const time = rhythmTimelineAt(clip, hit.time_seconds); return time !== null && time >= scrollSec && time < viewEnd ? [time] : []; })
        : [];
      const bars: Array<{ x: number; value: number }> = [];
      if (lane && payload?.result) for (let x = 0; x < contentWidth; x += 3) {
        const source = rhythmSourceAt(clip, scrollSec + x / pxPerSec);
        if (source === null || source >= payload.result.duration) continue;
        const index = Math.floor(source / payload.result.duration * lane.peaks.length);
        bars.push({ x, value: lane.peaks[index] ?? 0 });
      }
      const max = lane ? Math.max(.001, ...lane.peaks) : 1;
      return <div key={id} className="grid border-b border-[var(--chrome-line)]" style={{ height: rowCollapsed ? 32 : 56, gridTemplateColumns: `${sidebarWidth}px minmax(0,1fr)` }}>
        <div className="flex min-w-0 items-center gap-1 border-r border-[var(--chrome-line)] pl-2 pr-2 text-xs">
          <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" aria-label={`${rowCollapsed ? 'Expand' : 'Collapse'} ${instrumentLabels[id]} waveform`} aria-expanded={!rowCollapsed} onClick={() => setCollapsedInstruments(current => rowCollapsed ? current.filter(value => value !== id) : [...current, id])}>{rowCollapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}</Button>
          <span className="min-w-0 flex-1 truncate">{instrumentLabels[id]}</span>
        </div>
        <div className="relative overflow-hidden" style={{ display: rowCollapsed ? 'none' : undefined }} aria-label={`${instrumentLabels[id]} waveform`}>
          <svg aria-hidden="true" width="100%" height="56" style={{ position: 'absolute', pointerEvents: 'none' }}><path stroke={color} opacity=".6" strokeWidth="2" d={bars.map(bar => `M${bar.x},${28 - bar.value / max * 22}v${bar.value / max * 44}`).join(' ')} /></svg>
          {selectedHits.map(time => <span key={time} aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-[2px]" style={{ left: (time - scrollSec) * pxPerSec - 1, background: color, boxShadow: `0 0 0 1px var(--chrome-deep)` }} />)}
          {playhead >= scrollSec && playhead < viewEnd && <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 w-px" style={{ left: (playhead - scrollSec) * pxPerSec, background: 'var(--timeline-position-color, #e86550)' }} />}
        </div>
      </div>;
    })}
  </section>;
}
