"use client";
import { useRef, useState } from "react";
import { RangeSlider } from "@/components/ui/slider";
import { InspectorPropertyControl } from "../timeline/InspectorPropertyControl";
import { ScrubNumberInput } from "../timeline/InspectorNumericControls";

const MIN_SECONDS = 0.5;
const seconds = (value: number) => `${value.toFixed(2)}s`;

/**
 * The part of a video or audio reference that is sent (and priced): one slider over the whole
 * clip with two handles, plus Start and End as compact rows like proposal dials. Dragging
 * previews locally; release commits once. The window never exceeds the model's `limit`.
 */
export function ReferenceWindow({ name, start, end, length, limit, disabled, onChange }: {
  name: string; start: number; end: number; length: number | null; limit: number; disabled: boolean;
  onChange: (window: { start: number; end: number }) => void;
}) {
  const max = length ?? 36000;
  const [dragging, setDragging] = useState<[number, number] | null>(null);
  const thumbRef = useRef(0);
  const [from, to] = dragging ?? [start, end];
  const setStart = (value: number) => onChange({ start: value, end: Math.min(max, Math.max(value + MIN_SECONDS, Math.min(end, value + limit))) });
  const setEnd = (value: number) => onChange({ start: Math.max(0, value - limit, Math.min(start, value - MIN_SECONDS)), end: value });
  // The moved handle wins; the other follows only as far as the minimum length and the model's limit require.
  const clamp = ([a, b]: readonly [number, number], thumb: number): [number, number] => {
    if (thumb === 0) { a = Math.min(a, b - MIN_SECONDS); b = Math.min(b, a + limit); }
    else { b = Math.max(b, a + MIN_SECONDS); a = Math.max(a, b - limit); }
    return [Math.max(0, a), Math.min(max, b)];
  };
  return <div className="grid min-w-0 gap-1 px-3 pb-3" data-reference-window>
    {length ? <RangeSlider value={[from, to]} min={0} max={length} step={1 / 30} largeStep={1} disabled={disabled}
      labels={[`Start of the ${name}`, `End of the ${name}`]} valueText={value => seconds(value)}
      onValueChange={(next, thumb) => { thumbRef.current = thumb; setDragging(clamp(next, thumb)); }}
      // Keys fire change and commit in one event, so commit from the value given, not the pending drag state.
      onValueCommit={next => { setDragging(null); const [a, b] = clamp(next, thumbRef.current); if (a !== start || b !== end) onChange({ start: a, end: b }); }}
      onInteractionCancel={() => setDragging(null)} /> : null}
    <Seconds label="Start" name={name} value={from} min={0} max={Math.max(0, max - MIN_SECONDS)} disabled={disabled}
      reset={0} commit={setStart} />
    <Seconds label="End" name={name} value={to} min={MIN_SECONDS} max={max} disabled={disabled}
      reset={Math.floor(Math.min(max, start + limit) * 100) / 100} commit={setEnd} />
  </div>;
}

function Seconds({ label, name, value, min, max, disabled, reset, commit }: {
  label: string; name: string; value: number; min: number; max: number; disabled: boolean; reset: number; commit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const apply = (number: number) => { if (Number.isFinite(number) && number !== value) commit(Math.min(max, Math.max(min, number))); };
  return <InspectorPropertyControl label={label} fields={`reference-${label.toLowerCase()}`} density="compact" disabled={disabled || value === reset} onReset={() => apply(reset)}>
    <ScrubNumberInput ariaLabel={`${label} of the ${name}, seconds`} value={draft ?? value.toFixed(2)} min={min} max={max} step={1 / 30} precision={2} density="compact" disabled={disabled}
      onChange={setDraft} onCancel={() => setDraft(null)}
      onCommit={next => { const number = Number(next ?? draft ?? value); setDraft(null); apply(number); }} />
    <span className="shrink-0 text-[length:var(--ui-text-small)] text-[var(--ink-secondary)]">s</span>
  </InspectorPropertyControl>;
}
