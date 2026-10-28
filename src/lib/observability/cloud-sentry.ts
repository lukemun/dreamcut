import * as Sentry from "@sentry/nextjs";
import type { BrowserOptions } from "@sentry/nextjs";

import type { CloudTelemetry } from "./cloud-telemetry";
import { sentryOptions } from "./sentry-options";

/** The Sentry options for a signed-in editor's cloud settings (see cloud-telemetry.ts). `build` is the runtime's
 * capture policy (the desktop service reconstructs its errors). */
export function cloudSentryOptions(sentry: NonNullable<CloudTelemetry["sentry"]>, build: typeof sentryOptions = sentryOptions): BrowserOptions {
  const options = build(sentry.dsn, "1", sentry.environment, sentry.traces_sample_rate?.toString());
  return { ...options, ...(sentry.error_sample_rate === undefined ? {} : { sampleRate: sentry.error_sample_rate }), initialScope: { tags: { install_id: sentry.install_id } } };
}

let started: string | null = null;

/**
 * Starts or stops the Sentry client that follows the account: started with the cloud settings while signed in,
 * closed on sign-out. A client this checkout configured itself is never touched. `init` starts the runtime's
 * client from the settings (the browser adds session replay; the server picks its capture policy).
 */
export async function followCloudSentry(
  telemetry: CloudTelemetry,
  init: (sentry: NonNullable<CloudTelemetry["sentry"]>) => void,
  stop: () => Promise<void> = async () => { await Sentry.close(2000); Sentry.getCurrentScope().setClient(undefined); },
): Promise<boolean> {
  const key = telemetry.sentry ? JSON.stringify(telemetry.sentry) : null;
  if (key === started) return false;
  if (started === null && Sentry.getClient()) return false;
  if (started !== null) { await stop(); started = null; }
  if (telemetry.sentry) { init(telemetry.sentry); started = key; }
  return true;
}
