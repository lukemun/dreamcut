import { trace, SpanStatusCode } from "@opentelemetry/api";

/** No logging or content capture on the hot file-store path. */
export function traceSync<T>(operation: string, action: () => T): T {
  return trace.getTracer("dreamcut").startActiveSpan(operation, (span) => {
    try { return action(); }
    catch (error) { span.setStatus({ code: SpanStatusCode.ERROR }); throw error; }
    finally { span.end(); }
  });
}
