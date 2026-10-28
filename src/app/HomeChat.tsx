"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Captions, Clapperboard, LayoutGrid, Mic, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { TIMELINE_ASPECT_RATIOS, type TimelineAspectRatioValue } from "@/lib/aspect-ratios";
import { APPROVED_UPLOAD_ACCEPT, deriveUploadAssetType, uploadLibraryMedia } from "@/lib/media/upload-library-media";
import { FEEDBACK_DIRECTION_MAX } from "@/lib/timeline/editing-feedback";
import type { AgentSelection, ChatSelection } from "@/components/desktop/ProjectReviewDock";

const DRAFT_KEY = "dreamcut:home-chat-draft";
const SELECTION_KEY = "dreamcut:home-chat-selection";

/** Each starter fills the message; the creator edits it before sending. */
const STARTERS = [
  { label: "Edit my talking-head video", icon: Mic, text: "Edit my talking-head video: keep the best takes and cut the pauses and mistakes." },
  { label: "Add captions", icon: Captions, text: "Add captions to my video." },
  { label: "Make a short from my clips", icon: Clapperboard, text: "Make a 30-second short from my clips." },
];

/**
 * Home's opening chat. Start project creates the project in one step: the message becomes its
 * brief for the first cut (shown under Up next, and read by the agent in Claude Code, Codex or the
 * app's own chat) and the media goes into its Library. Templates picked on Home join the message as
 * pills, through the same selection the editor's template catalog uses.
 */
export function HomeChat({ selection, onTryTemplate }: { selection: AgentSelection; onTryTemplate: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const send = useRef<HTMLButtonElement>(null);
  // Starting: the project once created (a retry reuses it), files already imported, and what is happening now.
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const started = useRef<string | null>(null);
  const imported = useRef(new Set<File>());
  // The unsent message survives leaving Home and coming back in this tab.
  useEffect(() => { try { const saved = sessionStorage.getItem(DRAFT_KEY); if (saved) setDraft(saved); } catch { /* Storage can be blocked. */ } }, []);
  useEffect(() => { try { if (draft) sessionStorage.setItem(DRAFT_KEY, draft); else sessionStorage.removeItem(DRAFT_KEY); } catch { /* Storage can be blocked. */ } }, [draft]);
  // Grow with the message, up to the composer's CSS max-height.
  useLayoutEffect(() => {
    const node = input.current; if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [draft]);
  const addFiles = (list: FileList | null) => {
    if (!list?.length) return;
    const all = Array.from(list), usable = all.filter(file => deriveUploadAssetType(file));
    setError(usable.length < all.length ? "Only images, videos and audio can be added." : null);
    setFiles(previous => [...previous, ...usable]);
  };
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
  const ready = (Boolean(draft.trim()) || picks.length > 0) && !busy;
  const message = [...picks.map(item => `Use the "${item.label}" ${item.kind.toLowerCase()}.`), draft.trim()].filter(Boolean).join("\n");
  const startProject = async () => {
    if (!ready) return;
    if (message.length > FEEDBACK_DIRECTION_MAX) { setError("Shorten the message to 2,000 characters."); return; }
    setBusy(true); setError(null);
    try {
      let projectId = started.current;
      if (!projectId) {
        setProgress("Creating project…");
        const response = await fetch("/api/projects/start", { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: projectTitle(draft) || picks[0]?.label || "New project", brief: message, aspect_ratio: await shapeOf(files) }) });
        const body = await response.json() as { id?: string; error?: string };
        if (!response.ok || !body.id) throw new Error(body.error ?? "Could not start the project");
        projectId = started.current = body.id;
        // The app's own chat (desktop app) opens with the brief ready to send.
        try { sessionStorage.setItem(`dreamcut:chat-draft:${projectId}`, message); } catch { /* Storage can be blocked. */ }
      }
      for (const [index, file] of files.entries()) {
        if (imported.current.has(file)) continue;
        setProgress(`Importing ${index + 1} of ${files.length}…`);
        await uploadLibraryMedia(projectId, file).catch(cause => { throw new Error(`${file.name}: ${cause instanceof Error ? cause.message : "Import failed"}`); });
        imported.current.add(file);
      }
      setDraft(""); selection.clearSelections();
      router.push(`/p/${encodeURIComponent(projectId)}?review=open`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not start the project");
      setBusy(false); setProgress("");
    }
  };
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
          {!imported.current.has(file) && !busy && <button type="button" aria-label={`Remove ${file.name}`} onClick={() => setFiles(previous => previous.filter((_, at) => at !== index))}><X size={12} aria-hidden="true" /></button>}
        </li>)}
      </ul>}
      <label className="sr-only" htmlFor="home-chat-message">Message</label>
      <textarea ref={input} id="home-chat-message" rows={3} maxLength={FEEDBACK_DIRECTION_MAX} value={draft} disabled={busy} placeholder="Describe your video, or drop your clips here…"
        onChange={event => setDraft(event.target.value)}
        onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (ready) send.current?.click(); } }} />
      <div className="desktop-chat-actions">
        <input ref={fileInput} type="file" multiple hidden accept={APPROVED_UPLOAD_ACCEPT} onChange={event => { addFiles(event.target.files); event.target.value = ""; }} />
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={14} aria-hidden="true" />Add media</Button>
        <div className="flex-1" />
        {progress && <span role="status" className="text-xs text-[var(--ink-secondary)]">{progress}</span>}
        {error && started.current && !busy && <Button type="button" variant="ghost" size="sm" onClick={() => router.push(`/p/${encodeURIComponent(started.current!)}?review=open`)}>Open project</Button>}
        <Button ref={send} type="button" size="sm" title="Start project · Enter" disabled={!ready} onClick={() => void startProject()}>
          {error && started.current ? "Retry" : "Start project"}<ArrowRight size={14} aria-hidden="true" />
        </Button>
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-[var(--destructive)]">{error}</p>}
    <ul className="home-chat-starters" aria-label="Ideas">
      {STARTERS.map(({ label, icon: Icon, text }) => <li key={label}>
        <Button type="button" variant="outline" size="sm" onClick={() => start(text)}><Icon size={14} aria-hidden="true" />{label}</Button>
      </li>)}
      <li><Button type="button" variant="outline" size="sm" onClick={onTryTemplate}><LayoutGrid size={14} aria-hidden="true" />Try a template</Button></li>
    </ul>
  </section>;
}

/** The video shape of the first clip or image (vertical when there is none or it cannot be read quickly). */
async function shapeOf(files: File[]): Promise<TimelineAspectRatioValue> {
  const file = files.find(item => item.type.startsWith("video/")) ?? files.find(item => item.type.startsWith("image/"));
  if (!file) return "9:16";
  const url = URL.createObjectURL(file);
  try {
    // Browser metadata can hang on codecs it cannot play; give up after a moment.
    const size = await Promise.race([
      new Promise<{ width: number; height: number } | null>(resolve => {
        if (file.type.startsWith("video/")) {
          const video = document.createElement("video");
          video.preload = "metadata";
          video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight });
          video.onerror = () => resolve(null);
          video.src = url;
        } else {
          const image = new Image();
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => resolve(null);
          image.src = url;
        }
      }),
      new Promise<null>(resolve => setTimeout(() => resolve(null), 2000)),
    ]);
    if (!size?.width || !size.height) return "9:16";
    const ratio = size.width / size.height;
    return TIMELINE_ASPECT_RATIOS.reduce((best, option) => {
      const [w, h] = option.value.split(":").map(Number);
      return Math.abs(Math.log(w! / h! / ratio)) < Math.abs(Math.log(best.w / best.h / ratio)) ? { value: option.value, w: w!, h: h! } : best;
    }, { value: "9:16" as TimelineAspectRatioValue, w: 9, h: 16 }).value;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A starting name from the message's first words; the creator can rename the project later. */
function projectTitle(message: string) {
  const sentence = message.replace(/[:.!?\n][\s\S]*$/, "").trim().replace(/\s+/g, " ");
  // The whole first sentence when it is short, otherwise its words up to about 48 characters.
  const words = sentence.length <= 48 ? sentence : sentence.slice(0, 49).replace(/\s+\S*$/, "");
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
