"use client";

import { useCallback, useEffect, useState } from "react";
import { FolderOpenIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export type FinishedExport = {
  job_id: string;
  project_id: string;
  project_title: string;
  completed_at: string;
  file_url: string;
};

/** Refetch whenever an export finishes anywhere in the editor. */
export const EXPORTS_CHANGED_EVENT = "dreamcut:exports-changed";

function when(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/** Library → Exports: the creator's finished videos from every project, newest first. */
export function LibraryExports({ active, search }: { active: boolean; search: string }) {
  const [items, setItems] = useState<FinishedExport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/exports");
      const body = await response.json() as { exports?: FinishedExport[]; error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not load exports");
      setItems(body.exports ?? []);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not load exports");
    }
  }, []);
  useEffect(() => {
    if (!active) return;
    void load();
    const refresh = () => void load();
    window.addEventListener(EXPORTS_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(EXPORTS_CHANGED_EVENT, refresh);
  }, [active, load]);

  const reveal = async (item: FinishedExport) => {
    try {
      const response = await fetch(`/api/exports/${encodeURIComponent(item.job_id)}/reveal`, { method: "POST" });
      if (!response.ok) throw new Error(((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Could not open the folder");
    } catch (reason) {
      toast.error(reason instanceof Error ? reason.message : "Could not open the folder");
    }
  };

  if (error) return <div role="alert" className="p-3 text-sm">{error} <Button variant="ghost" onClick={() => void load()}>Retry</Button></div>;
  if (!items) return <p className="p-5 text-center text-sm text-[var(--ink-muted)]">Loading exports…</p>;
  const query = search.trim().toLowerCase();
  const shown = query ? items.filter((item) => item.project_title.toLowerCase().includes(query)) : items;
  if (!shown.length) return <p className="p-5 text-center text-sm text-[var(--ink-muted)]">{items.length ? "No exports match." : "Finished exports appear here."}</p>;
  return (
    // Tiles, not full-width players: a vertical export would otherwise fill the whole panel.
    <div className="grid min-w-0 grid-cols-[repeat(auto-fill,minmax(132px,1fr))] gap-3" data-library-exports="">
      {shown.map((item) => (
        <div key={item.job_id} className="grid min-w-0 content-start gap-1">
          {/* #t: show the first frame instead of black before playing. */}
          <video src={`${item.file_url}#t=0.1`} controls preload="metadata" className="aspect-square w-full rounded-md bg-black object-contain"
            aria-label={`${item.project_title}, exported ${when(item.completed_at)}`} />
          <div className="flex min-w-0 items-start gap-1">
            <div className="grid min-w-0 flex-1">
              <span className="truncate text-sm font-medium text-[var(--ink)]" title={item.project_title}>{item.project_title}</span>
              <span className="text-xs text-[var(--ink-muted)]">{when(item.completed_at)}</span>
            </div>
            <Button variant="ghost" size="icon-sm" aria-label={`Open ${item.project_title} in folder`} title="Open in folder" onClick={() => void reveal(item)}><FolderOpenIcon /></Button>
          </div>
        </div>
      ))}
    </div>
  );
}
