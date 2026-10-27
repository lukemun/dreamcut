"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { GenerationMark } from "@/lib/generation/assets";

/**
 * Generate's marking surface, shared by references, results and Library tiles. The
 * Generate form registers the marking API; outside Generate there is none and media
 * render unchanged. Pointer or play on a media item makes it the active target for M.
 */
export type GenerationMarking = {
  pointMode: boolean; marks: GenerationMark[]; numbering: Map<string, number>; selectedId: string | null;
  addPoint: (mark: Omit<GenerationMark, "id" | "note">) => void; select: (id: string) => void;
  setActive: (source: string, element: HTMLElement) => void;
};
const Context = createContext<{ api: GenerationMarking | null; register: (api: GenerationMarking | null) => void } | null>(null);
export function GenerationMarkingProvider({ children }: { children: ReactNode }) {
  const [api, setApi] = useState<GenerationMarking | null>(null);
  const register = useCallback((next: GenerationMarking | null) => setApi(() => next), []);
  return <Context.Provider value={useMemo(() => ({ api, register }), [api, register])}>{children}</Context.Provider>;
}
export const useRegisterGenerationMarking = () => useContext(Context)?.register;

export function MarkableMedia({ source, children }: { source: string; children: ReactNode }) {
  const api = useContext(Context)?.api;
  if (!api) return <>{children}</>;
  const own = api.marks.filter(mark => mark.source === source && mark.x !== undefined && mark.y !== undefined);
  return <span className="relative block" data-markable={api.pointMode ? "" : undefined} data-mark-source={source}
    onPointerDownCapture={event => api.setActive(source, event.currentTarget)} onPlayCapture={event => api.setActive(source, event.currentTarget)}>
    {children}
    {api.pointMode && <span role="button" tabIndex={-1} aria-label="Add a mark here" className="absolute inset-0 z-10 block cursor-crosshair"
      onClick={event => {
        event.preventDefault(); event.stopPropagation();
        const box = event.currentTarget.getBoundingClientRect();
        const video = event.currentTarget.parentElement?.querySelector("video");
        if (video && !video.paused) video.pause();
        api.addPoint({ source, label: mediaLabel(event.currentTarget.parentElement), x: clamp((event.clientX - box.left) / box.width), y: clamp((event.clientY - box.top) / box.height),
          ...(video ? { time: Math.round(video.currentTime * 100) / 100 } : {}) });
      }} />}
    {own.map(mark => <span key={mark.id} role="button" tabIndex={0} aria-label={`Mark ${api.numbering.get(mark.id)}${mark.note ? `: ${mark.note}` : ""}`} title={mark.note || "Add a note in Marks"}
      onClick={event => { event.preventDefault(); event.stopPropagation(); api.select(mark.id); }}
      onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); api.select(mark.id); } }}
      className={`generation-mark-pin${api.selectedId === mark.id ? " generation-mark-pin--selected" : ""}`}
      style={{ left: `${mark.x! * 100}%`, top: `${mark.y! * 100}%` }}>{api.numbering.get(mark.id)}</span>)}
  </span>;
}
/** The name a person sees: the tile's label, the media's alt text or its aria-label. */
export function mediaLabel(element: Element | null | undefined) {
  // Tile title first (Library), then the media's own alt or label; control labels last.
  const label = element?.closest("article[aria-label]")?.getAttribute("aria-label")
    ?? element?.querySelector("img[alt]:not([alt=''])")?.getAttribute("alt") ?? element?.querySelector("video[aria-label]")?.getAttribute("aria-label")
    ?? element?.closest("[aria-label]:not([data-mark-source])")?.getAttribute("aria-label");
  return label ? label.replace(/^Preview /, "").slice(0, 200) : undefined;
}
const clamp = (value: number) => Math.min(1, Math.max(0, Math.round(value * 1000) / 1000));
