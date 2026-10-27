export type GenerationJobStatus =
  | "pending"
  | "queued_local"
  | "dispatching"
  | "submitted"
  | "processing"
  | "completed"
  | "failed"
  | "canceled";

/** Whether the job is in any non-terminal state (pending through processing). */
export function isActiveJobStatus(status: string | null | undefined) {
  return status === "pending"
    || status === "queued_local"
    || status === "dispatching"
    || status === "submitted"
    || status === "processing";
}
