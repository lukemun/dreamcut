"use client";
import { useMemo } from "react";
import { waveformPath } from "./waveform-path";

/** Shared waveform surface. Callers choose a full mix or an instrument and own transport/marks. */
export function RhythmWaveform({peaks, duration, start = 0, span = duration, color = "var(--timeline-review-marker-color)", opacity = .9}: {
  peaks: number[]; duration: number; start?: number; span?: number; color?: string; opacity?: number;
}) {
  const path = useMemo(() => waveformPath(peaks, duration, start, span), [peaks, duration, start, span]);
  return <svg aria-hidden="true" viewBox="0 0 900 80" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full"><path d={path} stroke={color} strokeWidth="1.3" opacity={opacity} /></svg>;
}
