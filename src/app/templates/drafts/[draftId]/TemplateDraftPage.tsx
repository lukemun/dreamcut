"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Film } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import type { TemplateDraft } from "@/lib/local-store/template-drafts";

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, "0")}`;

/** One dropped video on its way to becoming the creator's template: mark the effect, say what to
 * copy, hand it to the agent, then save it to Templates → Yours or discard it. */
export function TemplateDraftPage({ initial }: { initial: TemplateDraft }) {
  const router = useRouter();
  const video = useRef<HTMLVideoElement>(null);
  const [draft, setDraft] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [note, setNote] = useState(initial.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const send = async (method: "PATCH" | "DELETE" | "POST", body?: unknown, suffix = "") => {
    setBusy(true); setError("");
    try {
      const response = await fetch(`/api/template-drafts/${draft.id}${suffix}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Something went wrong. Try again.");
      if (result.draft) setDraft(result.draft);
      return result;
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Something went wrong. Try again."); return null; }
    finally { setBusy(false); }
  };
  const patch = (change: Record<string, unknown>) => send("PATCH", change);
  const commitTitle = () => { const next = title.trim(); if (!next) setTitle(draft.title); else if (next !== draft.title) void patch({ title: next }); };
  const commitNote = () => { if (note !== draft.note) void patch({ note }); };
  const now = () => Math.round((video.current?.currentTime ?? 0) * 10) / 10;
  // Until End here is pressed, a new start runs to the end of the video.
  const length = () => Math.round((video.current?.duration || 0) * 10) / 10;
  const markStart = () => { const start = now(); const end = draft.mark && draft.mark.end > start ? draft.mark.end : length(); if (end > start) void patch({ mark: { start, end } }); };
  const markEnd = () => { const end = now(); if (end > (draft.mark?.start ?? 0)) void patch({ mark: { start: draft.mark?.start ?? 0, end } }); };
  const save = async () => { if (await send("POST", undefined, "/save")) router.push("/"); };
  const discard = async () => { if (await send("DELETE")) router.push("/"); };

  return <main className="editor-chrome memory-page template-draft-page" aria-labelledby="template-draft-title">
    <PageHeader id="template-draft-title" icon={<Film size={19} />} title={draft.title}
      back={{ href: "/", label: "Home" }} />
    <div className="template-draft-body">
      <div className="template-draft-media">
        <video ref={video} src={`/api/template-drafts/${draft.id}/media`} controls playsInline preload="metadata" aria-label={`${draft.title} video`} />
        <div className="template-draft-mark" role="group" aria-label="Effect">
          <Button size="sm" variant="ghost" disabled={busy} onClick={markStart}>Start here</Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={markEnd}>End here</Button>
          <span className="template-draft-range">{draft.mark ? `${clock(draft.mark.start)} – ${clock(draft.mark.end)}` : "Whole video"}</span>
          {draft.mark && <Button size="sm" variant="ghost" disabled={busy} onClick={() => void patch({ mark: null })}>Use whole video</Button>}
        </div>
      </div>
      <div className="template-draft-form">
        <label className="template-draft-field"><span>Name</span>
          <Input value={title} maxLength={120} onChange={event => setTitle(event.target.value)} onBlur={commitTitle} onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
        </label>
        <label className="template-draft-field"><span>What to copy</span>
          <textarea className="template-draft-note" value={note} maxLength={2000} rows={4} placeholder="The glitch on each cut" onChange={event => setNote(event.target.value)} onBlur={commitNote} />
        </label>
        <div className="template-draft-actions">
          {draft.stage === "requested"
            ? <p role="status" className="template-draft-status">Waiting for your agent</p>
            : <Button disabled={busy} onClick={() => void patch({ request: true })}>Recreate</Button>}
          <Button variant="outline" disabled={busy} onClick={() => void save()}>Save to Yours</Button>
          {confirmDiscard
            ? <Button variant="destructive" disabled={busy} onClick={() => void discard()}>Discard draft</Button>
            : <Button variant="ghost" disabled={busy} onClick={() => setConfirmDiscard(true)}>Discard</Button>}
        </div>
        {error && <p role="alert" className="template-draft-error">{error}</p>}
      </div>
    </div>
  </main>;
}
