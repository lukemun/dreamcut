"use client";
import { useState } from "react";
import { ScrubNumberInput } from "../timeline/InspectorNumericControls";
import styles from "./storyboard.module.css";
// Exact source times and shot duration have no meaningful fixed slider range.
export function Seconds({ label, value, min = 0, max, disabled, commit }: { label: string; value: number; min?: number; max: number; disabled: boolean; commit: (value: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  // Compact like proposal dials: label, value and an `s` suffix on one line.
  return <div className={styles.number}><span>{label}</span><span className="inline-flex items-center gap-1.5"><ScrubNumberInput ariaLabel={`${label} in seconds`} value={draft ?? value.toFixed(2)} min={min} max={max} step={1 / 30} precision={2} density="compact"
    disabled={disabled} onChange={setDraft} onCancel={() => setDraft(null)} onCommit={next => { const number = Number(next ?? draft ?? value); setDraft(null); if (Number.isFinite(number) && number !== value) commit(Math.min(max, Math.max(min, number))); }} />
    <span className="text-[length:var(--ui-text-small)] text-[var(--ink-secondary)]">s</span></span></div>;
}
