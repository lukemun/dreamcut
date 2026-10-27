"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { InspectorVisualChoice } from "./InspectorVisualChoice";
import { InspectorItemHeader } from "./InspectorHierarchy";
import { SliderScrubControl } from "./InspectorNumericControls";
import { Button } from "@/components/ui/button";
import { commitMaskInsetAtTime, readLineMaskRotation, resolveMaskInsetAtTime, type MaskInsetProps } from "@/lib/timeline/media-transform";
import { maskShapeLabel, moveMaskEdge, type MaskEdge } from "./mask-handle-geometry";
import type { TimelineElement } from "./types";

export function VisualMaskEditor({ element, time, preview, clear, commit }: {
  element: TimelineElement; time: number;
  preview: (values: Record<MaskEdge, string>, rotation?: number) => void;
  clear: () => void; commit: (props: Record<string, unknown>) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [draft, setDraft] = useState<MaskInsetProps | null>(null);
  const [draftRotation, setDraftRotation] = useState<number | null>(null);
  const rotationDrag = useRef<{ pointer: number; x: number; y: number; angle: number; rotation: number; latest: number } | null>(null);
  const drag = useRef<{ edge: MaskEdge; pointer: number; mask: MaskInsetProps; target: HTMLButtonElement } | null>(null);
  const clearRef = useRef(clear); clearRef.current = clear;
  const mask = draft ?? resolveMaskInsetAtTime(element.props, time);
  const isLine = maskShapeLabel(mask) === "Line";
  const lineEdge: MaskEdge = mask.top > 0 ? "top" : "bottom";
  const rotation = draftRotation ?? readLineMaskRotation(element.props);
  const radians = rotation * Math.PI / 180;
  const lineOffset = (lineEdge === "top" ? mask.top : 1 - mask.bottom) - .5;
  const hostAspect = host ? host.clientHeight / host.clientWidth : 16 / 9;
  const lineX = .5 - lineOffset * Math.sin(radians) * hostAspect;
  const lineY = .5 + lineOffset * Math.cos(radians);
  const rotate = (value: number) => {
    if (Number.isFinite(value)) commit({ mask_line_rotation: Math.max(-180, Math.min(180, value)) });
    setDraftRotation(null); clear();
  };
  const showRotation = (value: number) => {
    setDraftRotation(value);
    preview({ top: String(mask.top * 100), right: String(mask.right * 100), bottom: String(mask.bottom * 100), left: String(mask.left * 100) }, value);
  };
  const cancel = () => { drag.current = null; rotationDrag.current = null; setDraftRotation(null); setDraft(null); clearRef.current(); };
  useEffect(() => {
    const stop = () => { drag.current = null; rotationDrag.current = null; setDraftRotation(null); setDraft(null); clearRef.current(); };
    const escape = (e: KeyboardEvent) => { if (e.key === "Escape") { stop(); setEditing(false); } };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", stop);
    window.addEventListener("keydown", escape);
    return () => { stop(); window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", stop); window.removeEventListener("keydown", escape); };
  }, []);
  useEffect(() => { cancel(); }, [element.id, time]); // Seeking cancels an unfinished gesture.
  useEffect(() => {
    setHost(editing ? document.querySelector<HTMLElement>('[data-composition-master-frame="true"]') : null);
  }, [editing]);
  const show = (next: MaskInsetProps) => {
    setDraft(next);
    preview({ top: String(next.top * 100), right: String(next.right * 100), bottom: String(next.bottom * 100), left: String(next.left * 100) });
  };
  const save = (next: MaskInsetProps) => { commit(commitMaskInsetAtTime(element.props, time, next)); setDraft(null); clear(); };
  return <div className="grid gap-3" data-mask-shape-picker="">
    <InspectorItemHeader title="Mask shape" />
    <InspectorVisualChoice label="Shape masks" value={maskShapeLabel(mask)}
      onChange={(shape) => {
        save(shape === "None" ? { top: 0, right: 0, bottom: 0, left: 0 } : shape === "Rectangle" ? { top: .15, right: .15, bottom: .15, left: .15 } : { top: .5, right: 0, bottom: 0, left: 0 });
        setEditing(shape !== "None");
      }}
      options={(["None", "Rectangle", "Line"] as const).map(shape => ({ value: shape, label: shape,
        preview: <svg aria-hidden="true" viewBox="0 0 36 28" className="h-8 w-full text-[var(--ink-secondary)]">
          {shape === "None" ? <><rect x="5" y="3" width="26" height="22" rx="2" fill="none" stroke="currentColor"/><path d="M5 25L31 3" stroke="currentColor"/></> : shape === "Line" ? <><rect x="4" y="14" width="28" height="11" fill="currentColor" opacity=".3"/><path d="M4 14H32" stroke="currentColor" strokeWidth="2"/></> : <rect x="4" y="3" width="28" height="22" rx="1" fill="currentColor" opacity=".8"/>}
        </svg>
      }))} />
    {isLine ? <>
      <InspectorItemHeader title="Position" />
      <SliderScrubControl label="Line mask position" value={String((lineOffset + .5) * 100)} min={5} max={95} step={.1} fallback={50} unit="%" disabled={false} density="compact"
        onChange={value => show(moveMaskEdge(mask, lineEdge, Number(value) / 100))}
        onCommit={value => { if (value != null) save(moveMaskEdge(mask, lineEdge, Number(value) / 100)); }} onCancel={cancel} />
      <Button variant="outline" aria-pressed={mask.bottom > 0} onClick={() => save({ top: mask.bottom > 0 ? 1 - mask.bottom : 0, bottom: mask.top > 0 ? 1 - mask.top : 0, left: 0, right: 0 })}>Invert</Button>
      <InspectorItemHeader title="Rotation" actions={<Button variant="ghost" size="sm" aria-label="Reset mask rotation" onClick={() => rotate(0)}>Reset</Button>} />
      <SliderScrubControl label="Line mask rotation" value={String(rotation)} min={-180} max={180} step={1} fallback={0} unit="°" disabled={false} density="compact"
        onChange={value => showRotation(Number(value))} onCommit={value => { if (value != null) rotate(Number(value)); }} onCancel={cancel} />
    </> : null}
    <Button variant="outline" aria-pressed={editing} onClick={() => { cancel(); setEditing(!editing); }}>{editing ? "Done" : "Edit mask on preview"}</Button>
    {editing && host ? createPortal(<div data-visual-mask-editor style={{ position: "absolute", inset: 0, zIndex: 90, touchAction: "none" }} onPointerDown={e => e.stopPropagation()}>
      {isLine ? <button type="button" aria-label="Rotate mask on preview" title="Drag to rotate · Arrow keys adjust by 1°" style={{ position: "absolute", left: `${lineX * 100}%`, top: `${lineY * 100}%`, transform: `translate(-50%, -50%) rotate(${rotation}deg) translateX(64px)`, width: 32, height: 32, borderRadius: "50%", background: "white", color: "#143e42", border: "2px solid #143e42", zIndex: 2, touchAction: "none", cursor: "grab" }}
        onPointerDown={e => {
          e.preventDefault(); e.stopPropagation();
          const bounds = host.getBoundingClientRect();
          const x = bounds.left + lineX * bounds.width, y = bounds.top + lineY * bounds.height;
          rotationDrag.current = { pointer: e.pointerId, x, y, angle: Math.atan2(e.clientY - y, e.clientX - x), rotation, latest: rotation };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={e => {
          const active = rotationDrag.current;
          if (!active || active.pointer !== e.pointerId) return;
          if (e.buttons === 0) { cancel(); return; }
          const delta = (Math.atan2(e.clientY - active.y, e.clientX - active.x) - active.angle) * 180 / Math.PI;
          active.latest = Math.round(((active.rotation + delta + 540) % 360) - 180);
          showRotation(active.latest);
        }}
        onPointerUp={e => { const active = rotationDrag.current; if (!active || active.pointer !== e.pointerId) return; rotationDrag.current = null; e.currentTarget.releasePointerCapture(e.pointerId); rotate(active.latest); }}
        onPointerCancel={cancel} onLostPointerCapture={() => { if (rotationDrag.current !== null) cancel(); }}
        onKeyDown={e => { if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) { e.preventDefault(); e.stopPropagation(); rotate(rotation + (["ArrowLeft", "ArrowUp"].includes(e.key) ? -1 : 1)); } }}>↻</button> : null}
      {isLine ? <div style={{ position: "absolute", left: `${lineX * 100}%`, top: `${lineY * 100}%`, width: "400%", borderTop: "2px solid #7de5d8", transform: `translateX(-50%) rotate(${rotation}deg)`, transformOrigin: "center", pointerEvents: "none" }} /> : <div style={{ position: "absolute", inset: `${mask.top * 100}% ${mask.right * 100}% ${mask.bottom * 100}% ${mask.left * 100}%`, border: "2px solid #7de5d8", boxShadow: "0 0 0 2000px #0005", pointerEvents: "none" }} />}
      {(isLine ? [lineEdge] : ["top", "right", "bottom", "left"] as MaskEdge[]).map(edge => {
        const horizontal = edge === "top" || edge === "bottom";
        const x = isLine ? lineX : edge === "left" ? mask.left : edge === "right" ? 1 - mask.right : (mask.left + 1 - mask.right) / 2;
        const y = isLine ? lineY : edge === "top" ? mask.top : edge === "bottom" ? 1 - mask.bottom : (mask.top + 1 - mask.bottom) / 2;
        return <button key={edge} type="button" aria-label={`Drag ${edge} mask edge`} style={{ position: "absolute", left: `${x * 100}%`, top: `${y * 100}%`, transform: `translate(${x === 0 ? 0 : x === 1 ? -100 : -50}%, ${y === 0 ? 0 : y === 1 ? -100 : -50}%)`, width: horizontal ? 36 : 18, height: horizontal ? 18 : 36, background: "white", border: "2px solid #143e42", borderRadius: "var(--edge-control-inner)", cursor: horizontal ? "ns-resize" : "ew-resize", touchAction: "none" }}
          onPointerDown={e => { e.preventDefault(); e.stopPropagation(); drag.current = { edge, pointer: e.pointerId, mask, target: e.currentTarget }; e.currentTarget.setPointerCapture(e.pointerId); }}
          onPointerMove={e => {
            const active = drag.current; if (!active || active.pointer !== e.pointerId) return;
            if (e.buttons === 0) { cancel(); return; }
            const bounds = host.getBoundingClientRect();
            const linePosition = .5 + (-(e.clientX - bounds.left - bounds.width / 2) * Math.sin(radians) + (e.clientY - bounds.top - bounds.height / 2) * Math.cos(radians)) / bounds.height;
            const next = moveMaskEdge(active.mask, edge, isLine ? linePosition : horizontal ? (e.clientY - bounds.top) / bounds.height : (e.clientX - bounds.left) / bounds.width);
            active.mask = next; show(next);
          }}
          onPointerUp={e => { const active = drag.current; if (!active || active.pointer !== e.pointerId) return; drag.current = null; e.currentTarget.releasePointerCapture(e.pointerId); save(active.mask); }}
          onPointerCancel={cancel} onLostPointerCapture={() => { if (drag.current) cancel(); }}
          onKeyDown={e => { if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return; e.preventDefault(); e.stopPropagation(); const delta = (e.key === "ArrowUp" || e.key === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? .001 : .01); save(moveMaskEdge(mask, edge, (edge === "right" || edge === "bottom" ? 1 - mask[edge] : mask[edge]) + delta)); }} />;
      })}
      <button type="button" onClick={() => { cancel(); setEditing(false); }} style={{ position: "absolute", top: 12, right: 12, padding: "6px 12px", borderRadius: "var(--edge-control-inner)", background: "#152c36", color: "white", border: "1px solid #7de5d8", fontSize: 12 }}>Done masking</button>
    </div>, host) : null}
  </div>;
}
