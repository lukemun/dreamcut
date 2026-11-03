import { createRequire } from 'node:module';
const Sentry = createRequire(import.meta.url)('@sentry/electron/main');
import { desktopTelemetryOptions } from './telemetry-policy.mjs';
let active = false;
export function initializeDesktopTelemetry(env, release) {
  const options = desktopTelemetryOptions(env, release);
  active = options.enabled;
  if (!active) return;
  Sentry.init({ ...options, integrations: [Sentry.onUncaughtExceptionIntegration(), Sentry.onUnhandledRejectionIntegration()] });
}
export function reportDesktopFailure(operation) {
  if (active) Sentry.captureException(new Error('Desktop operation failed'), { tags: { operation } });
}
export async function flushDesktopTelemetry() {
  if (active) await Sentry.flush(1500);
}
