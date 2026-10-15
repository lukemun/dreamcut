"use client";

import { useEffect, useRef, useState } from "react";
import type { MediaImportJob } from "@/lib/local-store/media-import-jobs";

export function ImportProcessingStatus({ projectId, refreshToken, onComplete }: { projectId: string; refreshToken: number; onComplete?: () => void }) {
  const completedRef = useRef("");
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const [jobs, setJobs] = useState<MediaImportJob[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    let disposed = false;
    const load = async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/import-jobs`, { cache: "no-store" });
        if (!response.ok) throw new Error("Processing status unavailable");
        const data = await response.json();
        if (!disposed) {
          setJobs(data.jobs); setError(null);
          const completed = (data.jobs as MediaImportJob[]).filter(job => job.status === "complete").map(job => `${job.id}:${job.attempt}`).sort().join(",");
          if (completed !== completedRef.current) { completedRef.current = completed; onCompleteRef.current?.(); }
        }
      } catch (error) { if (!disposed) setError(error instanceof Error ? error.message : "Processing status unavailable"); }
    };
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => { disposed = true; clearInterval(timer); };
  }, [projectId, refreshToken, refresh]);
  async function action(id: string, action: "retry" | "cancel") {
    try {
      const response = await fetch(`/api/projects/${projectId}/import-jobs`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
      if (!response.ok) throw new Error((await response.json()).error);
      setRefresh(value => value + 1);
    } catch (error) { setError(error instanceof Error ? error.message : "Job action failed"); }
  }
  if (!jobs.length && !error) return null;
  const active = jobs.filter(job => ["queued", "running"].includes(job.status));
  const failed = jobs.filter(job => job.status === "failed");
  return <details className="mx-3 mb-2 rounded border border-[var(--chrome-line)] px-3 py-2 text-xs text-[var(--ink-secondary)]">
    <summary className="cursor-pointer" aria-live="polite">Media processing · {active.length ? `${active.length} in progress` : failed.length ? `${failed.length} need attention` : "up to date"}</summary>
    {error && <p role="alert">{error}</p>}
    <div className="max-h-48 overflow-auto">
      {[...jobs].sort((a, b) => b.updated_at.localeCompare(a.updated_at)).map(job => <div key={job.id} className="border-t border-[var(--chrome-line)] py-2">
        <div className="flex items-center gap-2"><span className="min-w-0 flex-1 truncate">{job.media_path.split("/").at(-1)}</span><span>{job.cancel_requested && job.status === "running" ? "cancelling" : job.status}</span>
          {(["failed", "cancelled"].includes(job.status)) && <button className="underline" onClick={() => void action(job.id, "retry")}>Retry</button>}
          {(["queued", "running"].includes(job.status)) && <button className="underline" onClick={() => void action(job.id, "cancel")}>Cancel</button>}
        </div>
        {job.error && <p className="mt-1 break-words">{job.error}</p>}
        {job.status === "complete" && <p className="mt-1">Annotations saved{job.outputs?.some(p => p.endsWith("transcript.json")) ? " · transcript ready" : ""}</p>}
      </div>)}
    </div>
  </details>;
}
