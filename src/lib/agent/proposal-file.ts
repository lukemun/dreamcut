import { editorAgentProposalSchema } from "@/lib/agent/timeline-editor-agent-apply";

/**
 * The proposal in a file given to a preview script: either the proposal itself or a stored record
 * from a project's proposals/ folder (`{ proposal_id, status, proposal, ... }`).
 */
export function parseProposalFile(raw: unknown) {
  const record = raw as { proposal_id?: unknown; proposal?: unknown } | null;
  const proposal = record && typeof record === "object" && typeof record.proposal_id === "string" && record.proposal ? record.proposal : raw;
  return editorAgentProposalSchema.parse(proposal);
}
