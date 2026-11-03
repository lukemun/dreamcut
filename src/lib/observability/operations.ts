import { trace, SpanStatusCode } from "@opentelemetry/api";
import * as Sentry from "@sentry/nextjs";

/** Names are static operation labels; never pass project names, paths or text. */
export async function traceOperation<T>(name: string, action: () => Promise<T>): Promise<T> {
  return trace.getTracer("dreamcut").startActiveSpan(name, async (span) => {
    try {
      const result = await action();
      span.setStatus({ code: SpanStatusCode.OK });
      Sentry.logger.info("Operation completed", { operation: name });
      return result;
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR });
      Sentry.captureException(error, { tags: { operation: name } });
      Sentry.logger.error("Operation failed", { operation: name });
      throw error;
    } finally { span.end(); }
  });
}
