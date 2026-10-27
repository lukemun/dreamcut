import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readEnv } from '../mcp/env-name.mjs';
const execute = promisify(execFile);

export function codexCandidates(env, home) {
  const override = readEnv("CODEX_EXECUTABLE", env)?.trim();
  if (override && path.isAbsolute(override)) return [override];
  if (override && override !== path.basename(override)) return [];
  const name = override || 'codex';
  const dirs = [...(env.PATH || '').split(path.delimiter), path.join(home, '.local/bin'), '/opt/homebrew/bin', '/usr/local/bin'];
  return [...new Set(dirs.filter(dir => path.isAbsolute(dir)).map(dir => path.join(dir, process.platform === 'win32' && !path.extname(name) ? `${name}.exe` : name)))];
}

// Only supported, non-inference CLI commands. Credential files, raw login output
// and account identifiers never cross this boundary.
export async function discoverCodex({ env = process.env, home = os.homedir(), run = execute,
  executable = file => fs.access(file, constants.X_OK) } = {}) {
  let found = false;
  for (const candidate of codexCandidates(env, home)) {
    try { await executable(candidate); } catch { continue; }
    found = true;
    const options = { env, timeout: 4000, maxBuffer: 16384, windowsHide: true };
    let version;
    try {
      const result = await run(candidate, ['--version'], options);
      version = /^codex-cli\s+(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)\s*$/m.exec(result.stdout)?.[1];
      if (!version) continue;
    } catch { continue; }
    let authentication = 'unknown';
    try {
      const result = await run(candidate, ['login', 'status'], options);
      const output = `${result.stdout || ''}\n${result.stderr || ''}`;
      if (/not logged in/i.test(output)) authentication = 'signed-out';
      else if (/logged in/i.test(output)) authentication = 'signed-in';
    } catch (error) {
      if (/not logged in/i.test(`${error.stdout || ''}\n${error.stderr || ''}`)) authentication = 'signed-out';
    }
    return { state: 'available', executable: candidate, version, authentication };
  }
  return { state: found ? 'unsupported' : 'not-found', authentication: 'unknown' };
}
