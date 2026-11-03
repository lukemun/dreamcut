import path from 'node:path';
// Finder does not inherit a developer shell's PATH. Keep explicit absolute
// entries first, then the conventional macOS tool locations. Never invoke a shell.
export function desktopRuntimeEnvironment(env, { mediaToolsDirectory } = {}) {
  const directories = [...(mediaToolsDirectory ? [path.resolve(mediaToolsDirectory)] : []), ...(env.PATH || '').split(path.delimiter),
    ...(env.HOME && path.isAbsolute(env.HOME) ? [path.join(env.HOME, '.local/bin')] : []),
    ...(process.platform === 'win32' ? [] : ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'])];
  return { ...env, PATH: [...new Set(directories.filter(item => path.isAbsolute(item)))].join(path.delimiter) };
}
