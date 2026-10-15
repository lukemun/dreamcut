"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { deselectStoryboardSource, insertStoryboardShot, groupStoryboardShots, moveShotVisual, moveStoryboardShot, MAX_SHOT_VISUALS, shotVisualIssues, sortShotVisuals, type StoryboardAsset, type StoryboardContent, type StoryboardMark, type StoryboardShot, type StoryboardSnapshot, type StoryboardVisual } from "@/lib/storyboard/model";

async function jsonResponse(response: Response) {
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "Request failed");
  return body;
}
export function useStoryboard(projectId: string) {
  const [snapshot, setSnapshot] = useState<StoryboardSnapshot | null>(null);
  const [assets, setAssets] = useState<StoryboardAsset[]>([]);
  const [catalogReferences, setCatalogReferences] = useState<{ id: string; title: string; sourceHash: string }[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const current = useRef(snapshot), actionQueue = useRef(Promise.resolve()), pendingActions = useRef(0);
  const base = `/api/projects/${encodeURIComponent(projectId)}`;
  const adopt = useCallback((value: StoryboardSnapshot) => { current.current = value; setSnapshot(value); }, []);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const data = await fetch(`${base}/storyboard`, { cache: "no-store", signal }).then(jsonResponse);
    setAssets(data.assets); setCatalogReferences(data.catalogReferences ?? []); adopt(data);
    return data as StoryboardSnapshot & { assets: StoryboardAsset[] };
  }, [base, adopt]);
  useEffect(() => {
    const abort = new AbortController();
    void refresh(abort.signal).catch(e => { if (!abort.signal.aborted) setError(e.message); });
    return () => abort.abort();
  }, [refresh]);
  // Another writer (the chat agent's storyboard draft, another window) bumps the revision;
  // an idle visible page adopts it instead of failing the next edit as stale.
  useEffect(() => {
    const abort = new AbortController();
    const check = async () => {
      if (document.hidden || pendingActions.current || !current.current) return;
      try {
        const { revision } = await fetch(`${base}/storyboard?fields=revision`, { cache: "no-store", signal: abort.signal }).then(jsonResponse);
        if (!pendingActions.current && current.current && revision !== current.current.revision) { await refresh(abort.signal); setNotice("Storyboard updated."); }
      } catch { /* Next tick retries; explicit actions report errors. */ }
    };
    const timer = setInterval(check, 2500);
    document.addEventListener("visibilitychange", check);
    return () => { abort.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", check); };
  }, [base, refresh]);
  // A watched source (a dropped reference) polls until it is ready, even before its import
  // job reports a preparation state.
  const [watched, setWatched] = useState<string | null>(null);
  const preparationPending = assets.some(a => a.preparationState === "preparing")
    || (!!watched && !assets.some(a => a.source === watched && (a.ready || a.preparationState === "failed")));
  useEffect(() => {
    if (!preparationPending) return;
    const abort = new AbortController();
    let running = false;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const data = await fetch(`${base}/storyboard`, { cache: "no-store", signal: abort.signal }).then(jsonResponse);
        if (!abort.signal.aborted) setAssets(data.assets); // Do not overwrite editing drafts/history during polling.
      } catch { /* Keep the last usable media list; explicit Refresh can report errors. */ }
      finally { running = false; }
    }, 3000);
    return () => { abort.abort(); clearInterval(timer); };
  }, [base, preparationPending]);
  const run = useCallback((action: () => Promise<void>) => {
    pendingActions.current += 1; setBusy(true);
    const task = actionQueue.current.then(async () => {
      setError("");
      try { await action(); } catch (e) { setError(e instanceof Error ? e.message : "Could not finish that action"); }
      finally { pendingActions.current -= 1; if (!pendingActions.current) setBusy(false); }
    });
    actionQueue.current = task;
    return task;
  }, []);
  const write = useCallback(async (action: "save" | "undo" | "redo", content?: StoryboardContent) => {
    if (!current.current) throw new Error("Storyboard is still loading");
    const data = await fetch(`${base}/storyboard`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, revision: current.current.revision, ...(content ? { content } : {}) }) }).then(jsonResponse);
    adopt(data);
  }, [base, adopt]);
  const edit = useCallback((change: (board: StoryboardContent) => StoryboardContent) => run(async () => {
    if (current.current) {
      const next = change(current.current.content);
      if (next !== current.current.content) await write("save", next);
    }
  }), [run, write]);
  /** Each visual change is one storyboard save, so one Undo reverts it. */
  const editVisuals = (shotId: string, change: (visuals: StoryboardVisual[], shot: StoryboardShot) => StoryboardVisual[], extraSources: string[] = []) => edit(b => {
    const shot = b.shots.find(s => s.id === shotId);
    if (!shot) throw new Error("That shot is no longer in the story");
    const visuals = sortShotVisuals(change(shot.visuals ?? [], shot));
    const issue = shotVisualIssues({ duration: shot.duration, visuals })[0];
    if (issue) throw new Error(issue);
    return { ...b, sources: [...new Set([...b.sources, ...extraSources])], shots: b.shots.map(s => s.id === shotId ? { ...s, visuals: visuals.length ? visuals : undefined } : s) };
  });
  const addVisual = (shotId: string, source: string) => editVisuals(shotId, (visuals, shot) => {
    const asset = assets.find(a => a.source === source);
    if (!asset || asset.kind === "audio" || !asset.ready) throw new Error("Choose a prepared photo or video");
    if (visuals.length >= MAX_SHOT_VISUALS) throw new Error(`A shot holds at most ${MAX_SHOT_VISUALS} visuals`);
    const last = visuals.at(-1), at = last ? last.at + last.duration : 0;
    const room = Math.floor((shot.duration - at) * 30) / 30;
    if (room < 1 / 30) throw new Error("No room left in this shot. Shorten or move a visual first");
    const duration = Math.min(2, room, asset.kind === "video" ? Math.floor((asset.duration ?? 0) * 30) / 30 : Infinity);
    return [...visuals, { id: crypto.randomUUID(), source, start: 0, at: +at.toFixed(4), duration, label: asset.name, note: "" }];
  }, [source]);
  const selectionQueue = useRef(Promise.resolve());
  const selectMedia = (sources: string[]) => {
    selectionQueue.current = selectionQueue.current.then(async () => {
    await fetch(`${base}/storyboard`, {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"select",sources})}).then(jsonResponse);
    }).catch(e => setError(e.message));
    return selectionQueue.current;
  };
  const load = (sources: string[]) => edit(b => ({ ...b, sources: [...new Set([...b.sources, ...sources])] }));
  const useAsset = (source: string, mark?: StoryboardMark, beforeId?: string) => edit(b => {
    const asset = assets.find(a => a.source === source);
    if (!asset?.ready) throw new Error("Prepare the preview before using this footage");
    const start = mark?.start ?? 0;
    const duration = asset.kind === "image" ? .5 : mark?.end != null ? mark.end - start : Math.min(2, (asset.duration ?? 0) - start);
    if (duration < 1 / 30) throw new Error("Choose a moment before the end of the clip");
    const shot: StoryboardShot = { id: crypto.randomUUID(), source, start, duration, label: mark?.label || asset.name, note: "", text: "", ...(mark ? { markId: mark.id } : {}) };
    return insertStoryboardShot(b, shot, beforeId, !mark);
  });
  /** Managed-copy import through the uploaded-assets route; returns the new storyboard sources. */
  const importFiles = async (files: File[]) => {
    const loaded: string[] = [], failures: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const video = /\.(mp4|mov|webm|m4v)$/i.test(file.name);
      if (!video && !/\.(png|jpe?g|webp)$/i.test(file.name)) { failures.push(`${file.name}: unsupported format`); continue; }
      setNotice(`Importing ${i + 1} of ${files.length}: ${file.name}`);
      try {
        const form = new FormData(); form.set("file", file); form.set("asset_type", video ? "video_clip" : "still");
        const result = await fetch(`${base}/uploaded-assets`, { method: "POST", body: form }).then(jsonResponse);
        const prefix = `${base}/media/`;
        const pathname = new URL(result.asset.source_url, window.location.origin).pathname;
        if (!pathname.startsWith(prefix)) throw new Error("Import returned an unknown source");
        loaded.push(pathname.slice(prefix.length).split("/").map(decodeURIComponent).join("/"));
      } catch (e) { failures.push(`${file.name}: ${e instanceof Error ? e.message : "import failed"}`); }
    }
    await refresh();
    if (current.current && loaded.length) await write("save", { ...current.current.content, sources: [...new Set([...current.current.content.sources, ...loaded])] });
    return { loaded, failures };
  };
  const upload = (files: File[]) => run(async () => {
    const { loaded, failures } = await importFiles(files);
    setNotice(`${loaded.length} imported${failures.length ? `; ${failures.length} need attention` : ""}`);
    if (failures.length) throw new Error(failures.join("\n"));
  });
  /** Imports one video for Follow reference; the caller attaches it once preparation makes it valid. */
  const uploadReference = (file: File, imported: (source: string) => void) => run(async () => {
    if (!/\.(mp4|mov|webm|m4v)$/i.test(file.name)) throw new Error("Choose a video file for the reference");
    const { loaded, failures } = await importFiles([file]);
    if (failures.length || !loaded[0]) throw new Error(failures.join("\n") || "Import failed");
    setNotice(`Imported ${file.name}. Preparing it as the reference…`);
    imported(loaded[0]);
  });
  const prepare = (source: string) => run(async () => {
    await fetch(`${base}/media-preparation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source }) }).then(jsonResponse);
    await refresh(); setNotice("Preparing preview…");
  });
  /** Lays the story onto the timeline and opens the editor. A timeline with clips asks first (`confirm`), then appends. */
  const build = (append = false, confirm?: (clips: number) => void) => run(async () => {
    const response = await fetch(`${base}/storyboard/timeline`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ revision: current.current?.revision, append }) });
    const body = await response.json();
    if (response.status === 409 && body.needs_confirmation) { confirm?.(body.clips); return; }
    if (!response.ok) throw new Error(body.error ?? "Could not build the timeline");
    window.location.assign(`/p/${encodeURIComponent(projectId)}`);
  });
  /** Recast actions that change the board (Generate, choosing a take); the board adopts the server's result. */
  const recast = (action: "generate" | "use", body: Record<string, unknown>, done?: (result: { ready?: boolean; message?: string; started?: number; failures?: { error: string }[] }) => void) => run(async () => {
    const response = await fetch(`${base}/storyboard/recast`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, revision: current.current?.revision, ...body }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Recast failed");
    if (result.storyboard) adopt(result.storyboard); else await refresh();
    if (result.failures?.length) setError(result.failures.map((f: { error: string }) => f.error).join("\n"));
    if (result.ready === false) setNotice(result.message);
    done?.(result);
  });
  /** Beats at the reference's shot cuts, replacing the current beats as one Undo step. */
  const splitAtCuts = () => run(async () => {
    const reference = current.current?.content.reference;
    if (!reference) return;
    const response = await fetch(`${base}/storyboard/recast`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cuts", source: reference.source }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not find the cuts");
    const beats = (result.beats as { start: number; end: number }[]).map((b, i) => ({ id: crypto.randomUUID(), label: `Shot ${i + 1}`, start: b.start, end: b.end, originalText: "", text: "", note: "", candidates: [], reviewed: false }));
    await write("save", { ...current.current!.content, reference: { ...reference, beats } });
    setNotice(`${beats.length} beats, one per shot`);
  });
  return { recast, splitAtCuts, edit, catalogReferences, prepareCatalogReference: (id: string) => run(async () => {
      await fetch(id.startsWith("user:") ? `${base}/storyboard` : `${base}/media-preparation`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(id.startsWith("user:") ? { action: "prepare_reference", id: id.slice(5) } : { catalog_visual_id: id }) }).then(jsonResponse);
      await refresh(); setNotice("Catalog reference added to Library.");
    }), snapshot, assets, busy, error, notice, selectMedia, refresh: () => run(async () => { await refresh(); setNotice("Footage refreshed."); }), load, upload, uploadReference, watch: setWatched, prepare, build, useAsset,
    selectSource: (source: string, selected: boolean) => selected ? useAsset(source) : edit(b => deselectStoryboardSource(b, source)),
    undo: () => run(() => write("undo")), redo: () => run(() => write("redo")),
    saveMark: (mark: StoryboardMark) => edit(b => ({ ...b, marks: [...b.marks.filter(m => m.id !== mark.id), mark] })),
    removeMark: (id: string) => edit(b => ({ ...b, marks: b.marks.filter(m => m.id !== id) })),
    patchShot: (id: string, patch: Partial<StoryboardShot>) => edit(b => {
      const shots = b.shots.map(s => s.id === id ? { ...s, ...patch } : s);
      if (shots.some(s => s.id === id && shotVisualIssues(s).length)) throw new Error("The visuals over this shot would run past its end. Shorten or move them first");
      return { ...b, shots };
    }),
    addVisual,
    patchVisual: (shotId: string, id: string, patch: Partial<StoryboardVisual>) => editVisuals(shotId, visuals => visuals.map(v => v.id === id ? { ...v, ...patch } : v)),
    removeVisual: (shotId: string, id: string) => editVisuals(shotId, visuals => visuals.filter(v => v.id !== id)),
    moveVisual: (shotId: string, id: string, delta: -1 | 1) => editVisuals(shotId, visuals => moveShotVisual(visuals, id, delta)),
    removeShot: (id: string) => edit(b => ({ ...b, shots: b.shots.filter(s => s.id !== id) })),
    move: (id: string, before?: string) => edit(b => moveStoryboardShot(b, id, before)),
    group: (ids: string[], name: string) => edit(b => groupStoryboardShots(b, ids, name, crypto.randomUUID())),
    ungroup: (id: string) => edit(b => ({ ...b, shots: b.shots.map(s => s.groupId === id ? { ...s, groupId: undefined } : s), groups: b.groups.filter(g => g.id !== id) })),
  };
}
