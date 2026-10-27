"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import styles from "./EditingMemory.module.css";

type Suggestion = { id: string; title: string; rationale: string; markdown_addition: string; evidence: { ref: string; note: string }[]; created_at: string };
type KeptVersion = { id: string; kept_at: string; markdown: string; templates: number };
type View = { signed_in: boolean; suggestions: Suggestion[]; conflicts: KeptVersion[]; error: string | null };

/** Memory → My style: suggestions the DreamCut team sent to the account, and local versions kept
 * when a sync found a newer account copy. Deciding never applies anything without the creator. */
export function CloudStyleSuggestions({ settingsHref, onStyleChanged }: { settingsHref: string; onStyleChanged: () => void }) {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/user/cloud-style", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setView(data);
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function act(key: string, body: unknown) {
    setBusy(key); setError("");
    try {
      const response = await fetch("/api/user/cloud-style", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      onStyleChanged();
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(null); }
  }

  return <>
    <details className="memory-card" open={Boolean(view?.suggestions.length) || undefined}>
      <summary>Suggestions from DreamCut{view?.suggestions.length ? ` · ${view.suggestions.length}` : ""}</summary>
      {!view && !error && <p role="status">Loading…</p>}
      {view && !view.signed_in && <div className="memory-row"><p>Not signed in</p><Link className={buttonVariants({ variant: "outline", size: "sm" })} href={settingsHref}>Sign in</Link></div>}
      {view?.signed_in && !view.error && !view.suggestions.length && <p>No suggestions to review</p>}
      {view?.error && <p role="status">{view.error}</p>}
      {view?.suggestions.map(item => <article className={styles.preference} key={item.id}>
        <h4 className="font-semibold">{item.title}</h4>
        <p>{item.rationale}</p>
        <div className="memory-eyebrow">Adds to my style</div>
        <p className="whitespace-pre-wrap">{item.markdown_addition}</p>
        {item.evidence.length > 0 && <details><summary>Evidence · {item.evidence.length}</summary>{item.evidence.map((evidence, index) => <div className={styles.evidence} key={`${evidence.ref}-${index}`}>{evidence.note || evidence.ref}</div>)}</details>}
        <div className="memory-row">
          <Button type="button" size="sm" disabled={busy !== null} onClick={() => void act(`accept-${item.id}`, { action: "decide", id: item.id, decision: "accept" })}>{busy === `accept-${item.id}` ? "Adding…" : "Add to my style"}</Button>
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void act(`reject-${item.id}`, { action: "decide", id: item.id, decision: "reject" })}>Reject</Button>
        </div>
      </article>)}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </details>
    {!!view?.conflicts.length && <details className="memory-card"><summary>Earlier versions from this computer · {view.conflicts.length}</summary>
      {view.conflicts.map(item => <article className={styles.preference} key={item.id}>
        <div className="memory-eyebrow">Kept {new Date(item.kept_at).toLocaleString()}{item.templates ? ` · ${item.templates} saved template${item.templates === 1 ? "" : "s"}` : ""}</div>
        <p className="whitespace-pre-wrap">{item.markdown}</p>
        <div className="memory-row">
          <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void act(`restore-${item.id}`, { action: "restore_conflict", id: item.id })}>Use this text</Button>
          <Button type="button" variant="ghost" size="sm" disabled={busy !== null} onClick={() => void act(`dismiss-${item.id}`, { action: "dismiss_conflict", id: item.id })}>Hide</Button>
        </div>
      </article>)}
    </details>}
  </>;
}
