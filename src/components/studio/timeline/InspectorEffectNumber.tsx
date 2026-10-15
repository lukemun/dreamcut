'use client';
import { useEffect, useRef, useState } from 'react';
import { SliderScrubControl } from './InspectorNumericControls';

/** Effect adapter: draft/preview during a gesture, one persisted edit on commit. Compact, like Layout's rows,
 *  so slider, value, +/- and unit share one line. */
export function InspectorEffectNumber({ label, value, min = 0, max, unit, step = 1, onPreview, onCommit }: {
  label: string; value: number; min?: number; max: number; unit: string; step?: number;
  onPreview: (value: number | null) => void; onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const committed = useRef(value);
  useEffect(() => { committed.current = value; setDraft(null); }, [value]);
  return <SliderScrubControl label={label} value={draft ?? String(value)} min={min} max={max}
    step={step} fallback={0} unit={unit} disabled={false} density="compact"
    onChange={next => {
      setDraft(next);
      const number = Number.parseFloat(next);
      if (Number.isFinite(number)) onPreview(Math.max(min, Math.min(max, number)));
    }}
    onCancel={() => { setDraft(null); onPreview(null); }}
    onCommit={next => {
      const number = Number.parseFloat(next ?? draft ?? String(value));
      setDraft(null); onPreview(null);
      if (!Number.isFinite(number)) return;
      const bounded = Math.max(min, Math.min(max, number));
      if (bounded === committed.current) return;
      committed.current = bounded;
      onCommit(bounded);
    }} />;
}
