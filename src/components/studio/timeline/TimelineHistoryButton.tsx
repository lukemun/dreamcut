"use client";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HistoryIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HistoryElementLike } from "@/lib/timeline/history-label";
import type { HistoryEntry } from "./useTimelineHistory";
import { historyEntryLabel } from "./history-entry-label";

export { historyEntryLabel } from "./history-entry-label";

type SavedEntry = { id: string; label: string; kind: string; at: string | null; actor?: string; version?: number; current?: boolean };

/** Undo button text: the step it reverses, or why there is nothing to reverse here. */
export function undoButtonLabel(next: string | null, savedVersions: number) {
  if (next) return `Undo: ${next}`;
  return savedVersions > 0 ? "Nothing to undo in this session" : "Nothing to undo";
}

export function TimelineHistoryButton({ projectId, undoEntries, redoEntries, busy, onUndo, onRedo, className }: {
  projectId: string; undoEntries: HistoryEntry[]; redoEntries: HistoryEntry[]; busy: boolean;
  onUndo: () => void; onRedo: () => void; className: string;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 8, top: 8, maxHeight: 520 });
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = anchor.current?.getBoundingClientRect();
      if (!rect) return;
      const height = Math.min(520, window.innerHeight - 24);
      const above = rect.top > window.innerHeight - rect.bottom;
      const available = Math.max(100, above ? rect.top - 16 : window.innerHeight - rect.bottom - 16);
      const maxHeight = Math.min(height, available);
      setPosition({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 408)), top: above ? Math.max(8, rect.top - maxHeight - 8) : rect.bottom + 8, maxHeight });
    };
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !anchor.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setOpen(false); anchor.current?.focus(); } };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { window.removeEventListener("resize", place); window.removeEventListener("scroll", place, true); document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open]);
  const [saved, setSaved] = useState<SavedEntry[]>([]);
  const [next, setNext] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Clip names for in-session steps; patch steps store only the element id.
  const [elements, setElements] = useState<Map<string, HistoryElementLike>>(new Map());
  const lookup = (id: string) => elements.get(id);
  const labelFor = (entry: HistoryEntry) => entry.type === "snapshot"
    ? saved.find(row => row.id === entry.afterSnapshotId)?.label ?? historyEntryLabel(entry, lookup)
    : historyEntryLabel(entry, lookup);
  async function loadNames() {
    try {
      const response = await fetch(`/api/projects/${projectId}/timeline`);
      if (!response.ok) return;
      const data = await response.json() as { elements?: HistoryElementLike[] };
      setElements(new Map((data.elements ?? []).filter(element => typeof element.id === "string").map(element => [element.id!, element])));
    } catch { /* Steps keep their generic "clip" names. */ }
  }
  async function load(before?: string) {
    setLoading(true); setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/timeline/history${before ? `?before=${encodeURIComponent(before)}` : ""}`);
      if (!response.ok) throw new Error("Could not load saved history");
      const data = await response.json() as { entries: SavedEntry[]; next: string | null };
      setSaved(previous => before ? [...previous, ...data.entries] : data.entries); setNext(data.next);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load history"); }
    finally { setLoading(false); }
  }
  const nextUndo = undoEntries.at(-1);
  const nextRedo = redoEntries.at(-1);
  const undoText = busy ? "Restoring…" : undoButtonLabel(nextUndo ? labelFor(nextUndo) : null, saved.length);
  const redoText = nextRedo ? `Redo: ${labelFor(nextRedo)}` : "Nothing to redo";
  const sessionEmpty = !undoEntries.length && !redoEntries.length;
  return <>
    <Button ref={anchor} variant="ghost" size="icon-sm" className={className} title="Edit history" aria-label="Open edit history" aria-expanded={open} aria-controls={open ? panelId : undefined} aria-pressed={open} onClick={() => { setOpen(value => !value); if (!open) { void load(); void loadNames(); } }}><HistoryIcon /></Button>
    {open && createPortal(<div ref={panel} id={panelId} role="region" aria-label="Edit history" style={{ position: "fixed", zIndex: "var(--layer-panel)", width: "min(400px, calc(100vw - 16px))", ...position }} className="editor-chrome flex flex-col overflow-hidden rounded-xl border border-[var(--chrome-line)] bg-[var(--chrome-panel)] text-[13px] text-[var(--ink,#fff)] shadow-xl">
      <div className="flex items-center justify-between px-4 pt-3"><h2 id="edit-history-title" className="text-sm font-semibold">Edit history</h2><Button variant="ghost" size="icon-sm" aria-label="Close edit history" onClick={() => { setOpen(false); anchor.current?.focus(); }}><XIcon /></Button></div>
      <div className="flex flex-col gap-1 px-3 pt-2">
        <Button variant="ghost" className="min-w-0 justify-start text-[13px]" title={undoText} disabled={busy || !undoEntries.length} onClick={onUndo}><span className="truncate">{undoText}</span></Button>
        <Button variant="ghost" className="min-w-0 justify-start text-[13px]" title={redoText} disabled={busy || !redoEntries.length} onClick={onRedo}><span className="truncate">{redoText}</span></Button>
      </div>
      <div className="min-h-0 overflow-y-auto px-4 pb-3 pt-3">
        <h3 className="mb-1 text-[13px] font-semibold">This session</h3>
        {sessionEmpty ? <p className="py-1 text-[var(--ink-muted)]">No edits yet</p> : <ol className="mb-1">
          {redoEntries.map((entry, i) => <li key={`redo-${i}`} className="flex items-baseline justify-between gap-3 py-1.5 text-[var(--ink-muted)]"><span className="min-w-0 truncate line-through">{labelFor(entry)}</span><span className="shrink-0">Undone</span></li>)}
          {undoEntries.slice().reverse().map((entry, i) => <li key={`undo-${i}`} className="flex items-baseline justify-between gap-3 py-1.5"><span className="min-w-0 truncate">{labelFor(entry)}</span>{i === 0 && <span className="shrink-0 text-[var(--ink-muted)]">Next undo</span>}</li>)}
        </ol>}
        <h3 className="mb-1 mt-4 text-[13px] font-semibold">Saved versions</h3>
        <ol className="flex flex-col">{saved.map(entry => <li key={entry.id} className="py-1.5">
          <div className="flex items-baseline justify-between gap-3"><p className={`min-w-0 ${entry.current ? "font-semibold" : "font-medium"}`}>{entry.label}</p><span className="shrink-0 text-[var(--ink-muted)]">{entry.current ? "Current" : entry.version ? `Version ${entry.version}` : ""}</span></div>
          <p className="text-[var(--ink-muted)]">{entry.actor ?? entry.kind}{entry.at ? ` · ${new Date(entry.at).toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}` : ""}</p>
        </li>)}</ol>
        {error && <p role="alert">{error}</p>}
        {loading && <p role="status" className="py-2">Loading history…</p>}
        {!loading && (next || error) && <Button variant="ghost" className="text-[13px]" onClick={() => void load(next ?? undefined)}>{error ? "Retry" : "Load older versions"}</Button>}
        {!loading && !error && !saved.length && <p className="text-[var(--ink-muted)]">No saved versions yet</p>}
        <Link href={`/p/${projectId}/history`} className="mt-3 inline-block text-[var(--ink-secondary)] underline underline-offset-4">Full history</Link>
      </div>
    </div>, document.body)}
  </>;
}
