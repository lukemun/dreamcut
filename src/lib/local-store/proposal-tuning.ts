import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { readProposal } from "./proposals";
import { projectProposalPath } from "./paths";
import { writeJsonFileAtomic } from "./atomic-json";
import { readTimeline, withProjectLock } from "./store";
import { safeActivityOutcome } from "../observability/activity-journal";
import { applyProposalReviewOverrides, proposalNumericOverridesSchema } from "../agent/proposal-overrides";
import { previewEditorAgentProposal, proposalOption } from "../agent/timeline-editor-agent-apply";

const tuningSchema = z.record(z.string(), proposalNumericOverridesSchema);
export type ProposalTuning = z.infer<typeof tuningSchema>;

function tuningPath(projectId: string, proposalId: string) {
  return path.join(path.dirname(projectProposalPath(projectId, proposalId)), "tuning", `${proposalId}.json`);
}

// Separate review state: saving a dial never changes proposal authorship or approval.
export function readProposalTuning(projectId: string, proposalId: string): ProposalTuning {
  readProposal(projectId, proposalId); // validates both IDs and existence
  const file = tuningPath(projectId, proposalId);
  if (!fs.existsSync(file)) return {};
  return tuningSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")));
}

export async function saveProposalTuning(projectId: string, proposalId: string, optionId: string, input: unknown) {
  return withProjectLock(projectId, () => {
    const record = readProposal(projectId, proposalId);
    if (record.status !== "pending") throw Object.assign(new Error("This edit is already resolved"), { status: 409 });
    proposalOption(record.proposal, optionId);
    const overrides = proposalNumericOverridesSchema.parse(input);
    const baseline = applyProposalReviewOverrides(record.proposal, optionId, overrides, readTimeline(projectId));
    const preview = previewEditorAgentProposal(baseline, optionId);
    if (preview.stale) throw Object.assign(new Error("This edit is out of date"), { status: 409 });
    const tuning = { ...readProposalTuning(projectId, proposalId), [optionId]: overrides };
    writeJsonFileAtomic(tuningPath(projectId, proposalId), tuning);
    // Saved intermediate dial values, which approval alone would not show.
    safeActivityOutcome({ project_id: projectId, proposal_id: proposalId, event: "tuned", option_id: optionId, data: { overrides } });
    return tuning;
  });
}

export function tunedProposalBaseline(record: ReturnType<typeof readProposal>, tuning: ProposalTuning) {
  const timeline = Object.keys(tuning).length ? readTimeline(record.proposal.project_id) : undefined;
  return Object.entries(tuning).reduce((proposal, [optionId, overrides]) =>
    applyProposalReviewOverrides(proposal, optionId, overrides, timeline), record.proposal);
}
