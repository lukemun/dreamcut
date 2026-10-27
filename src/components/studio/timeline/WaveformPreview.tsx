"use client";
import { useEffect, useRef, useState } from "react";
import { RhythmWaveform } from "./RhythmWaveform";
import { decodeAndExtractPeaks } from "./computeClientPeaks";

/**
 * A mirrored outline of a sound's loudness, scaled to its own loudest moment so a quiet sound still
 * shows its shape. A gentle curve (power 0.6) lifts soft tails toward how loud they sound.
 */
function envelopePath(peaks: number[]) {
  const loudest = Math.max(...peaks, 1e-6);
  const heights = peaks.map(peak => Math.max(0.015, Math.pow(Math.min(1, peak / loudest), 0.6)) * 0.46);
  const step = peaks.length > 1 ? 100 / (peaks.length - 1) : 100;
  const top = heights.map((height, index) => `${(index * step).toFixed(2)},${(50 - height * 100).toFixed(2)}`);
  const bottom = heights.map((height, index) => `${(index * step).toFixed(2)},${(50 + height * 100).toFixed(2)}`).reverse();
  return `M0,50 L${top.join(" L")} L100,50 L${bottom.join(" L")} Z`;
}

function compactPeaks(peaks: number[], targetCount = 160) {
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
    className={`relative mt-2 flex cursor-pointer items-center rounded-md border border-[var(--chrome-line)] bg-[var(--chrome-deep)] outline-none focus:border-[var(--timeline-review-marker-color)] ${detailed ? "gap-px px-2" : "h-12 px-1"}`}
  >
    {detailed ? <>
      {!bars.length && <span className="text-xs text-[var(--ink-secondary)]">{peaks === null ? "Loading waveform…" : "Waveform unavailable; playback still works"}</span>}
      {bars.length > 0 ? <>
        <RhythmWaveform peaks={bars} duration={1} />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 border-l-2 border-[var(--ink)]" style={{left:`${progress * 100}%`}} />
      </> : null}
    </> : bars.length ? <svg aria-hidden="true" viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
      <path d={envelopePath(bars)} fill="var(--ink-muted)" opacity={0.45} />
      <path d={envelopePath(bars)} fill="var(--timeline-review-marker-color)" style={{ clipPath: `inset(0 ${(100 - progress * 100).toFixed(2)}% 0 0)` }} />
      {progress > 0 && progress < 1 ? <line x1={progress * 100} x2={progress * 100} y1={4} y2={96} stroke="var(--ink)" strokeWidth={1} vectorEffect="non-scaling-stroke" /> : null}
    </svg>
      // Loading or undecodable: a quiet centre line rather than a status message.
      : <span aria-hidden="true" className={`h-px w-full bg-[var(--ink-muted)] ${peaks === null ? "animate-pulse opacity-40" : "opacity-25"}`} />}
  </div>;
}
