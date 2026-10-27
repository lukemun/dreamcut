"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Captions, Clapperboard, LayoutGrid, Mic, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { APPROVED_UPLOAD_ACCEPT } from "@/lib/media/upload-library-media";
import type { AgentSelection, ChatSelection } from "@/components/desktop/ProjectReviewDock";
import { NewProjectForm } from "./NewProjectForm";

const DRAFT_KEY = "dreamcut:home-chat-draft";
const SELECTION_KEY = "dreamcut:home-chat-selection";

/** Each starter fills the message; the creator edits it before sending. */
const STARTERS = [
  { label: "Edit my talking-head video", icon: Mic, text: "Edit my talking-head video: keep the best takes and cut the pauses and mistakes." },
  { label: "Add captions", icon: Captions, text: "Add captions to my video." },
  { label: "Make a short from my clips", icon: Clapperboard, text: "Make a 30-second short from my clips." },
];

/**
 * Home's opening chat. A message (and any media dropped on it) starts a project, which opens
 * with the message waiting in its chat and the media in its Library. Templates picked on Home
 * join the message as pills, through the same selection the editor's template catalog uses.
 */
export function HomeChat({ selection, onTryTemplate }: { selection: AgentSelection; onTryTemplate: () => void }) {
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const send = useRef<HTMLButtonElement>(null);
  // The unsent message survives leaving Home and coming back in this tab.
  useEffect(() => { try { const saved = sessionStorage.getItem(DRAFT_KEY); if (saved) setDraft(saved); } catch { /* Storage can be blocked. */ } }, []);
  useEffect(() => { try { if (draft) sessionStorage.setItem(DRAFT_KEY, draft); else sessionStorage.removeItem(DRAFT_KEY); } catch { /* Storage can be blocked. */ } }, [draft]);
  // Grow with the message, up to the composer's CSS max-height.
  useLayoutEffect(() => {
    const node = input.current; if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [draft]);
  const addFiles = (list: FileList | null) => { if (list?.length) setFiles(previous => [...previous, ...Array.from(list)]); };
  const start = (text: string) => { setDraft(text); input.current?.focus(); };
  // A newly picked template brings the chat back into view, ready for the rest of the message.
  const section = useRef<HTMLElement>(null);
  const count = useRef<number | null>(null);
  useEffect(() => {
    const previous = count.current;
    count.current = selection.selections.length;
    if (previous === null || selection.selections.length <= previous) return;
    section.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    input.current?.focus({ preventScroll: true });
  }, [selection.selections.length]);
  const picks = selection.selections;
  const ready = Boolean(draft.trim()) || picks.length > 0;
  const message = [...picks.map(item => `Use the "${item.label}" ${item.kind.toLowerCase()}.`), draft.trim()].filter(Boolean).join("\n");
  return <section ref={section} className="home-chat" aria-labelledby="home-chat-title">
    <h1 id="home-chat-title">What would you like to make?</h1>
    <div className="desktop-chat-composer home-chat-composer" data-over={over || undefined}
      onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); setOver(true); } }}
      onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false); }}
      onDrop={event => { if (!event.dataTransfer.files.length) return; event.preventDefault(); setOver(false); addFiles(event.dataTransfer.files); }}>
      {picks.length > 0 && <ul className="chat-selection-pills chat-upload-pills" aria-label="Selected for this message">
        {picks.map(item => <li key={item.id} className="chat-selection-pill" title={item.label}>
          <span className="chat-selection-pill-kind">{item.kind}</span>
          <span className="chat-selection-pill-label">{item.label}</span>
          <button type="button" aria-label={`Remove ${item.kind} ${item.label}`} onClick={() => selection.removeSelection(item.id)}><X size={12} aria-hidden="true" /></button>
        </li>)}
      </ul>}
      {files.length > 0 && <ul className="chat-selection-pills chat-upload-pills" aria-label="Media for this project">
        {files.map((file, index) => <li key={`${file.name}:${file.size}:${index}`} className="chat-selection-pill" title={file.name}>
          <span className="chat-selection-pill-kind">{file.type.startsWith("image/") ? "Image" : file.type.startsWith("audio/") ? "Audio" : "Video"}</span>
          <span className="chat-selection-pill-label">{file.name}</span>
          <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(previous => previous.filter((_, at) => at !== index))}><X size={12} aria-hidden="true" /></button>
        </li>)}
      </ul>}
      <label className="sr-only" htmlFor="home-chat-message">Message</label>
      <textarea ref={input} id="home-chat-message" rows={3} maxLength={16000} value={draft} placeholder="Describe your video, or drop your clips here…"
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (ready) send.current?.click(); } }} />
      <div className="desktop-chat-actions">
        <input ref={fileInput} type="file" multiple hidden accept={APPROVED_UPLOAD_ACCEPT} onChange={event => { addFiles(event.target.files); event.target.value = ""; }} />
        <Button type="button" variant="ghost" size="sm" onClick={() => fileInput.current?.click()}><Upload size={14} aria-hidden="true" />Add media</Button>
        <div className="flex-1" />
        <NewProjectForm draft={message} files={files} defaultTitle={projectTitle(draft) || picks[0]?.label}
          trigger={<Button ref={send} type="button" size="sm" title="Start project · Enter" disabled={!ready}>Start project<ArrowRight size={14} aria-hidden="true" /></Button>} />
      </div>
    </div>
    <ul className="home-chat-starters" aria-label="Ideas">
      {STARTERS.map(({ label, icon: Icon, text }) => <li key={label}>
        <Button type="button" variant="outline" size="sm" onClick={() => start(text)}><Icon size={14} aria-hidden="true" />{label}</Button>
      </li>)}
      <li><Button type="button" variant="outline" size="sm" onClick={onTryTemplate}><LayoutGrid size={14} aria-hidden="true" />Try a template</Button></li>
    </ul>
  </section>;
}

/** A starting name from the message's first words; the creator can change it before creating. */
function projectTitle(message: string) {
  const words = message.replace(/[:.!?][\s\S]*$/, "").trim().split(/\s+/).slice(0, 6).join(" ");
  return words ? words[0]!.toUpperCase() + words.slice(1) : "";
}

/** Home's own chat selection (no project yet), kept for this tab so Templates → Home keeps the pick. */
export function useHomeSelection(): AgentSelection {
  const [selections, setSelections] = useState<ChatSelection[]>([]);
  useEffect(() => {
    try { const saved = JSON.parse(sessionStorage.getItem(SELECTION_KEY) ?? "[]"); if (Array.isArray(saved)) setSelections(saved); } catch { /* Storage can be blocked. */ }
  }, []);
  const save = useCallback((update: (current: ChatSelection[]) => ChatSelection[]) => setSelections(current => {
    const next = update(current);
    try { if (next.length) sessionStorage.setItem(SELECTION_KEY, JSON.stringify(next)); else sessionStorage.removeItem(SELECTION_KEY); } catch { /* Storage can be blocked. */ }
    return next;
  }), []);
  const toggleSelection = useCallback((item: ChatSelection) => save(current => current.some(other => other.id === item.id) ? current.filter(other => other.id !== item.id) : [...current, item]), [save]);
  const removeSelection = useCallback((id: string) => save(current => current.filter(item => item.id !== id)), [save]);
  const replaceSelectionGroup = useCallback((group: string, next: ChatSelection[]) => save(current => [...current.filter(item => item.group !== group), ...next]), [save]);
  const clearSelections = useCallback(() => save(() => []), [save]);
  return useMemo(() => ({ selections, toggleSelection, removeSelection, replaceSelectionGroup, clearSelections }), [selections, toggleSelection, removeSelection, replaceSelectionGroup, clearSelections]);
}
