import type { AssetJob } from './assets';

export function generationProgress(job: AssetJob) {
  const status = job.progress?.providerStatus;
  if (job.status === 'saving') return { label: job.progress?.phase === 'verifying' ? 'Checking downloaded result' : 'Downloading result', detail: '', stage: 2, active: true };
  if (job.status === 'running' && status === 'IN_QUEUE') return { label: 'Waiting in provider queue', detail: job.progress?.queuePosition !== undefined ? `${job.progress.queuePosition} request${job.progress.queuePosition === 1 ? '' : 's'} ahead` : '', stage: 0, active: true };
  if (job.status === 'running') return { label: status === 'IN_PROGRESS' ? 'Generating video or images' : status === 'COMPLETED' ? 'Retrieving result' : 'Checking provider status', detail: '', stage: 1, active: true };
  if (job.status === 'queued' || job.status === 'submitting') return { label: job.status === 'queued' ? 'Preparing request' : 'Sending request', detail: '', stage: 0, active: true };
  return { label: ({ ready: 'Ready to review', failed: 'Needs attention', uncertain: 'Submission needs checking', canceled: 'Canceled' } as const)[job.status], detail: '', stage: job.status === 'ready' ? 3 : -1, active: false };
}

export function downloadPercent(job: AssetJob) {
  const { downloadedBytes, totalBytes } = job.progress ?? {};
  return typeof downloadedBytes === 'number' && typeof totalBytes === 'number' && totalBytes > 0
    ? Math.min(100, Math.max(0, Math.floor(downloadedBytes / totalBytes * 100))) : undefined;
}
