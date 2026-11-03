import type { BrowserOptions } from "@sentry/nextjs";
import { scrubEvent, scrubTelemetry } from "./privacy";

/** A fifth of errors is enough to see what is failing and how often. Traces are for spotting
 * slow operations, so a tenth of them is enough in normal use; `pnpm dev` keeps all of them
 * because there is only one person to sample. */
export const ERROR_SAMPLE_RATE = 0.2;

export function defaultTraceSampleRate(nodeEnv = process.env.NODE_ENV) {
  return nodeEnv === "development" ? 1 : 0.1;
}

/** Whether this build sets its own browser Sentry (`.env.local`); otherwise the page follows the account. */
export function publicSentryConfigured() {
  return process.env.NEXT_PUBLIC_SENTRY_ENABLED === "1" && Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN);
}

export function sentryOptions(dsn: string | undefined, enabled: string | undefined, environment: string | undefined, traceRate?: string): BrowserOptions {
  const fallbackRate = defaultTraceSampleRate();
  const parsedRate = traceRate?.trim() ? Number(traceRate) : fallbackRate;
  return {
    dsn, enabled: enabled === "1" && !!dsn,
    environment: environment || "local",
    release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
    sampleRate: ERROR_SAMPLE_RATE,
    tracesSampleRate: Number.isFinite(parsedRate) ? Math.max(0, Math.min(1, parsedRate)) : fallbackRate,
    // Replay only buffers the last minute in memory; it is sent with a sampled error or a bug report.
    replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 1,
    enableLogs: true,
    sendDefaultPii: false,
    dataCollection: {
      userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
      genAI: { inputs: false, outputs: false }, graphQL: { document: false, variables: false },
      databaseQueryData: false, stackFrameVariables: false, frameContextLines: 0,
    },
    tracePropagationTargets: [/^\//, /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\//],
    // Attachments live beside the event in the SDK envelope; event scrubbing
    // alone cannot remove scoped attachments from errors or transactions.
    beforeSend: (event, hint) => { hint.attachments = []; return scrubEvent(event); },
    beforeSendTransaction: (event, hint) => { hint.attachments = []; return scrubEvent(event); },
    beforeSendSpan: (span) => scrubTelemetry(span),
    beforeSendLog: (log) => scrubTelemetry(log),
    beforeBreadcrumb: () => null,
    // Raw console arguments and source context aren't diagnostic-safe. The browser adds
    // replay itself (see REPLAY_PRIVACY); the server has no page to record.
    integrations: (defaults) => defaults.filter((integration) => ![
      "Console", "ConsoleLogs", "ContextLines", "LocalVariables", "Replay", "Breadcrumbs",
    ].includes(integration.name)),
  };
}

/** Session replay records the editor's layout and clicks, never its media: typed and editable
 * text is masked, and video, audio, canvas, images and iframes are recorded as empty boxes.
 * Mark anything else private with data-replay-mask (hide text) or data-replay-block (hide all). */
export const REPLAY_PRIVACY = {
  maskAllText: false, maskAllInputs: true, blockAllMedia: false,
  mask: ["[contenteditable]", "[data-replay-mask]"],
  block: ["video", "audio", "canvas", "img", "picture", "iframe", "object", "embed", "[data-replay-block]"],
  networkDetailAllowUrls: [],
};

/** Desktop service errors may contain arbitrary creator text. Reconstruct rather
 * than trying to recognize every secret, filename or piece of media metadata. */
export function desktopServiceSentryOptions(dsn: string | undefined, enabled: string | undefined, environment: string | undefined): BrowserOptions {
  return {
    ...sentryOptions(dsn, enabled, environment, "0"),
    enableLogs: false,
    beforeSendTransaction: (_event, hint) => { hint.attachments = []; return null; },
    beforeSendLog: () => null,
    beforeSend: (event, hint) => {
      hint.attachments = [];
      return {
        type: event.type, event_id: event.event_id, timestamp: event.timestamp,
        platform: "node", level: event.level === "fatal" ? "fatal" : "error",
        release: event.release, environment: event.environment,
        message: "DreamCut desktop service error",
        // The random install id (cloud-telemetry.ts) is the only tag kept: it matches a report to its account.
        tags: { component: "desktop-service", ...(typeof event.tags?.install_id === "string" && /^[0-9a-f-]{36}$/.test(event.tags.install_id) ? { install_id: event.tags.install_id } : {}) },
        exception: event.exception?.values?.length ? {
          values: event.exception.values.slice(0, 3).map(value => ({
            type: "DesktopServiceError", value: "Desktop service operation failed",
            stacktrace: value.stacktrace ? {
              frames: (value.stacktrace.frames ?? []).slice(-30).map(frame => ({
                filename: "[application-frame]",
                lineno: Number.isInteger(frame.lineno) ? frame.lineno : undefined,
                colno: Number.isInteger(frame.colno) ? frame.colno : undefined,
                in_app: frame.in_app === true,
              })),
            } : undefined,
          })),
        } : undefined,
      };
    },
  };
}
