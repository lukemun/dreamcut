const frameFiles = new Set(['main.mjs', 'service.mjs', 'telemetry.mjs', 'service-policy.mjs']);
const operations = new Set(['startup', 'service-start', 'service-exit', 'window-load', 'renderer-exit', 'unhandled']);
export function desktopTelemetryOptions(env, release) {
  return {
    enabled: env.SENTRY_ENABLED === '1' && Boolean(env.SENTRY_DSN), dsn: env.SENTRY_DSN,
    release, environment: env.SENTRY_ENVIRONMENT || 'desktop-local',
    sendDefaultPii: false, enableLogs: false, tracesSampleRate: 0, traceLifecycle: 'static',
    defaultIntegrations: false, attachScreenshot: false, autoSessionTracking: false,
    dataCollection: { userInfo: false, cookies: false, httpHeaders: false, httpBodies: [], urlQueryParams: false,
      genAI: { inputs: false, outputs: false }, databaseQueryData: false, stackFrameVariables: false, frameContextLines: 0 },
    beforeBreadcrumb: () => null,
    beforeSend: (event, hint) => {
      // Attachments are envelope items, outside the reconstructed event. A scope
      // can add them even with screenshot/native-dump integrations disabled.
      if (hint) hint.attachments = [];
      return sanitizeDesktopEvent(event);
    },
    beforeSendTransaction: () => null,
  };
}
// Reconstruct rather than recursively redact arbitrary SDK/application context.
// Native dumps, screenshots and attachments are disabled separately at collection.
export function sanitizeDesktopEvent(event) {
  const operation = operations.has(event.tags?.operation) ? event.tags.operation : 'unhandled';
  const result = {
    event_id: event.event_id, timestamp: event.timestamp, platform: 'node',
    level: event.level === 'fatal' ? 'fatal' : 'error',
    release: event.release, environment: event.environment,
    tags: { component: 'desktop', operation },
    message: `DreamCut desktop ${operation} failed`,
  };
  if (event.exception?.values?.length) result.exception = { values: event.exception.values.slice(0, 3).map(value => ({
    type: 'DesktopError', value: `Desktop ${operation} failed`,
    stacktrace: value.stacktrace ? { frames: (value.stacktrace.frames ?? []).slice(-30).map(frame => ({
      filename: frameFiles.has(frame.filename?.split(/[\\/]/).pop()) ? frame.filename.split(/[\\/]/).pop() : '[application-frame]',
      lineno: Number.isInteger(frame.lineno) ? frame.lineno : undefined,
      colno: Number.isInteger(frame.colno) ? frame.colno : undefined,
      in_app: frame.in_app === true,
    })) } : undefined,
  })) };
  return result;
}
