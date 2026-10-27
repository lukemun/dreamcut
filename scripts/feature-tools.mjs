/**
 * Where an installed DreamCut keeps the programs its features use, and the pinned versions it installs there
 * (scripts/setup-features.mjs). FFmpeg, whisper.cpp, uv, Python with NumPy, and Montreal Forced Aligner come
 * from conda-forge through a pinned micromamba, so DreamCut never redistributes them. The editor and MCP
 * server add these folders to the end of PATH (runtimeEnvDefaults in mcp/editor-runtime.mjs), behind the
 * FFmpeg the runtime ships (media-tools/, packaging/build-ffmpeg.mjs) and the system's own programs:
 * conda-forge's FFmpeg lacks vid.stab, so it is only the fallback where no FFmpeg ships. Python and MFA are named
 * explicitly (DREAMCUT_PYTHON, MFA_BIN), so macOS's bare python3 stub never stands in for them.
 *
 * The folder is in the user cache, not app data: conda environments break under a path with a space
 * ("Application Support"). A cleared cache is reinstalled the next time DreamCut starts.
 */
import os from 'node:os';
import path from 'node:path';

export const MICROMAMBA = {
  version: '2.9.0-0',
  assets: {
    'darwin-arm64': { file: 'micromamba-osx-arm64', sha256: 'ec2a072f028e1a7cf20f3e2e74d5a8127cf5a5f27636375b5359811565f4e5be' },
    'darwin-x64': { file: 'micromamba-osx-64', sha256: '1e71054bb3ac9a076e21f7ec48acfef536f9b3f1408f371a942784bf5ef83d8a' },
    'win32-x64': { file: 'micromamba-win-64', sha256: 'a6d804394b2418991c4e29562853eaace2f2ce9d9da661a98e74e02e8dbb44b0' },
  },
};
export const micromambaUrl = asset => `https://github.com/mamba-org/micromamba-releases/releases/download/${MICROMAMBA.version}/${asset.file}`;

/** Each conda environment and the packages it holds; a changed list rebuilds that environment. */
export const ENVIRONMENTS = {
  tools: ['ffmpeg=9.0.2=gpl*', 'whisper.cpp=1.9.3', 'uv=0.13.5', 'python=3.12', 'numpy=2.5'],
  mfa: ['montreal-forced-aligner=3.4.1', 'python=3.12'],
};

export function featureToolsDir(platform = process.platform, env = process.env, home = os.homedir()) {
  if (env.DREAMCUT_TOOLS_DIR?.trim()) return path.resolve(env.DREAMCUT_TOOLS_DIR.trim());
  if (platform === 'darwin') return path.join(home, 'Library', 'Caches', 'DreamCut', 'tools');
  if (platform === 'win32') return path.join(env.LOCALAPPDATA ?? path.join(home, 'AppData', 'Local'), 'DreamCut', 'Cache', 'tools');
  return path.join(env.XDG_CACHE_HOME ?? path.join(home, '.cache'), 'dreamcut', 'tools');
}

/** The folders that hold an environment's programs (conda on Windows splits them three ways). */
export function environmentBinDirs(prefix, platform = process.platform) {
  return platform === 'win32'
    ? [prefix, path.join(prefix, 'Library', 'bin'), path.join(prefix, 'Scripts')]
    : [path.join(prefix, 'bin')];
}

export function featureToolPaths(platform = process.platform, env = process.env, home = os.homedir()) {
  const dir = featureToolsDir(platform, env, home);
  const tools = path.join(dir, 'envs', 'tools');
  const mfa = path.join(dir, 'envs', 'mfa');
  return {
    dir,
    micromamba: path.join(dir, platform === 'win32' ? 'micromamba.exe' : 'micromamba'),
    environment: name => path.join(dir, 'envs', name),
    pathDirs: environmentBinDirs(tools, platform),
    mfaBin: platform === 'win32' ? path.join(mfa, 'Scripts', 'mfa.exe') : path.join(mfa, 'bin', 'mfa'),
    program: (name, environment = 'tools') => {
      const prefix = path.join(dir, 'envs', environment);
      if (platform !== 'win32') return path.join(prefix, 'bin', name);
      return name === 'python' ? path.join(prefix, 'python.exe') : path.join(prefix, 'Library', 'bin', `${name}.exe`);
    },
    state: path.join(dir, 'setup-state.json'),
  };
}

/**
 * The PATH, DREAMCUT_PYTHON and MFA_BIN an installed DreamCut runs with: the system's programs, then its own.
 * The folders are added before they exist, so programs a background setup installs later resolve without a restart.
 */
export function featureToolEnv(env = process.env, platform = process.platform, home = os.homedir()) {
  const paths = featureToolPaths(platform, env, home);
  const key = platform === 'win32' ? Object.keys(env).find(name => name.toUpperCase() === 'PATH') ?? 'Path' : 'PATH';
  const current = (env[key] ?? '').split(path.delimiter).filter(Boolean);
  const added = paths.pathDirs.filter(dir => !current.includes(dir));
  return {
    ...(added.length ? { [key]: [...current, ...added].join(path.delimiter) } : {}),
    ...(!env.MFA_BIN ? { MFA_BIN: paths.mfaBin } : {}),
    ...(!env.DREAMCUT_PYTHON ? { DREAMCUT_PYTHON: paths.program('python') } : {}),
  };
}
