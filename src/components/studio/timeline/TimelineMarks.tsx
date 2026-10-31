"use client";

import { Crosshair } from "lucide-react";

export type TimelineMark = { id: string; label: string; time: number; end?: number; note?: string; hasPreviewPoint?: boolean };

/** Shared source/timeline marker rail. Coordinates belong to the caller's clock. */
export function TimelineMarks({ marks, start = 0, duration, selectedId, onSelect }: {
  marks: TimelineMark[]; start?: number; duration: number; selectedId?: string | null;
  onSelect: (mark: TimelineMark) => void;
}) {
  return <div className="pointer-events-none absolute inset-0 z-20" aria-label="Timeline marks">
    {marks.filter(mark => mark.time >= start && mark.time <= start + duration).map(mark => {
      const fraction = duration > 0 ? (mark.time-start)/duration : 0;
      const selected = selectedId === mark.id;
      const label = mark.label.replace(/^Mark\s+/, "M");
      const description = `${mark.label}, ${mark.hasPreviewPoint ? "Preview point" : "Time mark"}, ${mark.time.toFixed(2)}s${mark.end && mark.end > mark.time ? `–${mark.end.toFixed(2)}s` : ""}${mark.note ? ` · ${mark.note}` : ""}`;
      return <div key={mark.id} className="absolute inset-y-0 border-l border-[var(--timeline-review-marker-color)]" style={{left:`${fraction*100}%`}}>
        <button type="button" aria-label={description} title={description} aria-pressed={selected}
          className="pointer-events-auto absolute top-0 inline-flex h-6 min-w-7 items-center justify-center rounded-b border border-[var(--timeline-review-marker-color)] bg-[var(--chrome-panel)] px-1 text-xs font-medium text-[var(--ink)] shadow-sm focus-visible:outline-2 focus-visible:outline-[var(--chrome-focus-ring)]"
          style={{transform:fraction > .9 ? "translateX(-100%)" : undefined, background:selected ? "var(--timeline-review-marker-color)" : undefined, color:selected ? "var(--chrome-deep)" : undefined}}
          onPointerDown={event=>event.stopPropagation()} onClick={event=>{event.stopPropagation();onSelect(mark);}}>{mark.hasPreviewPoint ? <Crosshair aria-hidden="true" className="mr-1 size-3 shrink-0" /> : null}{label}</button>
      </div>;
    })}
  </div>;
}
