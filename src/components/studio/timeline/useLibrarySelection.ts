"use client";
import { useCallback, useEffect, useState } from "react";

// The editor mounts several Library views (the drawer, the docked panel); each change is announced so every
// view, and the Selected tray they feed, shows the same selection.
const CHANGED_EVENT = "dreamcut:library-selection-changed";

export function useLibrarySelection(projectId: string, open: boolean) {
  const [sources, setSources] = useState<string[]>([]);
  useEffect(() => {
    const onChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId: string; sources: string[] }>).detail;
      if (detail?.projectId === projectId) setSources(detail.sources);
    };
    window.addEventListener(CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(CHANGED_EVENT, onChanged);
  }, [projectId]);
  const announce = useCallback((next: string[]) => {
    setSources(next);
    window.dispatchEvent(new CustomEvent(CHANGED_EVENT, { detail: { projectId, sources: next } }));
  }, [projectId]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useCallback(async (command?: unknown) => {
    const response = await fetch(`/api/projects/${projectId}/library-selection`, command ? {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(command),
    } : { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error ?? "Could not update Library selection.");
    return body;
  }, [projectId]);
  useEffect(() => {
    if (!open) return;
    let canceled = false;
    // A selection belongs to the session that made it: the first open in this tab starts empty.
    const sessionKey = `dreamcut:library-selection-started:${projectId}`;
    let started = true;
    try { started = sessionStorage.getItem(sessionKey) === "1"; sessionStorage.setItem(sessionKey, "1"); } catch { /* Keep the saved selection. */ }
    void request().then(async body => {
      const sources: string[] = !started && body.sources.length ? (await request({ action: "set", sources: [] })).sources : body.sources;
      if (!canceled) { announce(sources); setError(null); }
    }).catch(err => { if (!canceled) setError(err.message); });
    return () => { canceled = true; };
  }, [open, request, projectId, announce]);
  const update = async (command: unknown) => {
    setBusy(true);
    setError(null);
    try { const body = await request(command); announce(body.sources); }
    finally { setBusy(false); }
  };
  return { sources, busy, error, toggle: (source: string) => update({ action: "toggle", source }),
    clear: () => update({ action: "set", sources: [] }),
    prepareAudio: (source: string) => request({ action: "prepare_audio", source }) as Promise<{ source: string; name: string }>,
    prepareReference: (source: string) => request({ action: "prepare_reference", source }) as Promise<{ source: string; name: string }> };
}
