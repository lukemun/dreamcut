"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowUp, Square, LoaderCircle, ExternalLink, X, SquarePen, Check, CircleAlert, ChevronRight, ClipboardCheck, Plus, Sparkles, Upload } from "lucide-react";
import Link from "next/link";
import { ActionMenu, ActionMenuItem } from "@/components/ui/menu";
import { APPROVED_UPLOAD_ACCEPT, uploadLibraryMedia, type UploadAssetType } from "@/lib/media/upload-library-media";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger } from "@/components/ui/select";
import { Button, buttonVariants } from "@/components/ui/button";
import { SlideOutDrawer } from "@/components/studio/timeline/SlideOutDrawer";
import { DrawerHeader } from "@/components/studio/timeline/DrawerHeader";
import type { AgentAsk, ChatSelection, PageChatContext, ProposalReply } from "./ProjectReviewDock";
import { VoiceInput, type VoiceHandle, type VoiceState } from "./VoiceInput";
import { NEEDS_NEW_CONVERSATION, NEEDS_SIGN_IN, useDesktopChat, type ActivityStep, type ChatAttachment } from "./useDesktopChat";
import { ChatText } from "./ChatText";
import { AgentMark } from "./AgentMark";
import { modelLabel } from "./model-label";

export function DesktopChat({ projectId, embedded = false, reply, onClearReply, ask, onAskSent, marksSlot, pageContext, selections = [], onRemoveSelection, onViewProposals }: { projectId: string; embedded?: boolean; reply?: ProposalReply | null; onClearReply?: () => void; ask?: AgentAsk | null; onAskSent?: () => void; marksSlot?: React.ReactNode; pageContext?: PageChatContext | null; selections?: ChatSelection[]; onRemoveSelection?: (id: string) => void; onViewProposals?: () => void }) {
  const chat = useDesktopChat(projectId);
  const [open, setOpen] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [spoken, setSpoken] = useState("");
  const voice = useRef<VoiceHandle>(null);
  const dictating = voiceState !== "idle";
  const [draft, setDraft] = useState("");
  useEffect(() => {
    const saved = sessionStorage.getItem(`dreamcut:chat-draft:${projectId}`);
    if (saved) setDraft(saved);
  }, [projectId]);
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // Follow new messages while the reader is at the bottom; scrolling up to read earlier turns stops following.
  const log = useRef<HTMLDivElement>(null);
  const following = useRef(true);
  useLayoutEffect(() => {
    const node = log.current;
    if (node && following.current) node.scrollTop = node.scrollHeight;
  }, [chat.messages, chat.busy]);
  const close = () => { setOpen(false); trigger.current?.focus(); };
  // Files added from the chat are imported into the Library first, then named in the next message.
  const [uploads, setUploads] = useState<ChatUpload[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const importing = uploads.some(item => item.status === "importing");
  const ready = uploads.filter((item): item is ChatUpload & { sourceUrl: string } => item.status === "ready" && Boolean(item.sourceUrl));
  const importFiles = (files: File[]) => {
    for (const file of files) {
      const id = `${file.name}:${file.size}:${file.lastModified}:${Math.random().toString(36).slice(2)}`;
      setUploads(previous => [...previous, { id, name: file.name, status: "importing" }]);
      void uploadLibraryMedia(projectId, file)
        .then(done => setUploads(previous => previous.map(item => item.id === id ? { ...item, status: "ready", sourceUrl: done.sourceUrl, assetType: done.assetType } : item)))
        .catch(error => setUploads(previous => previous.map(item => item.id === id ? { ...item, status: "failed", error: error instanceof Error ? error.message : "Upload failed" } : item)));
    }
  };
  // The page context rides along with each message until the creator removes it.
  const activeContext = pageContext ?? null;
  const replyPrefix = (reply ? `Regarding proposal ${reply.id}: ${reply.summary.slice(0, 1200)}\n\n` : "")
    + (selections.length ? `[Selected in the editor]\n${selections.map(item => `- ${item.agentText}`).join("\n").slice(0, 6000)}\n\n` : "")
    + (activeContext ? `[Context from the ${activeContext.label}]\n${activeContext.text.slice(0, 12000)}\n\n` : "")
    + (ready.length ? `[Imported into the Library for this message]\n${ready.map(item => `- ${UPLOAD_KIND[item.assetType ?? "still"]} "${item.name}": ${item.sourceUrl}`).join("\n")}\n\n` : "")
    + (selections.length || activeContext || ready.length ? "[Message]\n" : "");
  const messageTooLong = draft.trim().length + replyPrefix.length > 16000;
  const joinDraft = (previous: string, text: string) => previous.trim() ? `${previous.trimEnd()} ${text}` : text;
  // While recording the composer shows the live words; sending ends the recording and sends its final text.
  const shown = dictating && spoken ? joinDraft(draft, spoken) : draft;
  // Grow with what the box shows, including live dictation, up to its CSS max-height; then keep the newest words in view.
  useLayoutEffect(() => {
    const node = input.current; if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
    if (dictating) node.scrollTop = node.scrollHeight;
  }, [shown, dictating]);
  const send = async () => {
    if (voiceState === "starting" || importing) return;
    let text = draft.trim();
    if (dictating) {
      const heard = await voice.current?.finish();
      if (!heard) return;
      text = joinDraft(draft, heard).trim(); setDraft(text);
    }
    if (!text || replyPrefix.length + text.length > 16000) return;
    const message = replyPrefix + text;
    // What the creator saw attached, recorded with the message so it can be checked later.
    const attachments: ChatAttachment[] = [
      ...(reply ? [{ kind: "Proposal", label: reply.summary.slice(0, 80) }] : []),
      ...selections.map(item => ({ kind: item.kind, label: item.label })),
      ...(activeContext ? [{ kind: "Page", label: activeContext.label }] : []),
      ...ready.map(item => ({ kind: UPLOAD_KIND[item.assetType ?? "still"], label: item.name })),
    ];
    following.current = true;
    if (await chat.send(message, text, attachments)) { sessionStorage.removeItem(`dreamcut:chat-draft:${projectId}`); setDraft(""); onClearReply?.(); setUploads(previous => previous.filter(item => item.status === "importing")); }
  };
  useEffect(() => { if (reply) input.current?.focus(); }, [reply, chat.connected]);
  // A Repair or Draft from the review panel goes out as soon as the agent is free, in this conversation.
  const asked = useRef<string | null>(null);
  useEffect(() => {
    if (!ask || chat.busy || asked.current === ask.id) return;
    asked.current = ask.id;
    following.current = true;
    void chat.send(ask.text, ask.display, [{ kind: "Proposal", label: ask.label.slice(0, 80) }]).then(sent => {
      if (!sent) asked.current = null;
      onAskSent?.();
    });
  }, [ask, chat, onAskSent]);
  const content = (
    <div className="desktop-chat">
      {!embedded && <DrawerHeader closeLabel="Close chat" onClose={close}><h2>Chat</h2></DrawerHeader>}
      <div ref={log} className="desktop-chat-messages" role="log" aria-label="Conversation" aria-live="polite"
        onScroll={event => { const node = event.currentTarget; following.current = node.scrollHeight - node.scrollTop - node.clientHeight < 48; }}>
        {!chat.messages.length && <div className="desktop-chat-empty">
          <p>What would you like to make?</p>
          {activeContext?.tips?.length ? <ul className="desktop-chat-tips">{activeContext.tips.map(tip => <li key={tip}>{tip}</li>)}</ul> : null}
        </div>}
        {chat.truncated && <p className="text-xs text-[var(--ink-muted)]">Showing the latest messages.</p>}
        {chat.messages.map((message, index) => {
          if (message.role === "user") return <div key={index} className="desktop-chat-message desktop-chat-message--user"><span className="sr-only">You</span><div className="whitespace-pre-wrap">{message.text}</div>
            {message.attachments?.length ? <ul className="desktop-chat-sent-with" aria-label="Sent with">{message.attachments.map((item, at) => <li key={at}><span>{item.kind}</span>{item.label}</li>)}</ul> : null}
          </div>;
          if (message.role === "activity") {
            const live = chat.busy && index === chat.messages.length - 1;
            const proposed = !live && (message.steps ?? []).some(step => step.kind === "tool" && step.tool === "proposal_create" && step.status === "done");
            const drafted = (message.steps ?? []).some(step => step.kind === "tool" && step.tool === "asset_generation_prepare" && step.status === "done");
            return <Fragment key={index}>
              <ActivityLog steps={message.steps ?? []} live={live} />
              {proposed && onViewProposals && <Button size="sm" variant="outline" className="desktop-chat-view-proposal" onClick={onViewProposals}>
                <ClipboardCheck aria-hidden data-icon="inline-start" />View proposal</Button>}
              {drafted && <Link className={`${buttonVariants({ size: "sm", variant: "outline" })} desktop-chat-view-proposal`} href={`/p/${encodeURIComponent(projectId)}/library?generate=create`}>
                <Sparkles aria-hidden data-icon="inline-start" />Open generation draft</Link>}
            </Fragment>;
          }
          if (message.role === "notice") return <p key={index} role="note" className="desktop-chat-notice">{message.text}</p>;
          // Name the model that answered (GPT-5.5, Opus 5.5); older replies without one keep the agent's name.
          const author = modelLabel(message.model) ?? chat.agentLabel(message.provider);
          // Activity between replies does not start a new author run.
          const previous = chat.messages.slice(0, index).findLast(item => item.role !== "activity");
          return <div key={index} className="desktop-chat-message desktop-chat-message--assistant">
            {/* One label per run of replies from the same agent keeps a long answer attached to its author. */}
            {(previous?.role !== "assistant" || previous.provider !== message.provider || previous.model !== message.model) && <div className="desktop-chat-author"><AgentMark provider={message.provider} className="size-3.5" />{author}</div>}
            <span className="sr-only">{author}</span>
            <ChatText text={message.text} />
          </div>;
        })}
        {chat.busy && !chat.connecting && chat.messages.at(-1)?.role === "user" && <p role="status" className="text-xs text-[var(--ink-muted)]">Working…</p>}
        {chat.modelStatus && <p role="status" className="desktop-chat-model-status">{chat.modelStatus.state === "loading"
          ? <><LoaderCircle aria-hidden className="size-3.5 animate-spin" />Loading {chat.modelStatus.label}…</> : <>Couldn’t load {chat.modelStatus.label}</>}</p>}
      </div>
      <div className="desktop-chat-footer">
        {reply && <div className="px-2 pb-2 text-xs text-[var(--ink-secondary)]">Replying to: {reply.summary}<Button variant="ghost" size="icon-sm" onClick={onClearReply} aria-label="Clear proposal reply">×</Button></div>}
        {chat.needsSignIn && <SignInCard chat={chat} />}
        {chat.error && chat.error !== NEEDS_SIGN_IN && <div role="alert" className="mb-2 break-words text-xs text-[var(--ink)]">{chat.error}
          {chat.error === NEEDS_NEW_CONVERSATION && <div className="mt-2"><Button size="sm" disabled={chat.busy} onClick={() => void chat.newConversation()}>Start new conversation</Button></div>}
        </div>}
        <div className="desktop-chat-composer">
          {marksSlot}
          {uploads.length > 0 && <ul className="chat-selection-pills chat-upload-pills" aria-label="Imported for this message">
            {uploads.map(item => <li key={item.id} className="chat-selection-pill" data-status={item.status} title={item.error ?? item.name}>
              <span className="chat-selection-pill-kind">{item.status === "importing" ? <LoaderCircle aria-label="Importing" className="size-3 animate-spin" /> : item.status === "failed" ? "Failed" : UPLOAD_KIND[item.assetType ?? "still"]}</span>
              <span className="chat-selection-pill-label">{item.name}</span>
              {item.status !== "importing" && <button type="button" aria-label={`Remove ${item.name}`} onClick={() => setUploads(previous => previous.filter(other => other.id !== item.id))}><X size={12} aria-hidden="true" /></button>}
            </li>)}
          </ul>}
          {selections.length > 0 && <div className="chat-selection-strip">
            <ul className="chat-selection-pills" aria-label="Selected for this message">
              {selections.map(item => <li key={item.id} className="chat-selection-pill" title={item.agentText}>
                <span className="chat-selection-pill-kind">{item.kind}</span>
                <span className="chat-selection-pill-label">{item.label}</span>
                {onRemoveSelection && <button type="button" aria-label={`Remove ${item.kind} ${item.label}`} onClick={() => onRemoveSelection(item.id)}><X size={12} aria-hidden="true" /></button>}
              </li>)}
            </ul>
            {onRemoveSelection && selections.length > 2 && <button type="button" className="chat-selection-clear" onClick={() => { for (const item of [...selections]) onRemoveSelection(item.id); }}>Clear {selections.length}</button>}
          </div>}
          <label className="sr-only" htmlFor="desktop-chat-message">Message {chat.providerLabel}</label>
          <textarea ref={input} id="desktop-chat-message" placeholder={chat.available ? "Describe your edit…" : "Chat is available in the desktop app"}
            value={shown} maxLength={16000} rows={2} disabled={!chat.available || chat.busy} readOnly={dictating}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
          <div className="desktop-chat-actions">
          <input ref={fileInput} type="file" multiple hidden accept={APPROVED_UPLOAD_ACCEPT} onChange={event => { importFiles(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
          <ActionMenu side="top" align="start" trigger={<Button type="button" variant="ghost" size="icon-sm" aria-label="Add" title="Add" disabled={!chat.available}><Plus size={16} aria-hidden /></Button>}>
            <ActionMenuItem icon={<Upload aria-hidden />} onClick={() => fileInput.current?.click()}>Upload media</ActionMenuItem>
            {/* The previous conversation stays archived. */}
            <ActionMenuItem icon={<SquarePen aria-hidden />} disabled={chat.busy || !chat.messages.length} onClick={() => void chat.newConversation().then(done => { if (done) { setDraft(""); setUploads([]); } })}>New chat</ActionMenuItem>
          </ActionMenu>
          <VoiceInput projectId={projectId} disabled={chat.busy} handle={voice} onStateChange={setVoiceState} onPreview={setSpoken} onText={text=>setDraft(previous=>joinDraft(previous, text))} />
            <div className="flex-1" />
            {chat.available && <AgentChip chat={chat} />}
            {chat.connecting && <LoaderCircle aria-label="Connecting" className="size-4 shrink-0 animate-spin text-[var(--ink-muted)]" />}
            <Button className="desktop-chat-send" size="icon-sm" aria-label={chat.busy ? "Stop response" : "Send message"} title={chat.busy ? "Stop response" : "Send · Enter"}
              disabled={voiceState === "starting" || !chat.available || (!chat.busy && (importing || (!dictating && (!draft.trim() || messageTooLong))))}
              onClick={() => chat.busy ? void chat.cancel() : void send()}>{chat.busy ? <Square size={14}/> : <ArrowUp size={17}/>}</Button>
          </div>
        </div>
        {messageTooLong && <p role="alert" className="text-xs">Please shorten your message.</p>}
      </div>
    </div>
  );
  if (embedded) return content;
  return <><Button ref={trigger} type="button" variant="outline" aria-expanded={open} onClick={() => setOpen(value => !value)}>Chat</Button>
    <SlideOutDrawer open={open} label="Editing chat" width="min(440px, calc(100vw - 24px))" widthStorageKey="dreamcut:chat-width" zIndex={1150}>{content}</SlideOutDrawer></>;
}

type ChatUpload = { id: string; name: string; status: "importing" | "ready" | "failed"; sourceUrl?: string; assetType?: UploadAssetType; error?: string };
const UPLOAD_KIND: Record<UploadAssetType, string> = { still: "Image", video_clip: "Video", music: "Audio", sfx: "Audio" };

const TOOL_LABELS: Record<string, string> = {
  timeline_get: "Read the timeline", timeline_evidence: "Gathered timeline evidence", editing_memory_get: "Read your style and marks",
  editing_feedback_record: "Recorded your direction", editing_feedback_check: "Checked your directions", editing_feedback_disposition: "Recorded a direction outcome",
  proposal_create: "Created a proposal", proposal_preview: "Previewed a proposal", proposal_get: "Read a proposal", proposal_list: "Listed proposals",
  capability_catalog: "Looked up capabilities", visual_analyze: "Looked at frames", source_evidence: "Checked source media", media_readiness: "Checked media readiness",
  library_present: "Showed library items", asset_generation_prepare: "Prepared a generation draft", agent_delegate: "Ran helpers in parallel",
};
const toolLabel = (tool: string) => TOOL_LABELS[tool] ?? tool.replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());

/** The agent's work between replies, condensed to one line: the current step while it runs, a count when done. */
function ActivityLog({ steps, live }: { steps: ActivityStep[]; live: boolean }) {
  const tools = steps.filter((step): step is Extract<ActivityStep, { kind: "tool" }> => step.kind === "tool");
  const last = steps.at(-1);
  const running = live ? tools.findLast(step => step.status === "running") : undefined;
  const summary = running ? `${toolLabel(running.tool)}…` : live && last?.kind === "reasoning" ? "Thinking…"
    : live ? "Working…" : tools.length ? `${tools.length} ${tools.length === 1 ? "step" : "steps"}` : "Thought";
  const thoughts = steps.filter(step => step.kind === "reasoning" && step.text.trim()).length;
  if (!live && !tools.length && !thoughts) return null;
  return <details className="desktop-chat-activity" aria-label="Agent activity">
    <summary>
      {live ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : <ChevronRight aria-hidden className="desktop-chat-activity-chevron size-3.5" />}
      <span>{summary}</span>
      {live && tools.length > 0 && <span className="desktop-chat-activity-count">{tools.length}</span>}
    </summary>
    <ol>
      {steps.map((step, index) => {
        if (step.kind === "reasoning") return step.text.trim() ? <li key={index} className="desktop-chat-activity-reasoning"><p>{step.text.trim()}</p></li> : null;
        const active = step.status === "running" && live;
        return <li key={step.id} className="desktop-chat-activity-tool" data-status={step.status}>
          {active ? <LoaderCircle aria-hidden className="size-3.5 animate-spin" /> : step.status === "failed" ? <CircleAlert aria-hidden className="size-3.5" /> : <Check aria-hidden className="size-3.5" />}
          <span>{toolLabel(step.tool)}{step.status === "failed" ? " · failed" : ""}</span>
        </li>;
      })}
    </ol>
  </details>;
}

/** Claude sign-in inside the chat: Claude Code opens the browser; a pasted code is the fallback. */
function SignInCard({ chat }: { chat: ReturnType<typeof useDesktopChat> }) {
  const [code, setCode] = useState("");
  const { signIn } = chat;
  const pending = signIn.status === "starting" || signIn.status === "verifying";
  if (signIn.status === "waiting" || signIn.status === "verifying") return <div className="desktop-chat-signin" role="status">
    <p className="desktop-chat-signin-title">Finish signing in with your browser.</p>
    <p>DreamCut continues once you approve. If the page shows a code instead, paste it here.</p>
    <form className="desktop-chat-signin-code" onSubmit={event => { event.preventDefault(); void chat.submitSignInCode(code).then(() => setCode("")); }}>
      <Input aria-label="Sign-in code" placeholder="Paste code" value={code} autoComplete="off" spellCheck={false} disabled={pending} onChange={event => setCode(event.target.value)} />
      <Button type="submit" className="h-10" disabled={pending || !code.trim()}>{signIn.status === "verifying" ? "Checking…" : "Continue"}</Button>
    </form>
    {signIn.message && <p role="alert" className="desktop-chat-signin-error">{signIn.message}</p>}
    <div className="desktop-chat-signin-actions">
      {signIn.url && <a className={buttonVariants({ variant: "ghost", size: "sm" })} href={signIn.url} target="_blank" rel="noreferrer">Open sign-in page<ExternalLink aria-hidden className="size-3.5" /></a>}
      <Button size="sm" variant="ghost" onClick={chat.cancelSignIn}>Cancel</Button>
    </div>
  </div>;
  return <div className="desktop-chat-signin">
    <p className="desktop-chat-signin-title">Sign in to use Claude here.</p>
    {signIn.status === "failed" && signIn.message && <p role="alert" className="desktop-chat-signin-error">{signIn.message}</p>}
    <Button size="sm" disabled={pending} onClick={() => void chat.startSignIn()}>
      {pending ? <><LoaderCircle aria-hidden className="size-3.5 animate-spin" />Opening browser…</> : "Sign in with Claude"}</Button>
  </div>;
}

/** Cardboard-style agent and model choice: one quiet chip; the menu lists each agent's models. */
function AgentChip({ chat }: { chat: ReturnType<typeof useDesktopChat> }) {
  const current = chat.models.find(item => item.model === chat.model) ?? chat.models.find(item => item.isDefault);
  const value = `${chat.provider}::${current?.model ?? ""}`;
  return <Select value={value} onValueChange={next => { if (typeof next === "string") chat.choose(next); }} disabled={chat.busy && !chat.connecting}>
    <SelectTrigger variant="chip" aria-label={`Model: ${modelLabel(current?.model) ?? modelLabel(chat.knownModel) ?? current?.label ?? chat.providerLabel}`} title="Choose the model">
      <AgentMark provider={chat.provider} className="size-3.5 shrink-0" />
      <span className="truncate">{modelLabel(current?.model) ?? modelLabel(chat.knownModel) ?? current?.label ?? chat.providerLabel}</span>
    </SelectTrigger>
    <SelectContent side="top" align="end" className="w-auto min-w-56">
      {chat.providers.map((item, index) => {
        const models = chat.catalogs[item.provider] ?? [];
        return <SelectGroup key={item.provider}>
          {index > 0 && <SelectSeparator />}
          <SelectLabel className="flex items-center gap-1.5"><AgentMark provider={item.provider} className="size-3 shrink-0" />{item.provider === "codex" ? "GPT" : item.label}{!item.available ? " · not installed" : item.authentication === "signed-out" ? " · signed out" : ""}</SelectLabel>
          {item.available && models.length
            ? models.map(model => <SelectItem key={model.model} value={`${item.provider}::${model.model}`}>{modelLabel(model.model) ?? (item.provider === chat.provider && chat.knownModel ? `${model.label} · ${modelLabel(chat.knownModel)}` : model.label)}</SelectItem>)
            : <SelectItem value={`${item.provider}::`} disabled={!item.available}>{item.available ? `Use ${item.label}` : "Install to use"}</SelectItem>}
        </SelectGroup>;
      })}
    </SelectContent>
  </Select>;
}
