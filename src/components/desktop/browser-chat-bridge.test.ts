import assert from "node:assert/strict";
import test from "node:test";

import { browserChatBridge, sharedRequest } from "./browser-chat-bridge";

/** Counts the agent-chat requests a page sends, answering each once `release` is called. */
function stubFetch() {
  const calls: string[] = [];
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push(body.action ? `${body.action}${body.provider ? `:${body.provider}` : ""}` : String(url));
    await gate;
    const result = body.action === "models" ? { models: [{ model: body.provider, label: body.provider, isDefault: true }] } : body.action === "history" ? { messages: [] } : null;
    return new Response(JSON.stringify(body.action ? { result } : { providers: [] }), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { calls, release: () => release() };
}

test("a panel mounted twice at once sends one status, history and models request each", async () => {
  const { calls, release } = stubFetch();
  const first = browserChatBridge("week-recap"), second = browserChatBridge("week-recap");
  const answers = Promise.all([first.status!(), second.status!(), first.history!(), second.history!(),
    first.models!("codex"), second.models!("codex"), first.models!("claude"), second.models!("claude")]);
  release();
  const [, , historyA, historyB, codexA, codexB, claudeA] = await answers;
  assert.deepEqual(calls.sort(), ["/api/agent-chat/status", "history", "models:claude", "models:codex"]);
  assert.deepEqual(historyA, historyB);
  assert.deepEqual(codexA, codexB);
  assert.equal(claudeA?.models[0].model, "claude");
});

test("only requests in flight are shared: a later call asks the server again", async () => {
  const { calls, release } = stubFetch();
  release();
  const bridge = browserChatBridge("week-recap");
  await bridge.models!("codex");
  await bridge.models!("codex");
  await browserChatBridge("other-project").history!();
  await bridge.history!();
  assert.deepEqual(calls, ["models:codex", "models:codex", "history", "history"]);
});

test("a shared failure reaches every caller and is not kept", async () => {
  let attempts = 0;
  const failing = () => { attempts++; return Promise.reject(new Error("unavailable")); };
  await assert.rejects(Promise.all([sharedRequest("probe", failing), sharedRequest("probe", failing)]), /unavailable/);
  assert.equal(attempts, 1);
  await assert.rejects(sharedRequest("probe", failing), /unavailable/);
  assert.equal(attempts, 2);
});
