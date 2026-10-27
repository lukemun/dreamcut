import * as Sentry from "@sentry/nextjs";
import { REPLAY_PRIVACY, sentryOptions } from "./lib/observability/sentry-options";

type Integration = Parameters<typeof Sentry.addIntegration>[0];

if (process.env.NEXT_PUBLIC_SENTRY_ENABLED === "1" && process.env.NEXT_PUBLIC_SENTRY_DSN) {
  const options = sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN, process.env.NEXT_PUBLIC_SENTRY_ENABLED, process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT, process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE);
  const keep = options.integrations as (defaults: Integration[]) => Integration[];
  Sentry.init({ ...options, integrations: defaults => [...keep(defaults), Sentry.replayIntegration(REPLAY_PRIVACY)] });
}
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
