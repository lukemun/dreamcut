import { asObject } from "@/lib/utils";

export type GenerationJobStatus =
  | "pending"
  | "queued_local"
  | "dispatching"
  | "submitted"
  | "processing"
  | "completed"
  | "failed"
  | "canceled";

export function isInFlightGenerationJobStatus(status: string | null | undefined) {
  return status === "pending"
    || status === "queued_local"
    || status === "dispatching"
    || status === "submitted"
    || status === "processing";
}

export function isProviderActiveGenerationJobStatus(status: string | null | undefined) {
  return status === "dispatching" || status === "submitted" || status === "processing";
}

export function isTerminalGenerationJobStatus(status: string | null | undefined) {
  return status === "completed" || status === "failed" || status === "canceled";
}

/** Whether the job is in any non-terminal state (pending through processing). Alias for isInFlightGenerationJobStatus. */
export const isActiveJobStatus = isInFlightGenerationJobStatus;

/** Whether the job is queued but not yet actively processing at the provider. */
export function isQueuedJobStatus(status: string | null | undefined) {
  return status === "pending"
    || status === "queued_local"
    || status === "dispatching"
    || status === "submitted";
}

export function mapFalQueueStatusToGenerationJobStatus(status: string | null | undefined): GenerationJobStatus {
  const normalized = String(status ?? "").trim().toUpperCase();

  if (normalized === "COMPLETED" || normalized === "SUCCESS" || normalized === "SUCCEEDED") {
    return "completed";
  }

  if (normalized === "FAILED" || normalized === "ERROR") {
    return "failed";
  }

  if (normalized === "CANCELED" || normalized === "CANCELLED") {
    return "canceled";
  }

  if (normalized === "IN_PROGRESS" || normalized === "PROCESSING" || normalized === "RUNNING") {
    return "processing";
  }

  if (normalized === "IN_QUEUE" || normalized === "QUEUED" || normalized === "SUBMITTED" || normalized === "PENDING") {
    return "submitted";
  }

  return "submitted";
}

export function normalizeGenerationJobOutputUrls(outputMetadata: unknown, outputUrl: string | null): string[] {
  const metadata = outputMetadata && typeof outputMetadata === "object"
    ? (outputMetadata as Record<string, unknown>)
    : null;

  const fromMetadata = Array.isArray(metadata?.image_urls)
    ? metadata.image_urls
      .map((url) => (typeof url === "string" ? url.trim() : ""))
      .filter(Boolean)
    : [];

  if (fromMetadata.length > 0) {
    return fromMetadata;
  }

  return outputUrl ? [outputUrl] : [];
}

export function isFinalizingGenerationJobStatus(
  status: string | null | undefined,
  outputMetadata?: unknown,
) {
  if (status !== "processing") return false;
  const metadata = asObject(outputMetadata);
  return typeof metadata.result_fetch_first_failed_at === "string";
}

export function generationJobStatusLabel(status: string | null | undefined) {
  switch (status) {
    case "queued_local":
      return "Queued";
    case "dispatching":
      return "Starting";
    case "submitted":
      return "Queued at provider";
    case "processing":
      return "Generating";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    case "pending":
      return "Queued";
    default:
      return "Queued";
  }
}

export function generationJobStatusLabelWithMetadata(
  status: string | null | undefined,
  outputMetadata?: unknown,
) {
  if (isFinalizingGenerationJobStatus(status, outputMetadata)) {
    return "Finalizing result";
  }

  switch (status) {
    case "queued_local":
      return "Queued";
    case "dispatching":
      return "Starting";
    case "submitted":
      return "Queued at provider";
    case "processing":
      return "Generating";
    case "completed":
      return "Completed";
    case "failed":
      return "Failed";
    case "canceled":
      return "Canceled";
    case "pending":
      return "Queued";
    default:
      return "Queued";
  }
}
