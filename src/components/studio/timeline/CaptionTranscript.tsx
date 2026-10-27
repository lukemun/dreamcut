"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import type { TimelineElement } from "./types";
import { captionFollowsAudio } from "@/lib/timeline/caption-audio-link";
import { captionTranscriptRows, captionTranscriptTime } from "./caption-transcript";

export function CaptionTranscript({ elements, selectedId, onSelect, onCommit }: {
  elements: readonly TimelineElement[];
  selectedId: string | null;
  onSelect: (element: TimelineElement) => void;
  onCommit: (id: string, text: string, original: string) => Promise<boolean>;
}) {
  const rows = useMemo(() => captionTranscriptRows(elements).filter(element=>!captionFollowsAudio(element)), [elements]);
  if (!rows.length) return null;
  return <div aria-label="Caption transcript" className="caption-transcript-surface grid min-w-0 divide-y divide-[var(--chrome-line)] !p-0">
    {rows.map((element, index) => <TranscriptRow key={element.id} element={element}
      index={index} selected={selectedId === element.id} onSelect={onSelect} onCommit={onCommit} />)}
  </div>;
}

function TranscriptRow({ element, index, selected, onSelect, onCommit }: {
  element: TimelineElement; index: number; selected: boolean;
  onSelect: (element: TimelineElement) => void;
  onCommit: (id: string, text: string, original: string) => Promise<boolean>;
}) {
  const original = String(element.props?.text ?? "");
  const [text, setText] = useState(original);
  const draft = useRef(original);
  const baseline = useRef(original);
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  // Keep failed/unfinished edits local while accepting Undo and edits from Properties.
  useEffect(() => {
    if (!pending.current && draft.current === baseline.current) {
      baseline.current = original;
      draft.current = original;
      setText(original);
    }
  }, [original, saving]);
  const commit = async () => {
    if (pending.current || draft.current === baseline.current) return;
    pending.current = true;
    setSaving(true);
    setError(false);
    try {
      const saved = await onCommit(element.id, draft.current, baseline.current);
      if (saved) baseline.current = draft.current;
      setError(!saved);
    } catch {
      setError(true);
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return <div className="grid min-w-0 gap-1 px-2 py-2" style={selected ? { background: "var(--chrome-selected-bg)" } : undefined}>
    <Button variant="ghost" size="sm" className="h-6 justify-self-start px-1.5 text-xs tabular-nums text-[var(--ink-muted)]" aria-label={`Go to caption ${index + 1} at ${captionTranscriptTime(element.timeline_start)}`}
      aria-pressed={selected} onClick={() => onSelect(element)}>
      {captionTranscriptTime(element.timeline_start)} – {captionTranscriptTime(element.timeline_start + element.duration)}
    </Button>
    <textarea aria-label={`Caption ${index + 1}`} value={text} readOnly={element.position_locked || saving}
      rows={Math.min(5, Math.max(2, text.split("\n").length))}
      className="block w-full min-w-0 resize-y rounded-md border border-transparent bg-transparent px-1.5 py-1 text-sm leading-relaxed text-[var(--ink)] hover:border-[var(--chrome-line)] focus-visible:bg-[var(--chrome-panel)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--chrome-focus-ring)]"
      onFocus={() => onSelect(element)}
      onChange={event => { draft.current = event.target.value; setText(event.target.value); }}
      onBlur={() => { void commit(); }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Escape") {
          event.preventDefault(); event.stopPropagation(); baseline.current = original; draft.current = original; setText(original); setError(false); event.currentTarget.blur();
        } else if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault(); event.currentTarget.blur();
        }
      }} />
    {element.position_locked && <p className="px-1.5 text-xs text-[var(--ink-muted)]">Locked</p>}
    {error && <div role="alert" className="flex items-center gap-1 px-1.5 text-sm text-[var(--destructive)]">Could not save. <Button variant="ghost" size="sm" onClick={() => void commit()}>Retry</Button></div>}
  </div>;
}
