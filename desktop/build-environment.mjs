export function desktopBuildEnvironment(input) {
  const env = {};
  for (const key of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'SYSTEMROOT', 'SystemRoot', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'COMSPEC', 'PATHEXT']) {
    if (input[key]) env[key] = input[key];
  }
  return { ...env, NODE_OPTIONS: '--max-old-space-size=8192',
    TIMELINE_NEXT_DIST_DIR: '.next-desktop', NEXT_TELEMETRY_DISABLED: '1' };
}
