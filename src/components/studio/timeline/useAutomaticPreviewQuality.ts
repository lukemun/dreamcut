"use client";
import { useEffect, type RefObject } from "react";
import { automaticPreviewQuality, storePreviewQuality, type PreviewQuality } from "@/lib/preview-quality";

/** How long the player must keep a new size before Automatic prepares for it. */
const SETTLE_MS = 1500;

/**
 * Automatic playback quality follows the player: once the picture settles at a size, the project
 * prepares previews just big enough for it on this screen. Fullscreen is a brief look, so it never
 * re-prepares the project.
 */
export function useAutomaticPreviewQuality(projectId: string, stage: RefObject<HTMLElement | null>, output: { width: number; height: number }) {
  const outputLongEdge = Math.max(output.width, output.height);
  useEffect(() => {
    const element = stage.current;
    if (!element || outputLongEdge <= 0) return;
    let timer: number | undefined, sent: PreviewQuality | null = null, cancelled = false;
    const report = async () => {
      const player = element.querySelector<HTMLElement>(".dreamcut-frame-player") ?? element;
      if (player.classList.contains("preview-window-fullscreen")) return;
      // A hidden tab or pane is not what the creator is watching; it reports once it is shown.
      if (document.visibilityState !== "visible") return;
      const rect = player.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const automatic = automaticPreviewQuality(Math.max(rect.width, rect.height) * devicePixelRatio, outputLongEdge);
      if (automatic === sent) return;
      sent = automatic;
      try {
        const response = await fetch("/api/preview-settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ project_id: projectId, automatic }) });
        if (!response.ok || cancelled) return;
        const settings = await response.json() as { quality: PreviewQuality };
        storePreviewQuality(projectId, settings.quality);
      } catch { sent = null; }
    };
    const schedule = () => { window.clearTimeout(timer); timer = window.setTimeout(() => void report(), SETTLE_MS); };
    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    window.addEventListener("resize", schedule);
    document.addEventListener("visibilitychange", schedule);
    schedule();
    return () => { cancelled = true; window.clearTimeout(timer); observer.disconnect(); window.removeEventListener("resize", schedule); document.removeEventListener("visibilitychange", schedule); };
  }, [projectId, stage, outputLongEdge]);
}
