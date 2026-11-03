import assert from "node:assert/strict";
import test from "node:test";

/**
 * The host with its desktop modules replaced: discovery counts its runs and reports the executable
 * `paths` currently holds; the controller answers `models` and `connect` by `answer`.
 */
const discoveries: string[] = [];
const paths = { codex: "/bin/codex-1", claude: "/bin/claude-1" };
let answer: (action: string, executable: string | undefined) => unknown = () => ({ models: [] });

(globalThis as { __dreamcutBrowserChat?: unknown }).__dreamcutBrowserChat = {
  hosts: new Map(), agents: { codex: undefined, claude: undefined, local: undefined }, discovered: 0,
  load: async (file: string) => {
    if (file.endsWith("codex-discovery.mjs")) return { discoverCodex: async () => { discoveries.push("codex"); return { state: "available", executable: paths.codex, authentication: "signed-in" }; } };
    if (file.endsWith("claude-discovery.mjs")) return { discoverClaude: async () => ({ state: "available", executable: paths.claude, authentication: "signed-in" }) };
    if (file.endsWith("local-discovery.mjs")) return { discoverLocal: async () => ({ state: "unavailable", models: [] }) };
    if (file.endsWith("agent-login.mjs")) return { createAgentLogin: () => ({ call: async () => ({ status: "idle" }), dispose() {} }) };
    if (file.endsWith("agent-models.mjs")) return { createAgentModels: () => ({ list: async () => [] }) };
    if (file.endsWith("chat-controller.mjs")) return {
      createChatController: ({ agents }: { agents: Record<string, { executable?: string } | undefined> }) => {
        return { call: async (action: string, payload: { provider: string }) => answer(action, agents[payload?.provider]?.executable), dispose: async () => {} };
      },
    };
    throw new Error(`unexpected module ${file}`);
  },
};
const host = () => import("./browser-chat-host");
const browserChatStatus = async () => (await host()).browserChatStatus();
const browserChatAction = async (...args: Parameters<Awaited<ReturnType<typeof host>>["browserChatAction"]>) => (await host()).browserChatAction(...args);
const realNow = Date.now;
const later = (ms: number) => { const at = realNow() + ms; Date.now = () => at; };

test("models and connect reuse the page's discovery after its TTL instead of spawning the CLIs again", async () => {
  await browserChatStatus();
  assert.equal(discoveries.length, 1);
  later(60_000);
  await browserChatAction("week-recap", "http://127.0.0.1:3129", "models", { provider: "codex" });
  await browserChatAction("week-recap", "http://127.0.0.1:3129", "models", { provider: "claude" });
  await browserChatAction("week-recap", "http://127.0.0.1:3129", "connect", { provider: "codex" });
  assert.equal(discoveries.length, 1);
  // An explicit status check still refreshes once its TTL has passed.
  await browserChatStatus();
  assert.equal(discoveries.length, 2);
  Date.now = realNow;
});

test("a failure with a moved executable rediscovers and retries once with the new path", async () => {
  const before = discoveries.length;
  const tried: (string | undefined)[] = [];
  answer = (action, executable) => { tried.push(executable); if (executable === "/bin/codex-1") throw new Error("spawn ENOENT"); return { models: [{ model: "gpt", label: "GPT", isDefault: true }] }; };
  paths.codex = "/bin/codex-2";
  const result = await browserChatAction("week-recap", "http://127.0.0.1:3129", "models", { provider: "codex" }) as { models: unknown[] };
  assert.equal(result.models.length, 1);
  assert.deepEqual(tried, ["/bin/codex-1", "/bin/codex-2"]);
  assert.equal(discoveries.length, before + 1);
});

test("a failure with the same executable rediscovers but does not retry", async () => {
  const before = discoveries.length;
  let calls = 0;
  answer = () => { calls++; throw new Error("project is open in another window"); };
  await assert.rejects(browserChatAction("week-recap", "http://127.0.0.1:3129", "connect", { provider: "codex" }), /another window/);
  assert.equal(calls, 1);
  assert.equal(discoveries.length, before + 1);
  answer = () => ({ models: [] });
});
