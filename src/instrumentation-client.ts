import * as Sentry from "@sentry/nextjs";
import { refreshCloudSentry } from "./lib/observability/cloud-sentry-client";
import { REPLAY_PRIVACY, publicSentryConfigured, sentryOptions } from "./lib/observability/sentry-options";

type Integration = Parameters<typeof Sentry.addIntegration>[0];

if (publicSentryConfigured()) {
  const options = sentryOptions(process.env.NEXT_PUBLIC_SENTRY_DSN, process.env.NEXT_PUBLIC_SENTRY_ENABLED, process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT, process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE);
  const keep = options.integrations as (defaults: Integration[]) => Integration[];
  Sentry.init({ ...options, integrations: defaults => [...keep(defaults), Sentry.replayIntegration(REPLAY_PRIVACY)] });
} else {
  // Without its own DSN, the editor reports only while signed in to DreamCut, with the account's settings.
  void refreshCloudSentry();
}
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
