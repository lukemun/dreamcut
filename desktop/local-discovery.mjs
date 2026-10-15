import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';
import { readEnv } from '../mcp/env-name.mjs';

export function llamaServerCandidates(env, home) {
  const override = readEnv("LLAMA_SERVER", env)?.trim();
  if (override && path.isAbsolute(override)) return [override];
  const dirs = [...(env.PATH || '').split(path.delimiter), '/opt/homebrew/bin', '/usr/local/bin', path.join(home, '.local/bin')];
  return [...new Set(dirs.filter(dir => path.isAbsolute(dir)).map(dir => path.join(dir, 'llama-server')))];
}

/**
 * The local agent is available when a llama-server binary exists and at least one qualified
 * model is fully downloaded. Nothing is started or loaded here; serving happens on first use.
 */
export async function discoverLocal({ env = process.env, home = os.homedir(), harnessRoot, executable = file => fs.access(file, constants.X_OK) } = {}) {
  let binary;
  for (const candidate of llamaServerCandidates(env, home)) {
    try { await executable(candidate); binary = candidate; break; } catch { /* Next candidate. */ }
  }
  if (!binary) return { state: 'unavailable', models: [] };
  const { installedLocalModels } = await import(pathToFileURL(path.join(harnessRoot, 'mcp/local-model-suite.mjs')).href);
  const models = installedLocalModels(readEnv("LOCAL_MODEL_ROOT", env) ? { modelRoot: readEnv("LOCAL_MODEL_ROOT", env) } : {});
  return models.length ? { state: 'available', executable: binary, models } : { state: 'unavailable', models: [] };
}
