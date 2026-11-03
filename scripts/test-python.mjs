import { spawnSync } from 'node:child_process';
import { runtimeEnvDefaults } from '../mcp/editor-runtime.mjs';

/** Test prerequisites use the editor's configured runtime; never install or skip. */
export function testPythonEnv(env = process.env, probe = command =>
  spawnSync(command, ['-c', 'import numpy'], { env, stdio: 'pipe', timeout: 15000 }).status === 0) {
  const configured = env.DREAMCUT_PYTHON?.trim();
  const installed = runtimeEnvDefaults(undefined, env).DREAMCUT_PYTHON;
  const candidates = configured ? [configured] : [...new Set([installed, 'python3', 'python'].filter(Boolean))];
  for (const command of candidates) if (probe(command)) return { ...env, DREAMCUT_PYTHON: command };
  throw new Error('Audio tests require Python with NumPy. Set DREAMCUT_PYTHON to an existing compatible interpreter in your environment or ignored .env.test.local, then rerun pnpm test. A configured interpreter is never silently replaced; no packages were installed and no tests were skipped.');
}
