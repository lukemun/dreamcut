import * as Sentry from "@sentry/nextjs";

import { cloudSentryOptions, followCloudSentry } from "./cloud-sentry";
import type { CloudTelemetry } from "./cloud-telemetry";
import { REPLAY_PRIVACY, publicSentryConfigured } from "./sentry-options";

type Integration = Parameters<typeof Sentry.addIntegration>[0];
/** Fired when the page's Sentry client starts or stops, so the bug report button can follow it. */
export const SENTRY_CHANGED_EVENT = "dreamcut:sentry-changed";

// Session replay supports one instance per page, so a later sign-in on the same page goes without it.
let replayAdded = false;

/** Starts the page's Sentry while signed in to DreamCut and stops it on sign-out (see cloud-telemetry.ts). */
export async function refreshCloudSentry() {
  if (publicSentryConfigured()) return;
  let telemetry: CloudTelemetry = { sentry: null };
  try {
    const response = await fetch("/api/user/telemetry", { cache: "no-store" });
    if (response.ok) telemetry = await response.json();
  } catch { /* the editor's own server is unreachable; leave Sentry as it is */ return; }
  const changed = await followCloudSentry(telemetry, sentry => {
    const options = cloudSentryOptions(sentry);
    const keep = options.integrations as (defaults: Integration[]) => Integration[];
    const replay = !replayAdded;
    replayAdded = true;
    Sentry.init({ ...options, integrations: defaults => [...keep(defaults), ...(replay ? [Sentry.replayIntegration(REPLAY_PRIVACY)] : [])] });
  });
  if (changed) window.dispatchEvent(new Event(SENTRY_CHANGED_EVENT));
}
