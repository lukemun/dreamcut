import fs from 'node:fs/promises';
import { constants, readFileSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { readEnv } from '../mcp/env-name.mjs';
const execute = promisify(execFile);
// The Agent SDK ships Claude Code as a per-platform optional package (~220 MB). Packaged
// DreamCut builds currently omit it, so they require an installed Claude Code.
// Returns the bundled Claude Code version when known, true when present but unversioned.
// The platform package is the SDK's own dependency, so resolve it from the SDK (strict
// installs such as pnpm do not expose it to DreamCut's modules directly).
const bundledAvailable = () => {
  let sdkEntry;
  try {
    sdkEntry = createRequire(import.meta.url).resolve('@anthropic-ai/claude-agent-sdk');
    createRequire(sdkEntry).resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/package.json`);
  } catch { return false; }
  try {
    const sdk = JSON.parse(readFileSync(path.join(path.dirname(sdkEntry), 'package.json'), 'utf8'));
    return typeof sdk.claudeCodeVersion === 'string' ? sdk.claudeCodeVersion : true;
  } catch { return true; }
};

const versionParts = version => /^(\d+)\.(\d+)\.(\d+)/.exec(version)?.slice(1).map(Number);
export function isNewerVersion(candidate, current) {
  const a = versionParts(candidate), b = versionParts(current);
  if (!a || !b) return false;
  for (let index = 0; index < 3; index++) if (a[index] !== b[index]) return a[index] > b[index];
  return false;
}

export function claudeCandidates(env, home) {
  const override = readEnv("CLAUDE_EXECUTABLE", env)?.trim();
  if (override && path.isAbsolute(override)) return [override];
  if (override && override !== path.basename(override)) return [];
  const name = override || 'claude';
  const dirs = [...(env.PATH || '').split(path.delimiter), path.join(home, '.local/bin'), path.join(home, '.claude/local'), '/opt/homebrew/bin', '/usr/local/bin'];
  return [...new Set(dirs.filter(dir => path.isAbsolute(dir)).map(dir => path.join(dir, process.platform === 'win32' && !path.extname(name) ? `${name}.exe` : name)))];
}

// Installed Claude Code is preferred so the agent matches the version the creator
// updates and signs in with, unless the Agent SDK's bundled copy is newer: a stale
// install would otherwise pin older models (its "Default" can trail the current one).
// An explicit executable override always wins. Without an install, the bundled copy
// runs. Both use the same keychain sign-in. Only non-inference commands run here;
// credentials, account identifiers and raw output never cross this boundary.
export async function discoverClaude({ env = process.env, home = os.homedir(), run = execute,
  executable = file => fs.access(file, constants.X_OK), bundled = bundledAvailable } = {}) {
  for (const candidate of claudeCandidates(env, home)) {
    try { await executable(candidate); } catch { continue; }
    const options = { env, timeout: 6000, maxBuffer: 16384, windowsHide: true };
    let version;
    try {
      const result = await run(candidate, ['--version'], options);
      version = /^(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)\s+\(Claude Code\)\s*$/m.exec(result.stdout)?.[1];
      if (!version) continue;
    } catch { continue; }
    let authentication = 'unknown';
    let stdout;
    try { stdout = (await run(candidate, ['auth', 'status'], options)).stdout; }
    catch (error) { stdout = error.stdout; } // Signed-out status may exit non-zero.
    try {
      const status = JSON.parse(stdout);
      if (status?.loggedIn === true) authentication = 'signed-in';
      else if (status?.loggedIn === false) authentication = 'signed-out';
    } catch { /* Older CLIs: the session reports authentication on first use. */ }
    const packaged = readEnv("CLAUDE_EXECUTABLE", env)?.trim() ? false : bundled();
    if (typeof packaged === 'string' && isNewerVersion(packaged, version)) return { state: 'available', source: 'bundled', version: packaged, authentication };
    return { state: 'available', source: 'installed', executable: candidate, version, authentication };
  }
  return bundled() ? { state: 'available', source: 'bundled', authentication: 'unknown' } : { state: 'not-found', authentication: 'unknown' };
}
