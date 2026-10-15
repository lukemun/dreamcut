import fs from "node:fs";
import path from "node:path";
import { z } from "zod";

import { writeJsonFileAtomic } from "./atomic-json";
import { projectProposalsDir } from "./paths";

/**
 * Work the creator asked for from the review panel: repair a card that no longer applies, or
 * draft a recorded request that has no card yet. The panel puts the request in a chat the
 * creator can see (the editor's Chat tab, or copied for the chat they are using); this record
 * lets any agent find it through proposal_list too. Kept beside the proposal records as review
 * state, never inside them, so a request changes no proposal authorship or approval. The
 * replacement card is the outcome; the request needs no closing step.
 */

export const AGENT_REQUEST_KINDS = ["repair", "draft"] as const;
export type AgentRequestKind = (typeof AGENT_REQUEST_KINDS)[number];

const requestSchema = z.object({
  kind: z.enum(AGENT_REQUEST_KINDS),
  target_id: z.string().min(1).max(200),
  requested_at: z.string(),
  /** What the agent is asked to do, exactly as the creator's chat received it. */
  prompt: z.string().min(1).max(16000),
});
export type ProposalAgentRequest = z.infer<typeof requestSchema>;

function requestsDir(projectId: string) {
  return path.join(projectProposalsDir(projectId), "agent-requests");
}

function requestPath(projectId: string, targetId: string) {
  const name = targetId.replace(/[^A-Za-z0-9_-]/g, "-");
  if (!name || name.length > 200) throw new Error(`Invalid request target: ${targetId}`);
  return path.join(requestsDir(projectId), `${name}.json`);
}

export function listAgentRequests(projectId: string): Map<string, ProposalAgentRequest> {
  const dir = requestsDir(projectId);
  const requests = new Map<string, ProposalAgentRequest>();
  if (!fs.existsSync(dir)) return requests;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const parsed = requestSchema.safeParse(JSON.parse(fs.readFileSync(path.join(dir, name), "utf8")));
      if (parsed.success) requests.set(parsed.data.target_id, parsed.data);
    } catch { /* A torn sidecar never takes the inbox down. */ }
  }
  return requests;
}

export function writeAgentRequest(projectId: string, request: ProposalAgentRequest) {
  const parsed = requestSchema.parse(request);
  fs.mkdirSync(requestsDir(projectId), { recursive: true });
  writeJsonFileAtomic(requestPath(projectId, parsed.target_id), parsed);
  return parsed;
}
