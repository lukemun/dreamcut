import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/observability/sentry-options";

// A checkout sets the server values in .env.local; a release has only the public values compiled in at build.
const enabled = process.env.SENTRY_ENABLED ?? process.env.NEXT_PUBLIC_SENTRY_ENABLED;
const dsn = process.env.SENTRY_DSN ?? process.env.NEXT_PUBLIC_SENTRY_DSN;
const environment = process.env.SENTRY_ENVIRONMENT ?? process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT;
const traces = process.env.SENTRY_TRACES_SAMPLE_RATE ?? process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE;

if (enabled === "1" && dsn) {
  Sentry.init(sentryOptions(dsn, enabled, environment, traces));
}
