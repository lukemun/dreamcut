"use client";
import { useState } from "react";
import { ScrubNumberInput } from "../timeline/InspectorNumericControls";

/**
 * The part of a video or audio reference that is sent (and priced). Exact source times have no meaningful
 * slider range, so each end is a number-only field in seconds.
 */
export function ReferenceWindow({ name, start, end, length, limit, disabled, onChange }: {
  name: string; start: number; end: number; length: number | null; limit: number; disabled: boolean;
  onChange: (window: { start: number; end: number }) => void;
}) {
  const max = length ?? 36000;
  return <div className="grid grid-cols-2 gap-2 px-3 pb-3 text-xs">
    <Seconds label="From" name={name} value={start} min={0} max={Math.max(0, max - 0.5)} disabled={disabled}
      commit={value => onChange({ start: value, end: Math.min(max, Math.max(value + 0.5, Math.min(end, value + limit))) })} />
    <Seconds label="To" name={name} value={end} min={0.5} max={max} disabled={disabled}
      commit={value => onChange({ start: Math.max(0, value - limit, Math.min(start, value - 0.5)), end: value })} />
    <p className="col-span-2 text-[var(--ink-muted)]">{(end - start).toFixed(1)} s used{length ? ` of ${length.toFixed(1)} s` : ""}</p>
  </div>;
}

function Seconds({ label, name, value, min, max, disabled, commit }: { label: string; name: string; value: number; min: number; max: number; disabled: boolean; commit: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return <label className="grid gap-1"><span>{label} (s)</span>
    <ScrubNumberInput ariaLabel={`${label} in ${name}, seconds`} value={draft ?? value.toFixed(2)} min={min} max={max} step={1 / 30} precision={2} disabled={disabled}
      onChange={setDraft} onCancel={() => setDraft(null)}
      onCommit={next => { const number = Number(next ?? draft ?? value); setDraft(null); if (Number.isFinite(number) && number !== value) commit(Math.min(max, Math.max(min, number))); }} />
  </label>;
}
