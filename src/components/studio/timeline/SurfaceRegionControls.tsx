"use client";
import { useEffect, useState } from "react";
import { FULL_SURFACE_REGION, readSurfaceRegion, type SurfaceRegion } from "@/lib/timeline/surface-placement";
import { InspectorPropertyControl } from "./InspectorPropertyControl";
import { SliderScrubControl } from "./InspectorNumericControls";

const EDGES = [
  { label: "Left", index: 0, inward: 1 },
  { label: "Right", index: 2, inward: -1 },
  { label: "Top", index: 1, inward: 1 },
  { label: "Bottom", index: 3, inward: -1 },
] as const;

/**
 * How far a picture on a tracked screen sits in from each edge, as a share of the screen: an inset
 * leaves the screen's own frame showing; larger insets split one screen between several pictures.
 * Dragging previews through the draft; release saves one Undo step.
 */
export function SurfaceRegionControls({ value, onPatch }: { value: unknown; onPatch: (patch: Record<string, unknown>) => void }) {
  const saved = readSurfaceRegion(value);
  const [draft, setDraft] = useState<Record<number, string>>({});
  useEffect(() => setDraft({}), [value]);
  const inset = (index: number, inward: number) => Math.round((inward > 0 ? saved[index] : 1 - saved[index]) * 1000) / 10;
  const save = (index: number, inward: number, text?: string) => {
    const percent = Number(text ?? draft[index]);
    setDraft(({ [index]: _done, ...rest }) => rest);
    if (!Number.isFinite(percent)) return;
    const next = [...saved] as [number, number, number, number];
    next[index] = inward > 0 ? percent / 100 : 1 - percent / 100;
    if (next[2] - next[0] > 0.02 && next[3] - next[1] > 0.02) onPatch({ surface_region: next satisfies SurfaceRegion });
  };
  return <div className="grid min-w-0 gap-1" data-surface-region>
    {EDGES.map(({ label, index, inward }) => {
      const fallback = (inward > 0 ? FULL_SURFACE_REGION[index] : 1 - FULL_SURFACE_REGION[index]) * 100;
      return <InspectorPropertyControl key={label} label={label} fields="surface_region" density="compact" disabled={inset(index, inward) === fallback}
        onReset={() => save(index, inward, String(fallback))}>
        <SliderScrubControl label={`${label} inset`} value={draft[index] ?? String(inset(index, inward))} min={-20} max={80} step={0.5} fallback={fallback} unit="%"
          sliderRange={{ min: 0, max: 50 }} disabled={false} onChange={(next) => setDraft((current) => ({ ...current, [index]: next }))}
          onCommit={(next) => save(index, inward, next)} onCancel={() => setDraft(({ [index]: _cancelled, ...rest }) => rest)} />
      </InspectorPropertyControl>;
    })}
  </div>;
}
