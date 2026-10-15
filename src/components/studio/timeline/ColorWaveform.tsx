"use client";

import { useEffect, useRef, useState } from "react";
import { InspectorDisclosure } from "./InspectorHierarchy";
import { Button } from "@/components/ui/button";
import { lumaWaveform, rgbParade, scopeFrameInsideClip } from "@/lib/timeline/luma-waveform";
import { currentFrameRate } from "@/lib/timeline/frame-rate-scope";

export type ColorScopeMode = "brightness" | "rgb";

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
    const plotWidth = mode === "rgb" ? 768 : 256;
    const clear = (message: string) => { target.clearRect(0, 0, plotWidth, 101); setStatus(message); };
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
        const bins = mode === "rgb" ? rgbParade(rgba, 256, 144) : lumaWaveform(rgba, 256, 144);
        const image = target.createImageData(plotWidth, 101);
        for (let i = 0; i < bins.length; i++) if (bins[i]) {
          const channel = Math.floor((i % plotWidth) / 256);
          const color = mode === "brightness" ? [220, 230, 240] : [[255, 115, 115], [110, 230, 145], [110, 170, 255]][channel]!;
          image.data[i * 4] = color[0]!; image.data[i * 4 + 1] = color[1]!; image.data[i * 4 + 2] = color[2]!;
          image.data[i * 4 + 3] = Math.min(255, 60 + 48 * Math.log2(1 + bins[i]!));
        }
        target.putImageData(image, 0, 0);
        setStatus(media === gpu ? "Picture at the playhead · graded · 256 × 144 samples" : "Selected clip · graded · 256 × 144 samples");
      } catch { clear("Waveform unavailable for this frame"); }
    };
    draw();
    const timer = window.setInterval(draw, 160);
    return () => { window.clearInterval(timer); observer.disconnect(); };
  }, [open, elementId, mode]);
  return <div ref={section} className="grid min-w-0 gap-2">
    <InspectorDisclosure title="Video scopes" open={open} onOpenChange={value => onScopeChange(value ? mode : null)}>
    {open ? <div className="grid gap-1 rounded-lg border border-[var(--chrome-line-strong)] bg-[var(--chrome-deep)] p-3">
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label="Video scope type">
        <Button size="sm" variant={mode === "brightness" ? "secondary" : "outline"} aria-pressed={mode === "brightness"} onClick={() => { setLastMode("brightness"); onScopeChange("brightness"); }}>Brightness waveform</Button>
        <Button size="sm" variant={mode === "rgb" ? "secondary" : "outline"} aria-pressed={mode === "rgb"} onClick={() => { setLastMode("rgb"); onScopeChange("rgb"); }}>RGB parade</Button>
      </div>
      <div className="relative ml-7 h-36" style={{ backgroundImage: "linear-gradient(to bottom, var(--chrome-line) 1px, transparent 1px)", backgroundSize: "100% 25%" }}>
        {[100, 75, 50, 25, 0].map((v) => <span key={v} className="absolute -left-7 text-[10px] text-[var(--ink-secondary)]" style={{ top: `${100-v}%`, transform: "translateY(-50%)" }}>{v}</span>)}
        <canvas ref={output} width={mode === "rgb" ? 768 : 256} height={101} className="h-full w-full" aria-label={mode === "rgb" ? "Selected clip red, green and blue parade, SDR channel levels 0 to 100 percent" : "Selected clip brightness waveform, SDR 0 to 100 percent"} />
      </div>
      {mode === "rgb" ? <div className="ml-7 grid grid-cols-3 text-center text-xs font-semibold"><span className="text-red-300">Red</span><span className="text-green-300">Green</span><span className="text-blue-300">Blue</span></div> : null}
      <p className="mt-2 text-xs text-[var(--ink-secondary)]">{status}</p>
      <p className="text-xs text-[var(--ink-secondary)]">{mode === "rgb" ? "SDR color channel levels %" : "SDR brightness %"}</p>
    </div> : null}
    </InspectorDisclosure>
  </div>;
}
