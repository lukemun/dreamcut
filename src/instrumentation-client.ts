import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./lib/observability/sentry-options";

if (process.env.NEXT_PUBLIC_SENTRY_ENABLED === "1" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init(sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN, process.env.NEXT_PUBLIC_SENTRY_ENABLED, process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT, process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE));
}
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
