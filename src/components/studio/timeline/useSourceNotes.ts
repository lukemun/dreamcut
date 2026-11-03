"use client";
import { useEffect, useRef, useState } from "react";
import type { SourceNotes } from "@/lib/local-store/source-notes";
type Saved = SourceNotes & {revision: number};
export function useSourceNotes(projectId: string, assetId: string, enabled = true) {
  const [saved, setSaved] = useState<Saved | null>(null);
  const [draft, setDraft] = useState<SourceNotes | null>(null);
  const [undo, setUndo] = useState<SourceNotes | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saving = useRef(false);
  useEffect(() => {
    if (!enabled) return;
    const abort = new AbortController();
    fetch(`/api/projects/${projectId}/source-notes?asset_id=${encodeURIComponent(assetId)}`, {signal: abort.signal}).then(async r => {const v = await r.json(); if (!r.ok) throw Error(v.error); setSaved(v); setDraft(v);}).catch(e => {if (!abort.signal.aborted) setError(e.message);});
    return () => abort.abort();
  }, [projectId, assetId, enabled]);
  async function commit(value = draft, undoing = false) {
    if (!value || !saved || saving.current) return;
    saving.current = true;
    setBusy(true); setError("");
    try {
      const r = await fetch(`/api/projects/${projectId}/source-notes`, {method:"PUT", headers:{"Content-Type":"application/json"}, body:JSON.stringify({asset_id:assetId,expected_revision:saved.revision,notes:{kind:value.kind,title:value.title,description:value.description,moments:value.moments}})});
      const next = await r.json(); if (!r.ok) throw Error(next.error);
      setUndo(undoing ? null : saved); setSaved(next); setDraft(next);
    } catch(e) {setError((e as Error).message);} finally {saving.current = false; setBusy(false);}
  }
  return {draft,setDraft,error,busy,dirty:JSON.stringify(draft)!==JSON.stringify(saved),commit,cancel:()=>setDraft(saved),undo:undo ? ()=>commit(undo,true) : null};
}
