"use client";

import { useEffect, useRef, useState } from "react";
import { SlideOutDrawer } from "../timeline/SlideOutDrawer";
import { assetMediaUrl, type AssetJob, type GenerationAsset } from "@/lib/generation/assets";

/** Local media utility. Deliberately has no model, generation prompt, or provider controls. */
export function FrameExtractionDrawer({ projectId, source, onClose, onLibraryChanged }: { projectId: string; source: string | null; onClose: () => void; onLibraryChanged: () => void }) {
  const [jobs, setJobs] = useState<AssetJob[]>([]), [assets, setAssets] = useState<GenerationAsset[]>([]);
  const [times, setTimes] = useState<number[]>([]), [end, setEnd] = useState(0), [start, setStart] = useState(0), [count, setCount] = useState(16);
  const [error, setError] = useState(""), [busy, setBusy] = useState(false), [active, setActive] = useState<string>();
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const video = useRef<HTMLVideoElement>(null), close = useRef<HTMLButtonElement>(null);
  const base = `/api/projects/${encodeURIComponent(projectId)}/asset-generation`;
  useEffect(() => {
    if (!source) return;
    let alive = true;
    const prior = document.activeElement as HTMLElement | null;
    close.current?.focus(); setError(""); setTimes([]); setStart(0);
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && !document.querySelector('[role="dialog"]')) onClose(); };
    window.addEventListener("keydown", key);
    const refresh = async () => {
      const r = await fetch(base); const data = await r.json(); if (!r.ok) throw new Error(data.error);
      if (alive) { setJobs(data.jobs.filter((j: AssetJob) => j.request.task === "extract" && j.references[0]?.source === source)); setAssets(data.assets); }
    };
    void fetch(`${base}/source`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source }) }).then(async r => { const p = await r.json(); if (!r.ok) throw new Error(p.error); if (alive) { setTimes(p.times); setEnd(p.times.at(-1) ?? 0); } }).catch(e => { if (alive) setError(e.message); });
    void refresh().catch(e => { if (alive) setError(e.message); });
    const timer = setInterval(() => { void refresh().catch(e => { if (alive) setError(e.message); }); }, 3000);
    return () => { alive = false; clearInterval(timer); window.removeEventListener("keydown", key); if (prior?.isConnected) prior.focus(); };
  }, [source, base, onClose]);
  useEffect(() => { if (!source) video.current?.pause(); }, [source]);
  const action = async (url: string, body: unknown) => {
    setBusy(true); setError("");
    try { const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const data = await r.json(); if (!r.ok) throw new Error(data.error); setJobs(j => [data.job, ...j.filter(v => v.id !== data.job.id)]); setActive(data.job.id); onLibraryChanged(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const job = jobs.find(j => j.id === active) ?? jobs[0], preview = assets.find(a => a.source === source)?.preview;
  const field = "w-full rounded-lg border border-[var(--chrome-line-strong)] bg-[var(--chrome-deep)] p-2 text-sm";
  return <SlideOutDrawer open={Boolean(source)} label="Extract frames" width="min(760px, 100vw)">
    <header className="flex items-center gap-3 border-b border-[var(--chrome-line)] p-4"><h2 className="flex-1 font-semibold">Extract frames · local tool</h2><button ref={close} onClick={onClose} aria-label="Close frame extraction">Close</button></header>
    <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
      {error ? <p role="alert">{error}</p> : null}
      {preview && source ? <video ref={video} src={preview} controls muted playsInline className="max-h-64 w-full bg-black" /> : <p>Preparing source preview…</p>}
      <div className="grid grid-cols-3 gap-3">{([["Start (s)", start, setStart], ["End (s)", end, setEnd], ["Frame count", count, setCount]] as const).map(([label, value, setter]) => <label key={label} className="text-xs">{label}<input aria-label={label} className={field} type="number" min={label === "Frame count" ? 1 : 0} max={label === "Frame count" ? 24 : times.at(-1)} step={label === "Frame count" ? 1 : 0.01} value={value} onChange={e => setter(Number(e.target.value))} /></label>)}</div>
      <button className={field} disabled={busy || !times.length || end <= start} onClick={() => void action(base, { id: crypto.randomUUID(), draft: { task: "extract", route: "local", references: [{ role: "source", source, label: source?.split("/").pop() }], start, end, count } })}>Extract frames locally</button>
      {job ? <><p className="text-sm">{job.status} · {job.outputs.length} individual frames{job.error ? ` · ${job.error}` : ""}</p><div className="grid gap-3 sm:grid-cols-2">{job.outputs.map(o => <article key={o.id} className="space-y-2 rounded-lg bg-[var(--glass-control)] p-3"><img src={assetMediaUrl(projectId, o.source)} alt={o.id} className="w-full" /><p className="text-xs">{o.id} · {o.timestamp?.toFixed(3)}s</p><input className={field} aria-label={`Describe ${o.id}`} placeholder="Describe this frame…" value={descriptions[o.id] ?? o.annotation ?? ""} onChange={e => setDescriptions(d => ({ ...d, [o.id]: e.target.value }))} /><button className={field} disabled={busy || !(descriptions[o.id] ?? o.annotation)?.trim()} onClick={() => void action(`${base}/${job.id}`, { action: "keep", outputId: o.id, annotation: descriptions[o.id] ?? o.annotation })}>{o.keptSource ? "Save description" : "Keep to Library"}</button></article>)}</div></> : null}
    </div>
  </SlideOutDrawer>;
}
