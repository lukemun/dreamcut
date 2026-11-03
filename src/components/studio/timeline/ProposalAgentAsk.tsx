"use client";

import { useState } from "react";
import { CheckIcon, ClipboardCopyIcon, MessageSquareIcon, PencilLineIcon, WrenchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AgentAsk } from "@/components/desktop/ProjectReviewDock";
import type { ProposalAgentRequest, TimelineClient } from "./timeline-client";

const ACTION = "h-7 shrink-0 rounded-md bg-[var(--glass-field)] px-2.5 text-xs text-[var(--ink)] hover:bg-[var(--chrome-raised)] hover:text-[var(--ink)]";

/**
 * Repair (a card that no longer applies) or Draft (a request with no card yet). Pressing it
 * shows the exact request for the agent, with Copy and where to paste it, so the creator
 * sees what is asked and runs it in a chat they can watch (Claude Code, Codex). With the
 * editor's Chat beside the panel, Send to chat posts it there instead. Either way it is also
 * recorded, so an agent finds it in proposal_list. The answer is a new card to review.
 */
export function ProposalAgentAsk({ kind, targetId, label, recorded, client, onAskAgent }: {
  kind: ProposalAgentRequest["kind"];
  targetId: string;
  /** The card summary or request line, shown in the chat beside the message. */
  label: string;
  recorded?: ProposalAgentRequest | null;
  client: Pick<TimelineClient, "requestAgentWork">;
  onAskAgent?: (ask: AgentAsk) => void;
}) {
  const [request, setRequest] = useState<ProposalAgentRequest | null>(null);
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState<"copied" | "sent" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const verb = kind === "repair" ? "Repair" : "Draft";

  async function open() {
    if (request) { setRequest(null); return; }
    setWorking(true); setError(null); setDone(null);
    try { setRequest(await client.requestAgentWork(kind, targetId)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : `Could not prepare the ${verb.toLowerCase()} request.`); }
    finally { setWorking(false); }
  }

  async function copy() {
    if (!request) return;
    try { await navigator.clipboard.writeText(request.prompt); setDone("copied"); }
    catch { setError("Could not copy. Select the text and copy it."); }
  }

  const status = error ?? (!request && recorded ? `${verb} requested` : !request && kind === "draft" ? "Not drafted yet" : null);
  return (
    <span className="flex min-w-0 flex-1 basis-full flex-col gap-2">
      <span className="flex min-w-0 items-center justify-end gap-2">
        {status ? <span role={error ? "alert" : "status"} className={`min-w-0 truncate text-xs ${error ? "text-[var(--editor-destructive-ink)]" : "text-[var(--ink-muted)]"}`} title={status}>{status}</span> : null}
        <Button size="sm" variant="ghost" className={ACTION} disabled={working} aria-expanded={request != null} onClick={() => void open()}>
          {kind === "repair" ? <WrenchIcon data-icon="inline-start" /> : <PencilLineIcon data-icon="inline-start" />}
          {verb}
        </Button>
      </span>
      {request ? (
        <span className="flex min-w-0 flex-col gap-2 text-[var(--ink)]">
          <span className="text-xs text-[var(--ink-secondary)]">Paste this into your Claude Code or Codex chat:</span>
          <textarea readOnly value={request.prompt} aria-label={`${verb} request`} rows={6}
            className="w-full resize-y rounded-md bg-[var(--glass-field)] p-2 font-mono text-[11px] leading-4 text-[var(--ink)]"
            onFocus={(event) => event.currentTarget.select()} />
          <span className="flex items-center gap-2">
            <Button size="sm" variant="ghost" className={ACTION} onClick={() => void copy()}>
              {done === "copied" ? <CheckIcon data-icon="inline-start" /> : <ClipboardCopyIcon data-icon="inline-start" />}
              {done === "copied" ? "Copied" : "Copy"}
            </Button>
            {onAskAgent ? (
              <Button size="sm" variant="ghost" className={ACTION} disabled={done === "sent"} onClick={() => {
                onAskAgent({ id: `${targetId}:${request.requested_at}`, text: request.prompt, display: `${verb}: ${label}`, label });
                setDone("sent");
              }}>
                <MessageSquareIcon data-icon="inline-start" />{done === "sent" ? "Sent to chat" : "Send to chat"}
              </Button>
            ) : null}
          </span>
        </span>
      ) : null}
    </span>
  );
}
