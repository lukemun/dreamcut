"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { VoiceInput } from "@/components/desktop/VoiceInput";
import styles from "./storyboard.module.css";

const SAVE_DELAY_MS = 1000;

/**
 * Inline note with the storyboard's ordinary save path: typing saves after a pause and
 * on blur; Escape restores the saved text. Dictation appears only where the local voice
 * bridge exists (the desktop app) and appends its transcript.
 */
export function ShotNote({ value, label, placeholder, maxLength, projectId, save, className, voice = true, highlight }: {
  value: string; label: string; placeholder: string; maxLength: number; projectId: string;
  save: (value: string) => void; className?: string;
  /** false: no dictation button (a plain field). */ voice?: boolean;
  /** Marks the n-th word of the text (-1: none), e.g. the word being spoken during playback. */ highlight?: number;
}) {
  const [draft, setDraft] = useState(value);
  const field = useRef<HTMLTextAreaElement>(null), timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef(false), sent = useRef(value), latest = useRef(value), saveRef = useRef(save);
  saveRef.current = save; latest.current = draft;
  // Adopt saved/undone text unless the person is mid-edit.
  useEffect(() => { if (!dirty.current) { setDraft(value); sent.current = value; } }, [value]);
  const fit = () => { const node = field.current; if (node) { node.style.height = "auto"; node.style.height = `${node.scrollHeight}px`; } };
  useLayoutEffect(fit, [draft]);
  // Width changes (layout switch, panel resize) rewrap the text, so the height follows.
  useEffect(() => { const node = field.current; if (!node) return; let width = node.clientWidth;
    const observer = new ResizeObserver(() => { if (node.clientWidth !== width) { width = node.clientWidth; fit(); } });
    observer.observe(node); return () => observer.disconnect(); }, []);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  const flush = (text = latest.current, final = true) => {
    clear();
    if (text !== sent.current) { sent.current = text; saveRef.current(text); }
    if (final) dirty.current = false;
  };
  useEffect(() => () => { if (dirty.current) flush(); }, []); // Flush an unsaved draft when the card or panel closes.
  const change = (text: string, immediate = false) => {
    setDraft(text); latest.current = text; dirty.current = true; clear();
    if (immediate) { flush(text, document.activeElement !== field.current); return; }
    // Debounced saves skip an emptied note so a block does not vanish mid-edit; blur saves it.
    if (text.trim()) timer.current = setTimeout(() => flush(text, false), SAVE_DELAY_MS);
  };
  // The highlight is drawn on a copy of the text laid out exactly like the field, behind it.
  let word = -1;
  const mirror = highlight !== undefined && <div className={styles.noteMirror} aria-hidden="true">
    {draft.split(/(\s+)/).map((part, i) => i % 2 || !part ? part : ++word === highlight ? <mark key={i}>{part}</mark> : part)}{"\n"}
  </div>;
  const textarea = <textarea ref={field} rows={1} aria-label={label} placeholder={placeholder} maxLength={maxLength} value={draft}
      onChange={e => change(e.target.value)} onBlur={() => flush()}
      onKeyDown={e => { if (e.key === "Escape") { e.preventDefault(); clear(); dirty.current = false; setDraft(sent.current); latest.current = sent.current; e.currentTarget.blur(); } }} />;
  return <div className={`${styles.noteField} ${className ?? ""}`} data-no-details>
    {mirror ? <div className={styles.noteText}>{mirror}{textarea}</div> : textarea}
    {voice && <VoiceInput projectId={projectId} disabled={false} label={`Dictate ${label.toLowerCase()}`}
      onText={text => { const spoken = text.trim(); if (spoken) change((latest.current ? `${latest.current.trimEnd()} ${spoken}` : spoken).slice(0, maxLength), true); }} />}
  </div>;
}
