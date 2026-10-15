import path from "node:path";
import { pathToFileURL } from "node:url";
import { projectsRoot } from "@/lib/local-store/paths";
import { profileDir } from "@/lib/local-store/editing-memory";
import { readEnv } from "@/lib/env-name";

/**
 * Hosts the editing agent (Codex or Claude) for the browser editor on this local
 * server. It reuses the desktop chat controller and session owners unchanged, so
 * tool authority, journaling and proposal-only editing match the desktop app.
 * Inside the desktop app (which sets DREAMCUT_SERVICE_TOKEN) the window's IPC
 * bridge owns chat, and this host stays disabled.
 */
export type ChatEvent = { projectId: string; type: string; [key: string]: unknown };
type Controller = { call(action: string, payload?: unknown): Promise<unknown>; dispose(): Promise<void> };
type Agent = { executable?: string; authentication: string; models?: string[]; defaultModel?: string } | undefined;
type Host = { controller: Controller; listeners: Set<(event: ChatEvent) => void>; idle?: ReturnType<typeof setTimeout> };
type Login = { call(payload: unknown, executable?: string): Promise<{ status: string }>; dispose(): void };
type Models = { list(provider: string, agent: unknown): Promise<unknown> };
type State = { hosts: Map<string, Host>; agents: Record<"codex" | "claude" | "local", Agent>; discovered: number; discovering?: Promise<void>; login?: Login; models?: Models };

// Survives dev-server module reloads so an open conversation is not orphaned.
const store = globalThis as typeof globalThis & { __dreamcutBrowserChat?: State };
const state: State = store.__dreamcutBrowserChat ??= { hosts: new Map(), agents: { codex: undefined, claude: undefined, local: undefined }, discovered: 0 };
const DISCOVERY_TTL_MS = 15_000;
// A closed tab cannot reliably send Disconnect; release the session (and its project
// lease) once no page has listened for a minute.
const IDLE_CLOSE_MS = 60_000;
const ENV_KEYS = ["HOME", "PATH", "TMPDIR", "LANG", "LC_ALL", "USERPROFILE", "APPDATA", "LOCALAPPDATA", "SystemRoot", "SYSTEMROOT", "TEMP", "TMP", "PATHEXT", "COMSPEC"];

export const browserChatEnabled = () => !process.env.DREAMCUT_SERVICE_TOKEN;

// Desktop owners are plain Node modules with runtime-resolved dependencies (the
// Agent SDK locates its native binary relative to itself), so load them unbundled.
const load = (file: string) => import(/* webpackIgnore: true */ pathToFileURL(path.join(process.cwd(), file)).href);

/** Re-discovered at most every 15 s so a new sign-in shows up without a restart. */
async function refreshAgents() {
  if (Date.now() - state.discovered < DISCOVERY_TTL_MS) return;
  state.discovering ??= (async () => {
    const [{ discoverCodex }, { discoverClaude }, { discoverLocal }] = await Promise.all([load("desktop/codex-discovery.mjs"), load("desktop/claude-discovery.mjs"), load("desktop/local-discovery.mjs")]);
    const [codex, claude, local] = await Promise.all([discoverCodex({ env: process.env }), discoverClaude({ env: process.env }),
      discoverLocal({ env: process.env, harnessRoot: process.cwd() }).catch(() => ({ state: "unavailable", models: [] }))]);
    // Mutated in place: controllers hold this object and read the current state.
    state.agents.codex = codex.state === "available" ? { executable: codex.executable, authentication: codex.authentication } : undefined;
    state.agents.claude = claude.state === "available" ? { executable: claude.executable, authentication: claude.authentication } : undefined;
    state.agents.local = local.state === "available" ? { executable: local.executable, authentication: "signed-in", models: local.models, defaultModel: readEnv("LOCAL_DEFAULT_MODEL") || undefined } : undefined;
    state.discovered = Date.now();
  })().finally(() => { state.discovering = undefined; });
  await state.discovering;
}

const agentEnv = () => Object.fromEntries(ENV_KEYS.filter(key => process.env[key]).map(key => [key, process.env[key] as string]));

/** Browser conversations use their own records, separate from the desktop app's. */
export function browserAgentDataDir() {
  const configured = readEnv("AGENT_DATA_DIR");
  return configured ? path.resolve(configured)
    : path.join(path.dirname(path.dirname(profileDir())), "browser-agent");
}

async function hostFor(projectId: string, origin: string): Promise<Host> {
  const existing = state.hosts.get(projectId);
  if (existing) return existing;
  const { createChatController } = await load("desktop/chat-controller.mjs");
  const listeners = new Set<(event: ChatEvent) => void>();
  const env = agentEnv();
  if (!state.login) { const { createAgentLogin } = await load("desktop/agent-login.mjs"); state.login ??= createAgentLogin({ env }); }
  if (!state.models) { const { createAgentModels } = await load("desktop/agent-models.mjs"); state.models ??= createAgentModels(); }
  const controller: Controller = createChatController({
    projectNow: () => projectId, deliver: (event: ChatEvent) => { for (const listener of listeners) listener(event); },
    origin, projectsRoot: projectsRoot(), userData: browserAgentDataDir(), agents: state.agents, env, harnessRoot: process.cwd(), login: state.login, models: state.models,
    closedMessage: "The editing assistant was closed.",
  });
  const host = state.hosts.get(projectId) ?? { controller, listeners };
  state.hosts.set(projectId, host);
  return host;
}

export async function browserChatStatus() {
  await refreshAgents();
  return { providers: (["codex", "claude", "local"] as const).map(provider => ({ provider, label: { codex: "Codex", claude: "Claude", local: "Local" }[provider],
    available: Boolean(state.agents[provider]), authentication: state.agents[provider]?.authentication ?? "unknown" })) };
}

export async function browserChatAction(projectId: string, origin: string, action: string, payload: unknown) {
  if (action === "status") return browserChatStatus();
  if (action === "connect" || action === "login" || action === "models") await refreshAgents();
  const result = await (await hostFor(projectId, origin)).controller.call(action, payload);
  // A new sign-in is re-read from Claude Code on the next status check.
  if (action === "login" && (result as { status?: string } | undefined)?.status === "signed-in") state.discovered = 0;
  return result;
}

export async function subscribeBrowserChat(projectId: string, origin: string, listener: (event: ChatEvent) => void) {
  const host = await hostFor(projectId, origin);
  if (host.idle) clearTimeout(host.idle);
  host.listeners.add(listener);
  return () => {
    host.listeners.delete(listener);
    if (host.listeners.size) return;
    host.idle = setTimeout(() => { if (!host.listeners.size) void host.controller.call("disconnect").catch(() => {}); }, IDLE_CLOSE_MS);
    host.idle.unref?.();
  };
}
