'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { LoaderCircleIcon } from 'lucide-react';
import type { AssetJob } from '@/lib/generation/assets';
import { downloadPercent, generationProgress } from '@/lib/generation/job-progress';

export function GenerationProgress({ job, action }: { job: AssetJob; action?: ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  const progress = generationProgress(job);
  useEffect(() => {
    if (!progress.active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [progress.active]);
  const elapsed = Math.max(0, Math.floor((now - Date.parse(job.createdAt)) / 1000));
  const checked = job.progress?.checkedAt;
  const age = checked ? Math.max(0, Math.floor((now - Date.parse(checked)) / 1000)) : undefined;
  const percent = downloadPercent(job);
  return <section aria-label="Generation progress" className="space-y-3">
    <div className="flex items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-3" role="status">
      {progress.active && <LoaderCircleIcon aria-hidden className="size-5 shrink-0 animate-spin motion-reduce:animate-none text-[var(--proposal-action)]" />}
      <h3 className="text-base font-semibold">{progress.label}</h3>
    </div>
    {action ? <div className="shrink-0">{action}</div> : null}
    </div>
    {progress.detail && <p className="text-sm text-[var(--ink-muted)]">{progress.detail}</p>}
    {progress.active && <>
      <ol className="grid grid-cols-3 gap-2 text-sm" aria-label="Generation stages">{['Queue', 'Generate', 'Download'].map((label, index) => <li key={label} aria-current={progress.stage === index ? 'step' : undefined} className={`border-t-2 pt-2 ${index <= progress.stage ? 'border-[var(--proposal-action)] text-[var(--ink)]' : 'border-[var(--chrome-line)] text-[var(--ink-muted)]'}`}>{label}{index < progress.stage ? ' ✓' : ''}</li>)}</ol>
      {job.status === 'saving' && job.progress?.downloadedBytes !== undefined && <div className="space-y-1">
        <p className="text-sm">{(job.progress.downloadedBytes / 1048576).toFixed(1)} MB{job.progress.totalBytes ? ` of ${(job.progress.totalBytes / 1048576).toFixed(1)} MB` : ''}{percent !== undefined ? ` · ${percent}%` : ''}{job.progress.outputCount && job.progress.outputCount > 1 ? ` · File ${job.progress.outputIndex} of ${job.progress.outputCount}` : ''}</p>
        {percent !== undefined && <progress aria-label="Result download" value={percent} max={100} className="h-2 w-full accent-[var(--proposal-action)]" />}
      </div>}
      <p className="text-sm tabular-nums text-[var(--ink-muted)]">{Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, '0')} elapsed{age !== undefined ? ` · Last update ${age}s ago` : ''}</p>
      {age !== undefined && age > 30 && <p role="status" className="text-sm text-[var(--proposal-warning)]">No recent update · may still be running</p>}
    </>}
  </section>;
}
