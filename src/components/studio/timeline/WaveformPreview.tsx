"use client";
import { useEffect, useRef, useState } from "react";
import { RhythmWaveform } from "./RhythmWaveform";
import { decodeAndExtractPeaks } from "./computeClientPeaks";

function compactPeaks(peaks: number[], targetCount = 72) {
  if (peaks.length <= targetCount) return peaks;
  return Array.from({ length: targetCount }, (_, index) => {
    const start = Math.floor(index * peaks.length / targetCount);
    const end = Math.max(start + 1, Math.floor((index + 1) * peaks.length / targetCount));
    return Math.max(...peaks.slice(start, end));
  });
}

export function WaveformPreview({ track, progress, onSeek, detailed = false, compact = false }: { detailed?: boolean; compact?: boolean; track: { source_url?: string | null; track_name: string }; progress: number; onSeek: (fraction: number) => void }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [peaks, setPeaks] = useState<number[] | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    const node = containerRef.current;
    if (!node || !track.source_url) return;
    if (!("IntersectionObserver" in window)) {
      setShouldLoad(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setShouldLoad(true);
        observer.disconnect();
      }
    }, { rootMargin: "160px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, [track.source_url]);

  useEffect(() => {
    if (!shouldLoad || !track.source_url) return;
    let active = true;
    void decodeAndExtractPeaks(track.source_url).then((result) => {
      if (active) setPeaks(result ? (detailed ? result.peaks : compactPeaks(result.peaks)) : []);
    });
    return () => { active = false; };
  }, [shouldLoad, track.source_url, detailed]);

  if (!track.source_url) return null;
  const bars = peaks?.length ? peaks : [];
  const seekFromPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.type === "pointermove" && event.buttons !== 1) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    onSeek(Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)));
  };

  return <div
    ref={containerRef}
    role="slider"
    tabIndex={0}
    aria-label={`Scrub ${track.track_name}`}
    aria-valuemin={0}
    aria-valuemax={100}
    aria-valuenow={Math.round(progress * 100)}
    onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); seekFromPointer(event); }}
    onPointerMove={seekFromPointer}
    onKeyDown={(event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      onSeek(Math.min(1, Math.max(0, progress + (event.key === "ArrowRight" ? 0.005 : -0.005))));
    }}
    style={detailed ? { height: compact ? 40 : 120 } : undefined}
    className="relative mt-2 flex h-9 cursor-pointer items-center gap-px rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-deep)] px-2 outline-none focus:border-[var(--timeline-review-marker-color)]"
  >
    {!bars.length && <span className="text-xs text-[var(--ink-secondary)]">{peaks === null ? "Loading waveform…" : "Waveform unavailable; playback still works"}</span>}
    {detailed && bars.length > 0 ? <>
      <RhythmWaveform peaks={bars} duration={1} />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 border-l-2 border-[var(--ink)]" style={{left:`${progress * 100}%`}} />
    </> : bars.map((peak, index) => <span
      key={index}
      aria-hidden="true"
      className={`min-w-px flex-1 rounded-full transition-colors ${index / bars.length <= progress ? "bg-[var(--timeline-review-marker-color)]" : "bg-[var(--ink-muted)]"} ${peaks === null ? "opacity-35" : "opacity-80"}`}
      style={{ height: `${Math.max(12, Math.min(100, peak * 100))}%` }}
    />)}
  </div>;
}
