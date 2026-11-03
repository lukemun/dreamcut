/** Send only synthetic diagnostics; never opens or reads an editing project. */
import * as Sentry from "@sentry/nextjs";
import { trace } from "@opentelemetry/api";
import { sentryOptions } from "../src/lib/observability/sentry-options";

async function main() {
  if (process.env.SENTRY_ENABLED !== "1" || !process.env.SENTRY_DSN)
    throw new Error("Set SENTRY_ENABLED=1 and SENTRY_DSN in the local environment first.");
  Sentry.init({ ...sentryOptions(process.env.SENTRY_DSN, "1", "verification", "1"),
    transport: (options) => {
      const transport = Sentry.makeNodeTransport(options);
      return { ...transport, send: async (envelope) => {
        const response = await transport.send(envelope);
        console.log(JSON.stringify({ ingestionStatus: response.statusCode }));
        return response;
      } };
    },
  });
  let traceId = "";
  let eventId = "";
  await trace.getTracer("dreamcut").startActiveSpan("diagnostics.verify", async (span) => {
    traceId = span.spanContext().traceId;
    if (/^0+$/.test(traceId)) throw new Error("OpenTelemetry provider was not registered.");
    eventId = Sentry.captureException(new Error("DreamCut telemetry verification — synthetic test"), {
      tags: { "diagnostics.synthetic": "true" },
    });
    Sentry.logger.info("DreamCut telemetry verification", { "diagnostics.synthetic": true });
    span.end();
  });
  const flushed = await Sentry.flush(15_000);
  if (!flushed) throw new Error("Telemetry flush timed out. Check connectivity and the destination.");
  console.log(JSON.stringify({ eventId, traceId, flushed, note: "Confirm receipt in Sentry; flush alone is not backend proof." }));
  await Sentry.close(2_000);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
