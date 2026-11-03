import * as Sentry from "@sentry/nextjs";

import { cloudSentryOptions, followCloudSentry } from "./cloud-sentry";
import { localSentryConfigured, readCloudTelemetry, syncCloudTelemetry, type CloudTelemetry } from "./cloud-telemetry";
import { desktopServiceSentryOptions, sentryOptions } from "./sentry-options";

/**
 * The scope every request's scope is forked from. Started from a route handler (sign-in, sign-out), the client
 * would otherwise belong to that request's copy only: later requests would never report, and a closed client
 * would stay where they look. The SDK keeps it as a per-version global (`getDefaultCurrentScope` in @sentry/core,
 * which @sentry/nextjs does not export); cloud-sentry-server.test.ts fails if that moves.
 */
export function defaultServerScope(): Sentry.Scope | undefined {
  const carrier = (globalThis as { __SENTRY__?: Record<string, { defaultCurrentScope?: Sentry.Scope }> }).__SENTRY__;
  return carrier?.[Sentry.SDK_VERSION]?.defaultCurrentScope;
}

function start(sentry: NonNullable<CloudTelemetry["sentry"]>) {
  const build = process.env.DREAMCUT_SERVICE_ROOT ? desktopServiceSentryOptions : sentryOptions;
  Sentry.init(cloudSentryOptions(sentry, build));
  defaultServerScope()?.setClient(Sentry.getClient());
}

async function stop() {
  const client = defaultServerScope()?.getClient() ?? Sentry.getClient();
  // Requests already running hold this client in their own scope; closing it stops them reporting too.
  await client?.close(2000);
  defaultServerScope()?.setClient(undefined);
  Sentry.getCurrentScope().setClient(undefined);
}

/** Starts, replaces or stops the server's account-following client. */
export const followServerCloudSentry = (telemetry: CloudTelemetry) => followCloudSentry(telemetry, start, stop);

let refreshing: Promise<CloudTelemetry> | null = null;

/** Brings the local server's Sentry in step with the account (see cloud-telemetry.ts) and returns the
 * settings the page should follow. A checkout with its own `.env.local` Sentry gets none. */
export function refreshServerCloudSentry(): Promise<CloudTelemetry> {
  if (localSentryConfigured()) return Promise.resolve({ sentry: null });
  // Calls run one after another, each reading the account afresh: a sign-out during a running refresh
  // is never answered with that refresh's earlier view of the account.
  const run = async () => {
    const telemetry = await syncCloudTelemetry();
    await followServerCloudSentry(telemetry);
    return telemetry;
  };
  const next: Promise<CloudTelemetry> = (refreshing ?? Promise.resolve()).catch(() => undefined).then(run)
    .finally(() => { if (refreshing === next) refreshing = null; });
  refreshing = next;
  return next;
}

/** What the page should follow now: the cached settings straight away, refreshed in the background. Only the
 * first read for an account (nothing cached yet) waits for DreamCut Cloud. */
export async function currentCloudTelemetry(): Promise<CloudTelemetry> {
  if (localSentryConfigured()) return { sentry: null };
  const cached = readCloudTelemetry();
  if (!cached.sentry) return refreshServerCloudSentry();
  void refreshServerCloudSentry().catch(error => console.error("[cloud-telemetry] not refreshed", error));
  return cached;
}
