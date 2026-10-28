import { NextResponse } from "next/server";
import { z } from "zod";

import { safeParseJson } from "@/lib/api-helpers";
import { draftPrompt, firstBuildPrompt, repairPrompt } from "@/lib/agent/proposal-agent-request-prompt";
import { refreshPendingProposals } from "@/lib/agent/proposal-refresh";
import { proposalRevisionPresentation } from "@/lib/agent/proposal-revisions";
import { waveStates, waveWaitingMessage } from "@/lib/agent/proposal-waves";
import { memoryEvents } from "@/lib/local-store/editing-memory";
import { AGENT_REQUEST_KINDS, writeAgentRequest } from "@/lib/local-store/proposal-agent-requests";
import { listProposals } from "@/lib/local-store/proposals";
import { waitingFirstBuild } from "@/lib/local-store/home-start";
import { feedbackCoverage } from "@/lib/timeline/editing-feedback";

type Params = { params: Promise<{ projectId: string }> };

const body = z.object({ kind: z.enum(AGENT_REQUEST_KINDS), target_id: z.string().min(1).max(200) }).strict();

const conflict = (message: string) => Object.assign(new Error(message), { status: 409 });

/**
 * POST — the creator asked for a card to be repaired or a recorded request to be drafted.
 * Records the request and returns the message for the creator's chat. It starts no agent and
 * changes no timeline or proposal; the agent answers with an ordinary proposal for review.
 */
export async function POST(request: Request, { params }: Params) {
  try {
    const { projectId } = await params;
    const { kind, target_id } = body.parse(await safeParseJson(request));
    const records = listProposals(projectId);
    let prompt: string;
    if (kind === "repair") {
      const pending = new Map(refreshPendingProposals(projectId).map(result => [result.record.proposal_id, result]));
      const refreshed = pending.get(target_id);
      if (!refreshed) throw conflict("This proposal is no longer waiting for review.");
      const replaced = proposalRevisionPresentation(records.map(record => ({ proposal_id: record.proposal_id, status: record.status, created_at: record.created_at,
        stale: pending.get(record.proposal_id)?.staleness.stale ?? false, summary: record.proposal.summary,
        supersedes_proposal_ids: record.proposal.supersedes_proposal_ids ?? [] }))).find(entry => entry.proposal_id === target_id);
      if (replaced?.replaced_by_pending_proposal_id || replaced?.replaced_by_approved_proposal_id) throw conflict("A newer draft already replaced this proposal.");
      const wave = waveStates(records).get(target_id) ?? null;
      const blocked = wave?.blocked_by.length ? waveWaitingMessage(wave) : null;
      if (!blocked && !refreshed.staleness.stale) throw conflict("This proposal still applies; it needs no repair.");
      prompt = repairPrompt(projectId, {
        proposal_id: target_id,
        summary: refreshed.record.proposal.summary,
        reason: blocked ?? refreshed.staleness.reason,
        wave,
      });
    } else {
      const direction = feedbackCoverage(memoryEvents(projectId), records).directions
        .find(candidate => candidate.id === target_id && !candidate.accounted_for);
      if (!direction) throw conflict("This request already has a proposal or was set aside.");
      // A project started from Home with nothing laid out yet asks for its first cut, not a card.
      prompt = (waitingFirstBuild(projectId) ? firstBuildPrompt : draftPrompt)(projectId, { feedback_id: target_id, direction: direction.direction });
    }
    const saved = writeAgentRequest(projectId, { kind, target_id, requested_at: new Date().toISOString(), prompt });
    return NextResponse.json({ request: saved });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    const status = (error as Error & { status?: number }).status ?? 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not record the request" }, { status });
  }
}
