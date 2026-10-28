import { isActiveJobStatus } from "@/lib/generation/jobs";
import type { GenerationJobSnapshot } from "@/lib/generation/jobs-client";

/**
 * The render job the export dialog reports on: the one this editor started, else a render
 * still running for the project (started by an agent or another window). A finished job is
 * never borrowed, so a new export reads "Starting" until its own job appears instead of the
 * previous export's "Completed".
 */
export function selectExportRenderJob(
  jobsById: Record<string, GenerationJobSnapshot>,
  renderJobId: string | null,
): GenerationJobSnapshot | null {
  if (renderJobId && jobsById[renderJobId]) return jobsById[renderJobId];
  return Object.values(jobsById).find((job) => job.targetType === "render" && isActiveJobStatus(job.status)) ?? null;
}
