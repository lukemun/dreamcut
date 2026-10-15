import { readProposalTuning } from "@/lib/local-store/proposal-tuning";
import { z } from "zod";

import {
  proposalOption,
  timelineRevision,
  validateEditorAgentProposalAgainstProject,
  type EditorAgentOption,
} from "@/lib/agent/timeline-editor-agent-apply";
import {
  applyProposalNumericOverrides,
  proposalNumericOverridesSchema,
  type ProposalNumericOverride,
} from "@/lib/agent/proposal-overrides";
import { evaluateProposalStaleness } from "@/lib/agent/proposal-staleness";
import { assertWaveStepOpen } from "@/lib/agent/proposal-waves";
import { readProposal, type ProposalRecord } from "@/lib/local-store/proposals";
import { readMetadata, readTimeline } from "@/lib/local-store/store";

export const proposalBatchSelectionsSchema = z.array(z.object({
  proposal_id: z.string().min(1).max(128),
  option_id: z.string().min(1).max(128),
  overrides: proposalNumericOverridesSchema.optional(),
}).strict()).min(1).max(100);

export type ProposalBatchSelection = z.infer<typeof proposalBatchSelectionsSchema>[number];

export type ResolvedProposalBatchItem = {
  record: ProposalRecord;
  option: EditorAgentOption;
  overrides: ProposalNumericOverride[];
};

function optionReplacesCaptions(option: EditorAgentOption) {
  return option.operations.some((operation) => operation.replace_captions != null);
}

function optionTargetsLiveCaption(option: EditorAgentOption, timeline: ReturnType<typeof readTimeline>) {
  return option.operations.some((operation) => (
    operation.replace_captions != null
    || timeline.elements.some((element) => (
      element.id === operation.element_id
      && element.removed_at == null
      && element.type === "caption_text"
    ))
  ));
}

export function assertProposalBatchCompatible(
  items: readonly ResolvedProposalBatchItem[],
  timeline: ReturnType<typeof readTimeline>,
) {
  for (let leftIndex = 0; leftIndex < items.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < items.length; rightIndex += 1) {
      const left = items[leftIndex]!.option;
      const right = items[rightIndex]!.option;
      if (
        (optionReplacesCaptions(left) && optionTargetsLiveCaption(right, timeline))
        || (optionReplacesCaptions(right) && optionTargetsLiveCaption(left, timeline))
      ) {
        throw Object.assign(
          new Error("These selected edits contain competing caption treatments. Select one caption proposal at a time."),
          { status: 409 },
        );
      }
    }
  }
}

export function resolveProposalBatch(
  projectId: string,
  input: unknown,
): { revision: string; items: ResolvedProposalBatchItem[] } {
  const selections = proposalBatchSelectionsSchema.parse(input);
  const seen = new Set<string>();
  const timeline = readTimeline(projectId);
  const laneOrderKeys = readMetadata(projectId).lane_order_keys;
  const revision = timelineRevision(projectId);
  const items = selections.map((selection) => {
    if (seen.has(selection.proposal_id)) throw new Error("Choose at most one option from each proposal");
    seen.add(selection.proposal_id);
    const record = readProposal(projectId, selection.proposal_id);
    if (record.status !== "pending") {
      throw Object.assign(new Error(`Proposal ${selection.proposal_id} is already ${record.status}`), { status: 409 });
    }
    assertWaveStepOpen(projectId, record);
    const staleness = evaluateProposalStaleness(record, timeline, revision, laneOrderKeys);
    if (staleness.stale) {
      throw Object.assign(new Error(staleness.reason ?? `Proposal ${selection.proposal_id} is out of date`), { status: 409 });
    }
    const selected = proposalOption(record.proposal, selection.option_id);
    const overrides = selection.overrides ?? readProposalTuning(projectId, selection.proposal_id)[selection.option_id] ?? [];
    const option = applyProposalNumericOverrides(selected, overrides, timeline);
    validateEditorAgentProposalAgainstProject({
      ...record.proposal,
      expected_revision: revision,
      caps: {
        ...record.proposal.caps,
        requested_mutations: option.requested_mutations,
      },
      options: [{ ...option, recommended: true }],
    }, record.proposal.caps.max_mutations, projectId);
    return { record, option, overrides };
  });
  assertProposalBatchCompatible(items, timeline);
  return { revision, items };
}
