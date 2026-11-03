import path from 'node:path';

/** A dedicated export runtime must not depend on a creator's personal browser profile. */
export function renderBrowserOptions(env = process.env) {
  const executablePath = (env.DREAMCUT_RENDER_BROWSER_EXECUTABLE ?? '').trim();
  if (!executablePath) return { channel: 'chrome' };
  if (!path.isAbsolute(executablePath)) {
    throw new Error('DREAMCUT_RENDER_BROWSER_EXECUTABLE must be an absolute browser executable path.');
  }
  return { executablePath };
}
