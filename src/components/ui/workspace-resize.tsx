"use client";

import { useEffect, useRef, useState, type RefObject, type CSSProperties } from "react";
import { getStoredItem } from "@/lib/persisted-key";

export function clampPanelSize(value: number, min: number, max: number) {
  return Math.min(Math.max(min, max), Math.max(min, value));
}

export function useWorkspaceSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}

export function usePanelSize(key: string, fallback: number, min: number, max: number) {
  const [saved, setSaved] = useState<{key: string; value: number} | null>(null);
  useEffect(() => {
    try {
      const raw = getStoredItem(localStorage, key);
      const value = raw === null ? NaN : Number(raw);
      setSaved(Number.isFinite(value) ? { key, value } : null);
    } catch { setSaved(null); }
  }, [key]);
  const value = clampPanelSize(saved?.key === key ? saved.value : fallback, min, max);
  const change = (next: number, persist = false) => {
    const bounded = clampPanelSize(next, min, max);
    setSaved({ key, value: bounded });
    if (persist) try { localStorage.setItem(key, String(bounded)); } catch { /* Session resizing still works. */ }
  };
  return { value, change, reset: () => change(fallback, true) };
}

/** Shared bounded resize gesture: pointer capture, keyboard, cancellation and reset. */
export function WorkspaceResizeHandle({ label, axis, value, min, max, reverse = false, onChange, onReset, style }: {
  label: string; axis: "x" | "y"; value: number; min: number; max: number;
  reverse?: boolean; onChange: (value: number, persist?: boolean) => void; onReset: () => void; style?: CSSProperties;
}) {
  const drag = useRef<{ coordinate: number; value: number } | null>(null);
  const coordinate = (e: {clientX:number;clientY:number}) => axis === "x" ? e.clientX : e.clientY;
  const sign = reverse ? -1 : 1;
  const cancel = () => { if (drag.current) onChange(drag.current.value); drag.current = null; };
  return <div role="separator" aria-label={label} aria-orientation={axis === "x" ? "vertical" : "horizontal"}
    aria-valuemin={min} aria-valuemax={Math.max(min,max)} aria-valuenow={Math.round(value)} aria-valuetext={`${Math.round(value)} pixels`}
    tabIndex={0} className={`workspace-resize workspace-resize--${axis}`} style={style}
    title="Drag to resize · Arrow keys to adjust · Double-click to reset · Escape to cancel"
    onDoubleClick={onReset}
    onPointerDown={e => { if(e.button!==0)return; e.preventDefault(); e.currentTarget.focus(); drag.current={coordinate:coordinate(e),value}; e.currentTarget.setPointerCapture(e.pointerId); }}
    onPointerMove={e => { if(drag.current) onChange(drag.current.value + sign*(coordinate(e)-drag.current.coordinate)); }}
    onPointerUp={e => { if(!drag.current)return; const next=drag.current.value+sign*(coordinate(e)-drag.current.coordinate); drag.current=null; onChange(next,true); e.currentTarget.releasePointerCapture(e.pointerId); }}
    onPointerCancel={cancel} onLostPointerCapture={cancel}
    onKeyDown={e => {
      if(e.key==="Escape" && drag.current){e.preventDefault();e.stopPropagation();cancel();return;}
      const negative=axis==="x"?"ArrowLeft":"ArrowUp", positive=axis==="x"?"ArrowRight":"ArrowDown";
      if(![negative,positive,"Home","End"].includes(e.key))return;
      e.preventDefault();e.stopPropagation();
      onChange(e.key==="Home"?min:e.key==="End"?max:value+(e.key===negative?-1:1)*sign*(e.shiftKey?4:16),true);
    }} />;
}
