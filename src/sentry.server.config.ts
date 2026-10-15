import * as Sentry from "@sentry/nextjs";
import { desktopServiceSentryOptions, sentryOptions } from "./lib/observability/sentry-options";

if (process.env.SENTRY_ENABLED === "1" && process.env.SENTRY_DSN) {
  // Sentry owns the OTel provider; do not register a second NodeSDK/provider.
  const options = process.env.DREAMCUT_SERVICE_ROOT ? desktopServiceSentryOptions : sentryOptions;
  Sentry.init(options(process.env.SENTRY_DSN, process.env.SENTRY_ENABLED, process.env.SENTRY_ENVIRONMENT, process.env.SENTRY_TRACES_SAMPLE_RATE));
}
