"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { VoiceBridge } from "./VoiceInput";
import { browserChatBridge } from "./browser-chat-bridge";

export type ChatAttachment = { kind: string; label: string };
/** One step of the agent's live work: streamed reasoning, or an editing tool and its outcome. */
export type ActivityStep = { kind: "reasoning"; text: string } | { kind: "tool"; id: string; tool: string; status: "running" | "done" | "failed" };
export type ChatMessage = { role: "user" | "assistant" | "notice" | "activity"; text: string; provider?: string; model?: string; attachments?: ChatAttachment[]; steps?: ActivityStep[] };
type Message = ChatMessage;
type ChatEvent = { projectId: string; type: string; text?: string; message?: string; status?: string; messages?: Message[]; truncated?: boolean; id?: string; tool?: string; model?: string; state?: string; label?: string };
export type ModelChoice = { model: string; label: string; isDefault: boolean };
export type AgentProvider = "codex" | "claude" | "local";
export type ProviderChoice = { provider: AgentProvider; label: string; available: boolean; authentication: string };
export type SignInStep = "start" | "wait" | "code" | "cancel";
export type SignInResult = { status: "starting" | "waiting" | "signed-in" | "failed" | "cancelled" | "idle"; url?: string; message?: string; retry?: boolean };
/** Claude sign-in as the chat shows it; `verifying` covers a pasted code being checked. */
export type SignInState = { status: "idle" | "starting" | "waiting" | "verifying" | "failed"; url?: string; message?: string };
export type ChatBridge = { status?(): Promise<{ providers: ProviderChoice[] }>; history?(): Promise<{ messages: Message[]; truncated?: boolean } | null>; login?(step: SignInStep, code?: string): Promise<SignInResult>; models?(provider: AgentProvider): Promise<{ models: ModelChoice[] }>; prewarm?(provider: AgentProvider, model?: string): Promise<void>; newConversation(provider?: AgentProvider): Promise<void>; connect(provider?: AgentProvider, model?: string): Promise<{ models: ModelChoice[]; selected: string } | undefined>; send(text: string, model?: string, provider?: AgentProvider, display?: string, attachments?: ChatAttachment[]): Promise<void>; cancel(): Promise<void>; disconnect(): Promise<void>; subscribe(listener: (event: ChatEvent) => void): () => void };
// One global agent default across projects; a per-viewer convenience, so browser storage is enough.
const PREFERENCE_KEY = "dreamcut:agent";
const CODEX_ONLY: ProviderChoice[] = [{ provider: "codex", label: "Codex", available: true, authentication: "unknown" }];
function readPreference(): { provider?: AgentProvider; models?: Partial<Record<AgentProvider, string>> } {
  try { return JSON.parse(localStorage.getItem(PREFERENCE_KEY) ?? "{}") ?? {}; } catch { return {}; }
}
function writePreference(update: (value: ReturnType<typeof readPreference>) => ReturnType<typeof readPreference>) {
  try { localStorage.setItem(PREFERENCE_KEY, JSON.stringify(update(readPreference()))); } catch { /* Preference only. */ }
}
declare global { interface Window { dreamcutDesktop?: { platform: string; chat?: ChatBridge; voice?: VoiceBridge }; } }

/** Electron prefixes IPC failures ("Error invoking remote method 'dreamcut:chat': Error: …"); show only the reason. */
export function chatErrorMessage(cause: unknown, fallback: string) {
  const raw = cause instanceof Error ? cause.message : fallback;
  const message = raw.replace(/^Error invoking remote method '[^']+':\s*(?:\w*Error:\s*)?/, "");
  if (/session tools differ|start a new conversation explicitly/i.test(message)) return NEEDS_NEW_CONVERSATION;
  if (/signed out|not logged in|authentication_failed/i.test(message)) return NEEDS_SIGN_IN;
  // A window reloaded onto newer UI than its running host (the desktop app needs a full restart).
  if (/unsupported chat action/i.test(message)) return "Quit and reopen DreamCut to finish updating, then try again.";
  // One window owns a project's agent at a time (desktop app or browser).
  if (/session leased|project is open in another|lease/i.test(message)) return "This project's chat is already running in another DreamCut window, such as the desktop app. Use that window, or close it and try again. If none is open, restart DreamCut to release it.";
  return message || fallback;
}
/** Claude Code has no sign-in; the chat offers Sign in with Claude instead of this text. */
export const NEEDS_SIGN_IN = "Claude is signed out. Sign in to continue.";
/** Shown when a saved conversation was started with earlier editing-tool definitions. */
export const NEEDS_NEW_CONVERSATION = "DreamCut's editing tools were updated since this conversation started, so it can't safely continue. Start a new conversation; the earlier one stays archived.";

export function useDesktopChat(projectId: string) {
  const [providers, setProviders] = useState<ProviderChoice[]>([]);
  const [provider, setProviderState] = useState<AgentProvider>("codex");
  const providerRef = useRef<AgentProvider>("codex");
  // Each agent's models, listed without connecting so the picker never waits on (or
  // takes) the project's chat lease. A live session's own list replaces its entry.
  const [catalogs, setCatalogs] = useState<Partial<Record<AgentProvider, ModelChoice[]>>>({});
  const [model, setModelState] = useState("");
  const [available, setAvailable] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [busy, setBusyState] = useState(false);
  const busyRef = useRef(false);
  const setBusy = useCallback((value: boolean) => { busyRef.current = value; setBusyState(value); }, []);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [truncated, setTruncated] = useState(false);
  // A local model loading in the background (prewarm), shown until it is ready.
  const [modelStatus, setModelStatus] = useState<{ state: "loading" | "failed"; label: string } | null>(null);
  const bridge = useRef<ChatBridge | undefined>(undefined);
  const answering = useRef<string | undefined>(undefined);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    // The desktop window provides IPC; the browser editor uses this local server.
    bridge.current = window.dreamcutDesktop?.chat ?? browserChatBridge(projectId);
    setAvailable(Boolean(bridge.current));
    void (bridge.current?.status ? bridge.current.status().then(value => value.providers) : Promise.resolve(bridge.current ? CODEX_ONLY : []))
      .then(list => {
        if (!active.current) return;
        setProviders(list);
        const saved = readPreference().provider;
        const chosen = list.find(item => item.provider === saved && item.available) ?? list.find(item => item.available);
        if (chosen) { providerRef.current = chosen.provider; setProviderState(chosen.provider); setModelState(readPreference().models?.[chosen.provider] ?? ""); }
        for (const item of list) if (item.available && bridge.current?.models) void bridge.current.models(item.provider)
          .then(result => { if (active.current && result?.models?.length) setCatalogs(previous => ({ [item.provider]: result.models, ...previous })); })
          .catch(() => { /* The picker falls back to the agent's default model. */ });
      }).catch(() => { if (active.current) setProviders(CODEX_ONLY); });
    // DreamCut keeps the conversation itself, so it shows before (and without) connecting an agent.
    void bridge.current?.history?.().then(saved => {
      if (!active.current || !saved) return;
      setMessages(previous => previous.length ? previous : saved.messages ?? []); setTruncated(Boolean(saved.truncated));
    }).catch(() => { /* An older host without saved history; the agent's own history arrives on connect. */ });
    const unsubscribe = bridge.current?.subscribe(event => {
      if (event.projectId !== projectId || !active.current) return;
      if (event.type === "model-status") setModelStatus(event.state === "loading" || event.state === "failed" ? { state: event.state, label: event.label ?? event.model ?? "model" } : null);
      if (event.type === "history") { setMessages(event.messages ?? []); setTruncated(Boolean(event.truncated)); }
      if (event.type === "notice" && event.text) setMessages(previous => [...previous, { role: "notice", text: event.text! }]);
      if (event.type === "reasoning-start" || event.type === "reasoning" || event.type === "tool") setMessages(previous => {
        const last = previous.at(-1);
        const steps = last?.role === "activity" ? [...(last.steps ?? [])] : [];
        if (event.type === "reasoning-start") { const step = steps.at(-1); if (step?.kind !== "reasoning" || step.text) steps.push({ kind: "reasoning", text: "" }); }
        else if (event.type === "reasoning") {
          const step = steps.at(-1);
          if (step?.kind === "reasoning") steps[steps.length - 1] = { ...step, text: step.text + (event.text ?? "") };
          else steps.push({ kind: "reasoning", text: event.text ?? "" });
        } else if (event.id && event.tool) {
          const status = event.status === "done" || event.status === "failed" ? event.status : "running";
          const index = steps.findIndex(step => step.kind === "tool" && step.id === event.id);
          if (index >= 0) steps[index] = { kind: "tool", id: event.id, tool: event.tool, status };
          else steps.push({ kind: "tool", id: event.id, tool: event.tool, status });
        }
        const activity: Message = { role: "activity", text: "", provider: providerRef.current, steps };
        return last?.role === "activity" ? [...previous.slice(0, -1), activity] : [...previous, activity];
      });
      // The model that answered can arrive after its first words; it names the reply in progress.
      if (event.type === "model" && event.model) {
        answering.current = event.model;
        setMessages(previous => {
          const last = previous.at(-1);
          return last?.role === "assistant" && last.provider === providerRef.current && last.model !== event.model ? [...previous.slice(0, -1), { ...last, model: event.model }] : previous;
        });
      }
      if (event.type === "text") setMessages(previous => {
        const last = previous.at(-1);
        return last?.role === "assistant" && last.provider === providerRef.current ? [...previous.slice(0, -1), { ...last, text: last.text + (event.text ?? "") }]
          : [...previous, { role: "assistant", text: event.text ?? "", provider: providerRef.current, ...(answering.current ? { model: answering.current } : {}) }];
      });
      // A specific reason reported during the turn (such as sign-in) outranks the generic failure.
      if (event.type === "completed") { setBusy(false); if (event.status === "failed") setError(previous => previous ?? "The response stopped before finishing. Your saved proposals are still available."); }
      if (event.type === "error" || event.type === "disconnected") { setError(chatErrorMessage(event.message ? new Error(event.message) : undefined, "Connection interrupted.")); setBusy(false); if (event.type === "disconnected") { setConnected(false); setModelStatus(null); } }
    });
    // Unmounting does not disconnect: a hot reload or page reload would otherwise cut off a running
    // reply. The host closes the session when the window closes or changes project, and the browser
    // host after its listeners are gone; an explicit agent switch still disconnects.
    return () => { active.current = false; unsubscribe?.(); };
  }, [projectId]);
  const [connecting, setConnecting] = useState(false);
  const connectedRef = useRef(false);
  useEffect(() => { connectedRef.current = connected; }, [connected]);
  /** `quiet`: an automatic connect shows no error; the first send reports it. */
  const connect = useCallback(async (quiet = false) => {
    if (!bridge.current || busyRef.current) return false;
    setError(null); setBusy(true); setConnecting(true);
    const chosen = providerRef.current;
    try {
      const catalog = await bridge.current.connect(chosen, chosen === "local" ? readPreference().models?.local || undefined : undefined);
      if (active.current) {
        const preferred = readPreference().models?.[chosen];
        setConnected(true);
        if (catalog?.models.length) setCatalogs(previous => ({ ...previous, [chosen]: catalog.models }));
        setModelState(catalog?.models.some(item => item.model === preferred) ? preferred! : catalog?.selected ?? "");
        if (!catalog) setError("Restart DreamCut to enable model selection.");
      }
      connectedRef.current = true;
      return true;
    }
    catch (cause) { if (active.current && !quiet) setError(chatErrorMessage(cause, "Could not connect to the editing agent.")); return false; }
    finally { if (active.current) { setBusy(false); setConnecting(false); } }
  }, [setBusy]);
  /** `display` is what the conversation shows; `text` may carry attached page context. */
  const send = useCallback(async (text: string, display = text, attachments: ChatAttachment[] = []) => {
    if (!bridge.current || busyRef.current || !text.trim()) return false;
    // Connection is implicit: the first message connects the chosen agent if needed.
    if (!connectedRef.current && !(await connect())) return false;
    answering.current = undefined;
    setBusy(true); setError(null); setMessages(previous => [...previous, { role: "user", text: display, provider: providerRef.current, ...(attachments.length ? { attachments } : {}) }]);
    try { await bridge.current.send(text, model || undefined, providerRef.current, display === text ? undefined : display, attachments.length ? attachments : undefined); return true; }
    catch (cause) { if (active.current) { setError(chatErrorMessage(cause, "Message could not be sent.")); setBusy(false); } return false; }
  }, [connect, model, setBusy]);
  const cancel = useCallback(async () => {
    try { await bridge.current?.cancel(); }
    catch { if (active.current) setError("Could not stop the response. Disconnect to end this session."); }
  }, []);
  const disconnect = useCallback(async () => {
    try { await bridge.current?.disconnect(); }
    finally { if (active.current) { setConnected(false); setBusy(false); } }
  }, []);
  const newConversation = useCallback(async () => {
    if (!bridge.current || busyRef.current) return false;
    setBusy(true); setError(null);
    try {
      await bridge.current.newConversation(providerRef.current);
      if (active.current) { setMessages([]); setTruncated(false); setConnected(false); }
      return true;
    } catch (cause) {
      if (active.current) { setConnected(false); setError(chatErrorMessage(cause, "Could not start a new conversation.")); }
      return false;
    } finally { if (active.current) setBusy(false); }
  }, [setBusy]);
  const setModel = useCallback((value: string) => {
    setModelState(value);
    writePreference(current => ({ ...current, models: { ...current.models, [providerRef.current]: value } }));
    // Choosing a local model starts loading it, so the first message does not wait for it.
    if (providerRef.current === "local" && connectedRef.current) void bridge.current?.prewarm?.("local", value).catch(() => {});
  }, []);
  // The conversation is DreamCut's, so it stays on screen; the next agent receives it as context.
  const setProvider = useCallback(async (value: AgentProvider, nextModel?: string) => {
    if (busyRef.current || value === providerRef.current) return;
    try { await bridge.current?.disconnect(); } catch { /* Already closed. */ }
    if (!active.current) return;
    providerRef.current = value; setProviderState(value);
    setConnected(false); setModelStatus(null); setModelState(nextModel ?? readPreference().models?.[value] ?? ""); setError(null);
    writePreference(current => ({ ...current, provider: value, ...(nextModel ? { models: { ...current.models, [value]: nextModel } } : {}) }));
  }, []);
  // Connect the remembered agent once per selection; a failure waits for the user
  // (choosing an agent or sending) instead of retrying in a loop.
  // Only the window in use connects: one project's chat runs in one window at a time,
  // so a background window (another tab, the desktop app) must not take the lease.
  const autoConnected = useRef<string | null>(null);
  useEffect(() => {
    const choice = providers.find(item => item.provider === provider);
    if (!available || connected || !choice?.available || choice.authentication === "signed-out") return;
    const attempt = () => {
      if (autoConnected.current === provider || !document.hasFocus()) return;
      autoConnected.current = provider;
      void connect(true).then(ok => { if (!ok) autoConnected.current = null; });
    };
    attempt();
    window.addEventListener("focus", attempt);
    return () => window.removeEventListener("focus", attempt);
  }, [available, connected, connect, provider, providers]);
  /** One menu value per choice: "provider::model"; an empty model switches agents. */
  const choose = useCallback((value: string) => {
    const [nextProvider, nextModel] = value.split("::") as [AgentProvider, string];
    if (nextProvider !== providerRef.current) void setProvider(nextProvider, nextModel || undefined);
    else if (nextModel) setModel(nextModel);
    else if (!connectedRef.current) void connect(); // "Connect" retries after a failure.
  }, [connect, setModel, setProvider]);
  // Claude sign-in, Cardboard style: Claude Code opens the browser and usually finishes
  // on its own; a code pasted from the sign-in page is the fallback.
  const [signIn, setSignIn] = useState<SignInState>({ status: "idle" });
  const signInRun = useRef(0);
  const finishSignIn = useCallback(async () => {
    setSignIn({ status: "idle" }); setError(null);
    setProviders(list => list.map(item => item.provider === "claude" ? { ...item, authentication: "signed-in" } : item));
    // A session opened while signed out keeps its old credentials; start a fresh one.
    try { await bridge.current?.disconnect(); } catch { /* Already closed. */ }
    if (!active.current) return;
    setConnected(false); connectedRef.current = false;
    void connect(true);
  }, [connect]);
  const follow = useCallback(async (run: number, first: SignInResult) => {
    let result = first;
    for (;;) {
      if (!active.current || run !== signInRun.current) return;
      if (result.status === "signed-in") return void finishSignIn();
      if (result.status !== "waiting" && result.status !== "starting") {
        if (result.status !== "cancelled") setSignIn({ status: "failed", message: result.message ?? "Sign-in did not finish. Try again." });
        return;
      }
      setSignIn(previous => ({ status: "waiting", url: result.url ?? previous.url }));
      try { result = await bridge.current!.login!("wait"); }
      catch (cause) { result = { status: "failed", message: chatErrorMessage(cause, "Sign-in stopped.") }; }
    }
  }, [finishSignIn]);
  const startSignIn = useCallback(async () => {
    if (!bridge.current?.login) return;
    const run = ++signInRun.current;
    setSignIn({ status: "starting" });
    try { await follow(run, await bridge.current.login("start")); }
    catch (cause) { if (active.current && run === signInRun.current) setSignIn({ status: "failed", message: chatErrorMessage(cause, "Could not start sign-in.") }); }
  }, [follow]);
  const submitSignInCode = useCallback(async (code: string) => {
    if (!bridge.current?.login || !code.trim()) return;
    const run = ++signInRun.current;
    setSignIn(previous => ({ ...previous, status: "verifying", message: undefined }));
    let result: SignInResult;
    try { result = await bridge.current.login("code", code); }
    catch (cause) { result = { status: "failed", message: chatErrorMessage(cause, "That code could not be checked.") }; }
    // A malformed or stale code leaves the sign-in open for another try.
    if (result.retry) { if (run === signInRun.current) setSignIn(previous => ({ ...previous, status: "waiting", message: result.message })); return; }
    await follow(run, result);
  }, [follow]);
  const cancelSignIn = useCallback(() => {
    signInRun.current++;
    setSignIn({ status: "idle" });
    void bridge.current?.login?.("cancel").catch(() => {});
  }, []);
  useEffect(() => () => { if (signInRun.current) void bridge.current?.login?.("cancel").catch(() => {}); }, []);
  const providerChoice = providers.find(item => item.provider === provider);
  const canSignIn = Boolean(bridge.current?.login) && provider === "claude" && Boolean(providerChoice?.available);
  const needsSignIn = canSignIn && (providerChoice?.authentication === "signed-out" || error === NEEDS_SIGN_IN || signIn.status !== "idle");
  const providerLabel = providerChoice?.label ?? "Codex";
  // The model behind the current agent, as last reported by a reply; the picker's "default" resolves to it.
  const knownModel = messages.findLast(item => item.role === "assistant" && item.provider === provider && item.model)?.model;
  const agentLabel = useCallback((value?: string) => value === "codex" ? "GPT" : providers.find(item => item.provider === value)?.label ?? (value === "claude" ? "Claude" : value === "local" ? "Local" : providerLabel), [providers, providerLabel]);
  const models = catalogs[provider] ?? [];
  return { modelStatus, providers, provider, providerLabel, agentLabel, knownModel, catalogs, setProvider, choose, connecting, models, model, setModel, newConversation, available, messages, busy, error, connected, truncated, connect, send, cancel, disconnect,
    signIn, needsSignIn, startSignIn, submitSignInCode, cancelSignIn };
}
