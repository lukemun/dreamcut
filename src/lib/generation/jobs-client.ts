import type { GenerationJobStatus } from "@/lib/generation/jobs";

export type GenerationJobSnapshot = {
  id: string;
  status: GenerationJobStatus;
  statusLabel?: string;
  /** 0–1 for jobs that report it (exports). */
  progress?: number;
  targetType?: string | null;
  targetId?: string | null;
  projectId?: string | null;
  scopeType?: string | null;
  scopeId?: string | null;
  outputUrl?: string | null;
  imageUrls?: string[];
  error?: string | null;
};

export type GenerationJobListItem = {
  id: string;
  status: GenerationJobStatus;
  statusLabel?: string;
  /** 0–1 for jobs that report it (exports). */
  progress?: number;
  targetType: string;
  targetId: string | null;
  outputUrl?: string | null;
  error?: string | null;
  createdAt?: string;
  projectId?: string | null;
  scopeType?: string | null;
  scopeId?: string | null;
};

export type GenerationJobsListResponse = {
  jobs?: GenerationJobListItem[];
  error?: string;
};

export type GenerationJobGetResponse = {
  ok?: boolean;
  job?: GenerationJobSnapshot;
  error?: string;
};

export async function listGenerationJobs(input: {
  projectId?: string;
  designCanvasId?: string;
  activeOnly?: boolean;
  targetType?: string;
  signal?: AbortSignal;
}) {
  const params = new URLSearchParams();
  if (input.projectId) params.set("projectId", input.projectId);
  if (input.designCanvasId) params.set("designCanvasId", input.designCanvasId);
  if (input.activeOnly) params.set("active", "1");
  if (input.targetType) params.set("targetType", input.targetType);

  const response = await fetch(`/api/generation-jobs?${params.toString()}`, {
    signal: input.signal,
  });
  const body = (await response.json()) as GenerationJobsListResponse;

  if (!response.ok) {
    throw new Error(body.error ?? "Failed to list generation jobs");
  }

  return body;
}

export async function getGenerationJob(jobId: string, signal?: AbortSignal) {
  const response = await fetch(`/api/generation-jobs/${jobId}`, { signal });
  const body = (await response.json()) as GenerationJobGetResponse;

  if (!response.ok) {
    throw new Error(body.error ?? "Failed to fetch generation job");
  }

  return body;
}
