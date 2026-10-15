"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function EditableProjectTitle({ projectId, title }: { projectId: string; title: string }) {
  const router = useRouter();
  const [savedTitle, setSavedTitle] = useState(title);
  const [draft, setDraft] = useState(title);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const saving = useRef(false);
  const canceled = useRef(false);
  const restoreFocus = useRef(false);

  useEffect(() => { setSavedTitle(title); }, [title]);
  useEffect(() => {
    const refresh = (event: Event) => {
      if ((event as CustomEvent).detail?.projectId === projectId) router.refresh();
    };
    window.addEventListener("timeline-editor:project-restored", refresh);
    return () => window.removeEventListener("timeline-editor:project-restored", refresh);
  }, [projectId, router]);
  useEffect(() => {
    if (editing) { input.current?.focus(); input.current?.select(); }
    else if (restoreFocus.current) { trigger.current?.focus(); restoreFocus.current = false; }
  }, [editing]);

  const begin = () => {
    canceled.current = false;
    setDraft(savedTitle);
    setError(null);
    setEditing(true);
  };
  const finish = () => { setEditing(false); };
  const save = async () => {
    if (saving.current || canceled.current) return;
    const next = draft.trim();
    if (!next) { setError("Enter a project title."); input.current?.focus(); return; }
    if (next === savedTitle) { finish(); return; }
    saving.current = true;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/title`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: next, expected_title: savedTitle }),
      });
      const body = await response.json() as { title?: string; error?: string; history?: unknown };
      if (!response.ok || !body.title) throw new Error(body.error ?? "Could not save the title. Try again.");
      setSavedTitle(body.title);
      if (body.history) window.dispatchEvent(new CustomEvent("timeline-editor:project-title-saved", { detail: { projectId, history: body.history } }));
      finish();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the title. Try again.");
    } finally { saving.current = false; setBusy(false); }
  };

  return <div className="relative min-w-0 shrink">
    {editing ? <Input ref={input} aria-label="Project title" value={draft} maxLength={200}
      disabled={busy} aria-invalid={!!error} aria-describedby={error ? "project-title-help project-title-error" : "project-title-help"}
      title="Enter to save. Escape to cancel. Clicking away also saves."
      className="h-9 w-52 max-w-full text-sm font-semibold"
      onChange={event => setDraft(event.target.value)} onBlur={() => void save()}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") { event.preventDefault(); restoreFocus.current = true; void save(); }
        if (event.key === "Escape") { event.preventDefault(); restoreFocus.current = true; canceled.current = true; setError(null); finish(); }
      }} /> : <Button ref={trigger} variant="ghost" size="sm"
        className="min-w-0 max-w-full justify-start px-1 font-semibold text-[var(--ink)]"
        aria-label={`Edit project title: ${savedTitle}`} title={`${savedTitle} · Double-click to rename`}
        onDoubleClick={begin} onClick={event => { if (event.detail === 0) begin(); }}>
        <span className="truncate">{savedTitle}</span>
      </Button>}
    {editing ? <span id="project-title-help" className="sr-only">Enter to save. Escape to cancel. Clicking away also saves.</span> : null}
    {error ? <p id="project-title-error" role="alert" className="absolute left-0 top-full z-10 mt-1 w-64 max-w-[80vw] rounded border border-[var(--chrome-line)] bg-[var(--chrome-raised)] p-2 text-sm text-[var(--ink)]">{error}</p> : null}
  </div>;
}
