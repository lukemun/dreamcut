"use client";
import { useEffect, useState, type RefObject } from "react";
import { Player, type PlayerRef } from "@/lib/frame-runtime/player";
import styles from "./storyboard.module.css";
import { TimelineComposition } from "@/lib/remotion/TimelineComposition";
import type { CompositionElement } from "@/lib/render/composition-adapters";

type Preview = { elements: CompositionElement[]; dimensions: { width: number; height: number }; durationInFrames: number };
export function StoryboardPreview({ projectId, source, revision, player, onTime, initialTime = 0, start, duration, onReady, onPrevious, onNext, onDimensions, fill = false }: {
  projectId: string; source?: string; revision: number; player: RefObject<PlayerRef | null>; onTime?: (time: number) => void; initialTime?: number; start?: number; duration?: number; onReady?: () => void;
  /** Previous / next shot in the player's own transport, when the preview plays a whole story. */ onPrevious?: () => void; onNext?: () => void;
  /** The picture's size once known, so a host can lay out around its shape. */ onDimensions?: (dimensions: { width: number; height: number }) => void;
  /** Fill the host's box (a size container) instead of a fixed share of the window, so resizing the host grows the picture. */ fill?: boolean;
}) {
  const [data, setData] = useState<Preview | null>(null), [error, setError] = useState("");
  useEffect(() => {
    const abort = new AbortController(); setData(null); setError("");
    void fetch(`/api/projects/${encodeURIComponent(projectId)}/storyboard/preview${source ? `?source=${encodeURIComponent(source)}${start !== undefined ? `&start=${start}` : ""}${duration !== undefined ? `&duration=${duration}` : ""}` : ""}`, { signal: abort.signal })
      .then(async r => { const value = await r.json(); if (!r.ok) throw new Error(value.error); if (!abort.signal.aborted) setData(value); })
      .catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [projectId, source, revision, start, duration]);
  useEffect(() => {
    const instance = player.current;
    if (!instance || !onTime) return;
    const update = () => onTime(instance.getCurrentFrame() / 30);
    instance.addEventListener("frameupdate", update);
    return () => instance.removeEventListener("frameupdate", update);
  }, [data, onTime, player]);
  const width = data?.dimensions.width, height = data?.dimensions.height;
  useEffect(() => { if (width && height) onDimensions?.({ width, height }); }, [width, height, onDimensions]);
  useEffect(() => { if (data) { player.current?.seekTo(Math.round(initialTime * 30)); onReady?.(); } }, [data, initialTime, player, onReady]);
  if (error) return <p role="alert">{error}</p>;
  if (!data) return <p role="status">Preparing preview…</p>;
  return <div className={styles.previewFrame} style={{ width: fill ? `min(100cqw, calc(100cqh * ${data.dimensions.width / data.dimensions.height}))` : `min(100%, ${52 * data.dimensions.width / data.dimensions.height}vh)` }}><Player ref={player} component={TimelineComposition} inputProps={{ elements: data.elements }}
    durationInFrames={data.durationInFrames} compositionWidth={data.dimensions.width} compositionHeight={data.dimensions.height}
    fps={30} controls onPreviousEditPoint={onPrevious} onNextEditPoint={onNext} style={{ width: "100%", aspectRatio: `${data.dimensions.width}/${data.dimensions.height}` }} /></div>;
}
