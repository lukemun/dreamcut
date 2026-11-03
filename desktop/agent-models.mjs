import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const CACHE_MS = 10 * 60_000;
const CREDENTIAL_ENV = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'];

/** Codex's own catalog (`codex debug models`): listed models only, best first. */
export function parseCodexModels(stdout) {
  const models = JSON.parse(stdout)?.models;
  if (!Array.isArray(models)) throw Error('Codex did not return a model list.');
  const listed = models.filter(item => item?.visibility === 'list' && typeof item.slug === 'string' && typeof item.display_name === 'string')
    .sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));
  return listed.map((item, index) => ({ model: item.slug, label: item.display_name, isDefault: index === 0 }));
}

/**
 * Model choices for the agent picker without opening a conversation, so a window can
 * offer models without taking the project's chat lease. Claude Code reports its models
 * at initialization, before any message or inference; Codex lists them from its CLI.
 * Results are cached per process. The live session's own list stays authoritative.
 */
export function createAgentModels({ run = execute, sdk, cacheMs = CACHE_MS, now = Date.now } = {}) {
  const cache = new Map();
  const load = async (provider, { executable, env }) => {
    if (provider === 'codex') {
      if (!executable) throw Error('Codex is not installed.');
      const { stdout } = await run(executable, ['debug', 'models'], { env, timeout: 15000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
      return parseCodexModels(stdout);
    }
    if (provider !== 'claude') throw Error('Unsupported editing agent.');
    sdk ??= await import('@anthropic-ai/claude-agent-sdk');
    const agentEnv = { ...env };
    for (const name of CREDENTIAL_ENV) delete agentEnv[name];
    const abort = new AbortController();
    // A prompt stream that never yields: initialization only, no conversation.
    const idle = { async *[Symbol.asyncIterator]() { await new Promise(resolve => abort.signal.addEventListener('abort', resolve)); } };
    const query = sdk.query({ prompt: idle, options: { abortController: abort, cwd: os.tmpdir(), env: agentEnv,
      ...(executable ? { pathToClaudeCodeExecutable: executable } : {}), tools: [], settingSources: [], strictMcpConfig: true, mcpServers: {},
      canUseTool: async () => ({ behavior: 'deny', message: 'Listing models only.' }), stderr: () => {} } });
    let timer;
    try {
      const init = await Promise.race([query.initializationResult(),
        new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Claude Code did not start in time.')), 30000); })]);
      const models = (init.models ?? []).filter(item => typeof item?.value === 'string' && typeof item.displayName === 'string')
        .map(item => ({ model: item.value, label: item.displayName, isDefault: item.value === 'default' }));
      if (!models.length) throw Error('No Claude models are available.');
      return models;
    } finally {
      clearTimeout(timer); abort.abort();
      try { query.close?.(); } catch { /* Already stopped. */ }
    }
  };
  return {
    async list(provider, agent) {
      const hit = cache.get(provider);
      if (hit && now() - hit.at < cacheMs) return hit.models;
      // Concurrent windows share one lookup.
      const pending = hit?.pending ?? load(provider, agent);
      cache.set(provider, { ...hit, pending });
      try { const models = await pending; cache.set(provider, { models, at: now() }); return models; }
      catch (error) { cache.delete(provider); throw error; }
    },
  };
}
