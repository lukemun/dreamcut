import fs from 'node:fs';

/** Public error-report settings every release ships with (packaging/release-telemetry.json), never the
 * builder's own environment. Browser values are compiled in; the server falls back to them when it runs. */
export function releaseTelemetry(file = new URL('../packaging/release-telemetry.json', import.meta.url)) {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    return typeof value.sentry_dsn === 'string' && /^https:\/\/[0-9a-f]+@[\w.-]+\/\d+$/.test(value.sentry_dsn) ? value : null;
  } catch { return null; }
}

/** `sourceMaps` asks the build for source maps to upload; the upload token itself never enters the build. */
export function desktopBuildEnvironment(input, { telemetry = releaseTelemetry(), version, sourceMaps = false } = {}) {
  const env = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'SYSTEMROOT', 'SystemRoot', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT']) {
    if (input[key]) env[key] = input[key];
  }
  const sentry = telemetry ? {
    NEXT_PUBLIC_SENTRY_ENABLED: '1', NEXT_PUBLIC_SENTRY_DSN: telemetry.sentry_dsn,
    // `pnpm editor` builds from a checkout label their reports `local`, so they never mix with a release's.
    NEXT_PUBLIC_SENTRY_ENVIRONMENT: input.DREAMCUT_SENTRY_ENVIRONMENT || telemetry.environment || 'production',
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: String(telemetry.traces_sample_rate ?? '0.1'),
    ...(version ? { NEXT_PUBLIC_SENTRY_RELEASE: `dreamcut@${version}` } : {}),
  } : {};
  return { ...env, ...sentry, ...(sourceMaps ? { DREAMCUT_RELEASE_SOURCEMAPS: '1' } : {}), NODE_OPTIONS: '--max-old-space-size=8192',
    TIMELINE_NEXT_DIST_DIR: '.next-desktop', NEXT_TELEMETRY_DISABLED: '1' };
}
