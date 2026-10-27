"use client";

import { streamTransportUrl } from "@/lib/loopback-transport";
import type { ChatBridge } from "./useDesktopChat";

/** Set once a stream-only loopback name failed to open on this page; later streams stay same-origin. */
let streamHostUnavailable = false;

/**
 * Read-only lookups already in flight on this page, keyed by request. A panel that mounts twice at
 * once (React Strict Mode in development, or two chat panels for one project) shares one request
 * instead of holding another of the six connections the editor's loading requests share. Only
 * in-flight requests are shared, so every later call still asks the server.
 */
const pending = new Map<string, Promise<unknown>>();
export function sharedRequest<T>(key: string, request: () => Promise<T>): Promise<T> {
  const existing = pending.get(key);
  if (existing) return existing as Promise<T>;
  const started = request().finally(() => { if (pending.get(key) === started) pending.delete(key); });
  pending.set(key, started);
  return started;
}

/**
 * Browser transport for the editing agent: the same bridge shape the desktop window
 * exposes, backed by this local server's agent-chat routes and an event stream.
 */
export function browserChatBridge(projectId: string): ChatBridge {
  const base = `/api/projects/${encodeURIComponent(projectId)}/agent-chat`;
  /** This page holds a live agent session, so its stream stays open while hidden (a
   * finished turn or a disconnect must still reach it). */
  let live = false;
  let wake = () => {};
  const act = async (action: string, body: Record<string, unknown> = {}) => {
    const response = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...body }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error ?? "The editing assistant is unavailable.");
    if (action === "connect" || action === "send") live = true;
    if (action === "disconnect" || action === "new-conversation") { live = false; wake(); }
    return data.result;
  };
  return {
    status: () => sharedRequest("status", async () => {
      const response = await fetch("/api/agent-chat/status", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Agent status is unavailable.");
      return data;
    }),
    history: () => sharedRequest(`history:${projectId}`, () => act("history")),
    newConversation: provider => act("new-conversation", { provider }),
    connect: (provider, model) => act("connect", { provider, model }),
    send: (text, model, provider, display, attachments) => act("send", { text, model, provider, display, attachments }),
    cancel: () => act("cancel"),
    disconnect: () => act("disconnect"),
    // Model lists are the host's, not the project's (agent-models.mjs).
    models: provider => sharedRequest(`models:${provider}`, () => act("models", { provider })),
    prewarm: (provider, model) => act("prewarm", { provider, model }),
    login: (step, code) => act("login", { provider: "claude", step, code }),
    subscribe(listener) {
      // The stream lives on its own loopback name (lib/loopback-transport), so it never takes one of
      // the six connections the editor's requests share. A hidden page without a live session lets
      // it go and catches up from the saved conversation when it is shown again.
      let source: EventSource | null = null, stopped = false, resumed = false;
      const deliver = (message: MessageEvent) => {
        let event: Parameters<typeof listener>[0];
        try { event = JSON.parse(message.data); } catch { return; /* Ignore malformed frames. */ }
        if (event.type === "disconnected") { live = false; queueMicrotask(sync); }
        listener(event);
      };
      const open = () => {
        const path = `${base}/events`, remote = streamHostUnavailable ? null : streamTransportUrl(path);
        const stream = new EventSource(remote ?? path);
        let opened = false;
        stream.onopen = () => { opened = true; };
        stream.onmessage = deliver;
        // That name is not served here (an older server, no IPv6 loopback): use this origin.
        stream.onerror = () => { if (!remote || opened || source !== stream) return; streamHostUnavailable = true; stream.close(); source = null; sync(); };
        source = stream;
        if (resumed) void act("history").then(saved => { if (saved && source === stream) listener({ projectId, type: "history", ...saved }); }).catch(() => {});
      };
      const sync = () => {
        const wanted = !stopped && (live || document.visibilityState !== "hidden");
        if (wanted && !source) open();
        else if (!wanted && source) { source.close(); source = null; resumed = true; }
      };
      wake = sync;
      document.addEventListener("visibilitychange", sync);
      sync();
      return () => { stopped = true; document.removeEventListener("visibilitychange", sync); source?.close(); source = null; };
    },
  };
}
