"use client";
import Link from "next/link";
import { useEffect, useId, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";

type Export = { file: string; bytes: number; modified_at: string };
type Share = { cloud_id: string; status: "pending" | "published"; shared_at: string };
type State = { signed_in: boolean; exports: Export[]; share: Share | null };

/** Templates → one of your templates → Share with DreamCut. Needs sign-in and an example export. */
export function TemplateShare({ projectId, templateId }: { projectId: string; templateId: string }) {
  const id = useId();
  const [state, setState] = useState<State | null>(null);
  const [example, setExample] = useState("");
  const [credit, setCredit] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const url = `/api/projects/${encodeURIComponent(projectId)}/template-share`;
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${url}?template=${encodeURIComponent(templateId)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const data = await response.json(); if (!response.ok) throw new Error(data.error); setState(data); setExample(data.exports[0]?.file ?? ""); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => controller.abort();
  }, [url, templateId]);

  async function share() {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ template: templateId, export_file: example, credit_name: credit }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setState(current => current && { ...current, share: data.share });
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  if (!state) return error ? <p role="alert" className="mt-4 text-sm text-destructive">{error}</p> : null;
  const ready = state.signed_in && Boolean(example) && Boolean(credit.trim());
  // A secondary action: the template's own request (Copy request) stays the page's primary action.
  return <section className="template-share" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`} className="template-section-title">Share with DreamCut</h3>
    {state.share ? <p role="status" className="text-sm">{state.share.status === "published" ? "Published" : "Waiting for review"}</p>
      : !state.signed_in ? <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-[var(--ink-muted)]">Sign in to share</span>
        <Link className={buttonVariants({ variant: "outline", size: "sm" })} href={`/p/${encodeURIComponent(projectId)}/user?tab=settings`}>Sign in</Link>
      </div>
      : !state.exports.length ? <p className="text-sm text-[var(--ink-muted)]">Export this project to share it with an example video.</p>
      : <div className="space-y-2">
        <label className="block text-sm" htmlFor={`${id}-example`}>Example video</label>
        <NativeSelect id={`${id}-example`} value={example} disabled={busy} onChange={event => setExample(event.target.value)}>
          {state.exports.map(item => <option key={item.file} value={item.file}>{item.file} · {new Date(item.modified_at).toLocaleDateString()}</option>)}
        </NativeSelect>
        <label className="block text-sm" htmlFor={`${id}-credit`}>Credit name</label>
        <Input id={`${id}-credit`} value={credit} maxLength={60} disabled={busy} onChange={event => setCredit(event.target.value)} autoComplete="nickname" />
        <Button type="button" variant="outline" size="sm" className="mt-1" disabled={busy || !ready} onClick={() => void share()}>{busy ? "Sharing…" : "Share"}</Button>
      </div>}
    {error && <p role="alert" className="mt-2 text-sm text-destructive">{error}</p>}
  </section>;
}
