import { toast } from "sonner";
import * as Sentry from "@sentry/nextjs";

type ReportContext = Record<string, unknown>;

/**
 * Capture to the explicitly configured Sentry destination as well as the local
 * console and toast. Never attach arbitrary context to remote events. Returns the display message so callers
 * can pin it somewhere persistent (e.g. the editor's action-error banner).
 */
export function reportError(err: unknown, userMessage: string, context?: ReportContext): string {
  console.error("[timeline-editor]", userMessage, err, context ?? "");
  Sentry.captureException(err);
  Sentry.logger.error("Editor operation failed");
  const detail = err instanceof Error ? err.message : "";
  const display = detail ? `${userMessage}: ${detail}` : userMessage;
  toast.error(display);
  return display;
}

export function toastPromise<T>(
  promise: Promise<T>,
  messages: { loading: string; success: string; error: string },
  context?: ReportContext,
) {
  // Only failures surface as a toast; loading and success stay silent.
  void messages.loading; void messages.success;
  promise.catch((err: unknown) => {
    console.error("[timeline-editor]", messages.error, err, context ?? "");
    Sentry.captureException(err);
    Sentry.logger.error("Editor operation failed");
    toast.error(err instanceof Error ? err.message : messages.error);
  });
  return promise;
}
