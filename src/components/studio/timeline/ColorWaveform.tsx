"use client";

import { useEffect, useRef, useState } from "react";
import { InspectorDisclosure } from "./InspectorHierarchy";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { lumaWaveform, rgbParade, scopeFrameInsideClip } from "@/lib/timeline/luma-waveform";
import { SKIN_LINE_DEGREES, VECTORSCOPE_TARGETS, vectorscopeBins } from "@/lib/color/scopes";
import { currentFrameRate } from "@/lib/timeline/frame-rate-scope";

export type ColorScopeMode = "brightness" | "rgb" | "vector";

const VECTOR_SIZE = 128;
/** Graticule position for a vectorscope angle at a chroma distance (0.5 is the edge). */
const vectorPoint = (degrees: number, distance: number) => ({
  x: 50 + Math.cos((degrees * Math.PI) / 180) * distance * 100,
  y: 50 - Math.sin((degrees * Math.PI) / 180) * distance * 100,
});

type ScopeClip = { id: string; timeline_start: number; duration: number };

/** Borrows already-presented pixels. Never creates a media element or changes a clock.
 * Standard preview mounts each clip in the DOM: the scope reads that clip's decoded frame
 * (SVG grading through the same browser filter, a LUT through its graded output canvas),
 * before layout/compositing. GPU preview mounts no per-clip DOM: the scope reads the
 * presented GPU picture while that picture's timeline frame lies inside the selected clip. */
export function ColorWaveform({ element, scopeMode, onScopeChange }: { element: ScopeClip; scopeMode: ColorScopeMode | null; onScopeChange: (mode: ColorScopeMode | null) => void }) {
  const elementId = element.id;
  const clip = useRef(element);
  clip.current = element;
  const [lastMode, setLastMode] = useState<ColorScopeMode>("brightness");
  const open = scopeMode != null;
  const mode = scopeMode ?? lastMode;
  const [status, setStatus] = useState("Move the playhead into this clip");
  const output = useRef<HTMLCanvasElement>(null);
  const section = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const sample = document.createElement("canvas");
    sample.width = 256; sample.height = 144;
    const ctx = sample.getContext("2d", { willReadFrequently: true });
    const target = output.current?.getContext("2d");
    if (!ctx || !target) return;
    let visible = true;
    const observer = new IntersectionObserver(([entry]) => { visible = Boolean(entry?.isIntersecting); });
    if (section.current) observer.observe(section.current);
    const plotWidth = mode === "rgb" ? 768 : mode === "vector" ? VECTOR_SIZE : 256;
    const plotHeight = mode === "vector" ? VECTOR_SIZE : 101;
    const clear = (message: string) => { target.clearRect(0, 0, plotWidth, plotHeight); setStatus(message); };
    const draw = () => {
      if (document.hidden || !visible) return;
      const actor = document.querySelector(`[data-timeline-element-id="${CSS.escape(elementId)}"]`);
      const gpu = actor ? null : document.querySelector<HTMLCanvasElement>("canvas[data-gpu-preview]");
      const media = actor?.querySelector<HTMLVideoElement | HTMLImageElement | HTMLCanvasElement>("canvas[data-color-grade-lut-output], video, img") ?? gpu;
      if (gpu && gpu === media) {
        const shown = gpu.dataset.gpuPreviewFrame;
        if (shown === undefined) { clear("Waiting for the current frame…"); return; }
        if (!scopeFrameInsideClip(Number(shown), clip.current, currentFrameRate())) { clear("Move the playhead into this clip"); return; }
      }
      if (!media || getComputedStyle(media).visibility === "hidden") { clear("Move the playhead into this clip"); return; }
      if (media instanceof HTMLVideoElement && (media.seeking || media.readyState < 2)) { clear("Waiting for the current frame…"); return; }
      if (media instanceof HTMLImageElement && (!media.complete || !media.naturalWidth)) { clear("Waiting for the current frame…"); return; }
      try {
        // Prefer the LUT canvas when present, even if its hidden source appears first.
        const gradedCanvas = actor?.querySelector<HTMLCanvasElement>("canvas[data-color-grade-lut-output]");
        const source = gradedCanvas ?? media;
        const filter = actor?.querySelector<HTMLElement>("[data-color-grade-filter]")?.dataset.colorGradeFilter;
        ctx.clearRect(0, 0, 256, 144);
        ctx.filter = !gradedCanvas && filter ? `url(#${filter})` : "none";
        ctx.drawImage(source, 0, 0, 256, 144);
        ctx.filter = "none";
        const rgba = ctx.getImageData(0, 0, 256, 144).data;
        const bins = mode === "rgb" ? rgbParade(rgba, 256, 144) : mode === "vector" ? vectorscopeBins(rgba, 256, 144, VECTOR_SIZE) : lumaWaveform(rgba, 256, 144);
        const image = target.createImageData(plotWidth, plotHeight);
        for (let i = 0; i < bins.length; i++) if (bins[i]) {
          const channel = Math.floor((i % plotWidth) / 256);
          const color = mode === "rgb" ? [[255, 115, 115], [110, 230, 145], [110, 170, 255]][channel]! : [220, 230, 240];
          image.data[i * 4] = color[0]!; image.data[i * 4 + 1] = color[1]!; image.data[i * 4 + 2] = color[2]!;
          image.data[i * 4 + 3] = Math.min(255, 60 + 48 * Math.log2(1 + bins[i]!));
        }
        target.putImageData(image, 0, 0);
        // A working scope needs no caption; only a scope that cannot draw says why.
        setStatus("");
      } catch { clear("Waveform unavailable for this frame"); }
    };
    draw();
    const timer = window.setInterval(draw, 160);
    return () => { window.clearInterval(timer); observer.disconnect(); };
  }, [open, elementId, mode]);
  return <div ref={section} className="grid min-w-0 gap-2">
    <InspectorDisclosure title="Video scopes" open={open} onOpenChange={value => onScopeChange(value ? mode : null)}>
    {open ? <div className="grid gap-1 rounded-lg border border-[var(--edge-outline)] bg-[var(--chrome-deep)] p-3">
      <SegmentedControl size="sm" fill role="group" aria-label="Video scope type" className="mb-3 [&>button]:!whitespace-nowrap">
        {([["brightness", "Brightness"], ["rgb", "Channels"], ["vector", "Color wheel"]] as const).map(([id, name]) => (
          <button key={id} type="button" aria-pressed={mode === id} onClick={() => { setLastMode(id); onScopeChange(id); }}>{name}</button>
        ))}
      </SegmentedControl>
      {mode === "vector" ? <div className="relative mx-auto aspect-square w-full max-w-64">
        <canvas ref={output} width={VECTOR_SIZE} height={VECTOR_SIZE} className="absolute inset-0 h-full w-full" aria-label="Selected clip vectorscope: colour direction and saturation, neutral at the centre" />
        <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true">
          <circle cx="50" cy="50" r="49.5" fill="none" stroke="var(--chrome-line)" strokeWidth="0.6" />
          <circle cx="50" cy="50" r="25" fill="none" stroke="var(--chrome-line)" strokeWidth="0.4" />
          {(() => { const end = vectorPoint(SKIN_LINE_DEGREES, 0.5), label = vectorPoint(SKIN_LINE_DEGREES, 0.43); return <>
            <path d={`M50 50 L${end.x} ${end.y}`} stroke="var(--ink-secondary)" strokeWidth="0.6" strokeDasharray="2 2" />
            <text x={label.x - 3} y={label.y} fontSize="4.5" textAnchor="end" dominantBaseline="middle" fill="var(--ink-secondary)">Skin</text>
          </>; })()}
          {VECTORSCOPE_TARGETS.map((target) => {
            const at = vectorPoint(target.degrees, Math.hypot(target.cb, target.cr) * 0.75);
            // Names sit just inside their targets, toward the centre, so none can run off the scope's edge.
            const label = vectorPoint(target.degrees, Math.hypot(target.cb, target.cr) * 0.75 - 0.05);
            // Side targets read inward from the box; top and bottom ones centre beside it.
            const anchor = label.x < 42 ? "start" : label.x > 58 ? "end" : "middle";
            return <g key={target.name}>
              <rect x={at.x - 2} y={at.y - 2} width="4" height="4" fill="none" stroke="var(--ink-secondary)" strokeWidth="0.5" />
              <text x={anchor === "start" ? label.x + 1 : anchor === "end" ? label.x - 1 : label.x} y={anchor === "middle" ? label.y + (label.y < 50 ? 3 : -3) : label.y} fontSize="4" textAnchor={anchor} dominantBaseline="middle" fill="var(--ink-secondary)">{target.name[0]!.toUpperCase() + target.name.slice(1)}</text>
            </g>;
          })}
        </svg>
      </div> : null}
      {mode === "vector" ? null : <div className="relative ml-7 h-36" style={{ backgroundImage: "linear-gradient(to bottom, var(--chrome-line) 1px, transparent 1px)", backgroundSize: "100% 25%" }}>
        {[100, 75, 50, 25, 0].map((v) => <span key={v} className="absolute -left-7 text-[10px] text-[var(--ink-secondary)]" style={{ top: `${100-v}%`, transform: "translateY(-50%)" }}>{v}</span>)}
        <canvas ref={output} width={mode === "rgb" ? 768 : 256} height={101} className="h-full w-full" aria-label={mode === "rgb" ? "Selected clip red, green and blue parade, SDR channel levels 0 to 100 percent" : "Selected clip brightness waveform, SDR 0 to 100 percent"} />
      </div>}
      {mode === "rgb" ? <div className="ml-7 grid grid-cols-3 text-center text-xs font-semibold"><span className="text-red-300">Red</span><span className="text-green-300">Green</span><span className="text-blue-300">Blue</span></div> : null}
      {status ? <p className="mt-2 text-xs text-[var(--ink-secondary)]">{status}</p> : null}
    </div> : null}
    </InspectorDisclosure>
  </div>;
}
