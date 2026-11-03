import fs from "node:fs";
import path from "node:path";
import { z } from "zod";
import { readProposal } from "./proposals";
import { projectProposalPath } from "./paths";
import { writeJsonFileAtomic } from "./atomic-json";
import { readTimeline, withProjectLock } from "./store";
import { safeActivityOutcome } from "../observability/activity-journal";
import { safeMemoryEvent } from "./editing-memory";
import { applyProposalReviewOverrides, proposalNumericOverridesSchema } from "../agent/proposal-overrides";
import { previewEditorAgentProposal, proposalOption, timelineRevision } from "../agent/timeline-editor-agent-apply";
import {createHash} from 'node:crypto';
import {proposalTuningWriteSchema, type ProposalTuningWrite} from '../agent/proposal-tuning-write';

const tuningSchema = z.record(z.string(), proposalNumericOverridesSchema);
export type ProposalTuning = z.infer<typeof tuningSchema>;
const documentSchema = z.object({
  schema_version: z.literal(2), tuning: tuningSchema,
  writes: z.record(z.string(), z.object({sequence:z.number().int().positive(), hash:z.string()})),
}).strict();
type TuningDocument = z.infer<typeof documentSchema>;

function tuningPath(projectId: string, proposalId: string) {
  return path.join(path.dirname(projectProposalPath(projectId, proposalId)), "tuning", `${proposalId}.json`);
}

// Separate review state: saving a dial never changes proposal authorship or approval.
function readTuningDocument(projectId: string, proposalId: string): TuningDocument {
  readProposal(projectId, proposalId); // validates both IDs and existence
  const file = tuningPath(projectId, proposalId);
  if (!fs.existsSync(file)) return {schema_version:2, tuning:{}, writes:{}};
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return raw.schema_version === 2 ? documentSchema.parse(raw) : {schema_version:2, tuning:tuningSchema.parse(raw), writes:{}};
}

export function readProposalTuning(projectId: string, proposalId: string): ProposalTuning {
  return readTuningDocument(projectId, proposalId).tuning;
}

export async function saveProposalTuning(projectId: string, proposalId: string, optionId: string, input: unknown, write?: ProposalTuningWrite) {
  return withProjectLock(projectId, () => {
    const record = readProposal(projectId, proposalId);
    if (record.status !== "pending") throw Object.assign(new Error("This edit is already resolved"), { status: 409 });
    proposalOption(record.proposal, optionId);
    const overrides = proposalNumericOverridesSchema.parse(input);
    const document = readTuningDocument(projectId, proposalId);
    const stamp = write && proposalTuningWriteSchema.parse(write);
    const writerKey = stamp && JSON.stringify([optionId, stamp.client_id]);
    const hash = createHash('sha256').update(JSON.stringify(overrides)).digest('hex');
    const previous = writerKey && document.writes[writerKey];
    if (stamp && previous && stamp.sequence <= previous.sequence) {
      if (stamp.sequence === previous.sequence && hash !== previous.hash) throw Object.assign(new Error('This review write was already used'), {status:409});
      return document.tuning;
    }
    if (stamp && stamp.expected_revision !== timelineRevision(projectId)) throw Object.assign(new Error('This timeline changed before the adjustments were saved'), {status:409});
    const baseline = applyProposalReviewOverrides(record.proposal, optionId, overrides, readTimeline(projectId));
    const preview = previewEditorAgentProposal(baseline, optionId);
    if (preview.stale) throw Object.assign(new Error("This edit is out of date"), { status: 409 });
    const tuning = { ...document.tuning, [optionId]: overrides };
    if (stamp && writerKey) document.writes[writerKey] = {sequence:stamp.sequence, hash};
    // Intent and ordering metadata commit atomically; old files remain readable.
    writeJsonFileAtomic(tuningPath(projectId, proposalId), Object.keys(document.writes).length ? {...document, tuning} : tuning);
    // Saved intermediate dial values, which approval alone would not show.
    safeActivityOutcome({ project_id: projectId, proposal_id: proposalId, event: "tuned", option_id: optionId, data: { overrides } });
    safeMemoryEvent(projectId, { type: "proposal.tuned", actor: "human", summary: "Adjusted proposal controls",
      evidence: proposalId, data: { proposal_ids: [proposalId], option_id: optionId, overrides } });
    return tuning;
  });
}

export function tunedProposalBaseline(record: ReturnType<typeof readProposal>, tuning: ProposalTuning) {
  const timeline = Object.keys(tuning).length ? readTimeline(record.proposal.project_id) : undefined;
  return Object.entries(tuning).reduce((proposal, [optionId, overrides]) =>
    applyProposalReviewOverrides(proposal, optionId, overrides, timeline), record.proposal);
}
