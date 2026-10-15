"use client";

import type { ChatBridge } from "./useDesktopChat";

/**
 * Browser transport for the editing agent: the same bridge shape the desktop window
 * exposes, backed by this local server's agent-chat routes and an event stream.
 */
export function browserChatBridge(projectId: string): ChatBridge {
  const base = `/api/projects/${encodeURIComponent(projectId)}/agent-chat`;
  const act = async (action: string, body: Record<string, unknown> = {}) => {
    const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "The editing assistant is unavailable.");
    return data.result;
  };
  return {
    async status() {
      const response = await fetch("/api/agent-chat/status", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Agent status is unavailable.");
      return data;
    },
    history: () => act("history"),
    newConversation: provider => act("new-conversation", { provider }),
    connect: (provider, model) => act("connect", { provider, model }),
    send: (text, model, provider, display, attachments) => act("send", { text, model, provider, display, attachments }),
    cancel: () => act("cancel"),
    disconnect: () => act("disconnect"),
    models: provider => act("models", { provider }),
    prewarm: (provider, model) => act("prewarm", { provider, model }),
    login: (step, code) => act("login", { provider: "claude", step, code }),
    subscribe(listener) {
      const source = new EventSource(`${base}/events`);
      source.onmessage = message => { try { listener(JSON.parse(message.data)); } catch { /* Ignore malformed frames. */ } };
      return () => source.close();
    },
  };
}
