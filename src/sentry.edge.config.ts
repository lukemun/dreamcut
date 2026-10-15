import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/observability/sentry-options";

if (process.env.SENTRY_ENABLED === "1" && process.env.SENTRY_DSN) {
  Sentry.init(sentryOptions(process.env.SENTRY_DSN, process.env.SENTRY_ENABLED, process.env.SENTRY_ENVIRONMENT, process.env.SENTRY_TRACES_SAMPLE_RATE));
}
