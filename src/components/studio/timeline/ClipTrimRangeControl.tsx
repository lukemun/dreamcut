"use client";
import { useState } from "react";
import { RangeSlider } from "@/components/ui/slider";
import { ScrubNumberInput } from "./InspectorNumericControls";

const seconds = (value: number) => `${value.toFixed(2)}s`;
const EPSILON = 0.0005;

/**
 * Which part of the source a clip plays: one slider over the whole source with two handles
 * (the left handle removes from the start, the right from the end), plus the exact values.
 * Dragging previews through the inspector draft; release commits only the edge that moved,
 * through the same trim commits as typing, so Undo and speech-bound clips behave identically.
 */
export function ClipTrimRangeControl({ sourceSeconds, trimStart, trimEnd, trimStartMax, trimEndMax, minUsedSeconds, disabled,
  onTrimStartChange, onTrimEndChange, onTrimStartCommit, onTrimEndCommit }: {
  sourceSeconds: number;
  /** Draft values as the inspector edits them (seconds removed from each end). */
  trimStart: string;
  trimEnd: string;
  trimStartMax: number;
  trimEndMax: number;
  /** Shortest part of the source a clip may use. */
  minUsedSeconds: number;
  disabled: boolean;
  onTrimStartChange: (value: string) => void;
  onTrimEndChange: (value: string) => void;
  onTrimStartCommit: (value?: string) => void;
  onTrimEndCommit: (value?: string) => void;
}) {
  const [dragging, setDragging] = useState<[number, number] | null>(null);
  const removedStart = Math.max(0, Number.parseFloat(trimStart) || 0);
  const removedEnd = Math.max(0, Number.parseFloat(trimEnd) || 0);
  const committed: [number, number] = [Math.min(removedStart, sourceSeconds), Math.max(0, sourceSeconds - removedEnd)];
  const [usedFrom, usedTo] = dragging ?? committed;
  const clamp = (next: readonly [number, number], thumb: number): [number, number] => {
    let [from, to] = next;
    if (thumb === 0) from = Math.min(from, to - minUsedSeconds);
    else to = Math.max(to, from + minUsedSeconds);
    return [Math.max(0, from), Math.min(sourceSeconds, to)];
  };
  return <div className="grid min-w-0 gap-2" data-clip-trim-range>
    <RangeSlider value={[usedFrom, usedTo]} min={0} max={sourceSeconds} step={1 / 30} largeStep={1} disabled={disabled}
      labels={["Start of the used part", "End of the used part"]} valueText={value => seconds(value)}
      onValueChange={(next, thumb) => {
        const bounded = clamp(next, thumb);
        setDragging(bounded);
        if (thumb === 0) onTrimStartChange(bounded[0].toFixed(2));
        else onTrimEndChange((sourceSeconds - bounded[1]).toFixed(2));
      }}
      onValueCommit={next => {
        setDragging(null);
        const [from, to] = next;
        if (Math.abs(from - committed[0]) > EPSILON) onTrimStartCommit(Math.max(0, from).toFixed(2));
        if (Math.abs(to - committed[1]) > EPSILON) onTrimEndCommit(Math.max(0, sourceSeconds - to).toFixed(2));
      }}
      onInteractionCancel={() => { setDragging(null); onTrimStartChange(removedStart.toFixed(2)); onTrimEndChange(removedEnd.toFixed(2)); }} />
    <p className="m-0 text-xs text-[var(--ink-muted)]">Uses {seconds(usedFrom)}–{seconds(usedTo)} of {seconds(sourceSeconds)}</p>
    <div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
      <label className="grid min-w-0 gap-1 text-[13px] text-[var(--ink-secondary)]">Remove from start
        <ScrubNumberInput ariaLabel="Trim start numeric value" value={trimStart} min={0} max={trimStartMax} step={0.01} disabled={disabled} onChange={onTrimStartChange} onCommit={onTrimStartCommit} />
      </label>
      <label className="grid min-w-0 gap-1 text-[13px] text-[var(--ink-secondary)]">Remove from end
        <ScrubNumberInput ariaLabel="Trim end numeric value" value={trimEnd} min={0} max={trimEndMax} step={0.01} placeholder="-" disabled={disabled} onChange={onTrimEndChange} onCommit={onTrimEndCommit} />
      </label>
    </div>
  </div>;
}
