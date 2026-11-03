import { createHash } from "node:crypto";
import { assertWaveStepOpen } from "@/lib/agent/proposal-waves";
import { applyProposalReviewOverrides } from "@/lib/agent/proposal-overrides";
import { previewEditorAgentProposal, proposalOption } from "@/lib/agent/timeline-editor-agent-apply";
import { projectFrameRate } from "@/lib/timeline/frame-quantization";
import { readProposal } from "./proposals";
import { readProposalTuning } from "./proposal-tuning";
import { activeElements, activeTransitions, readMetadata, readTimelineSnapshot } from "./store";
import { withExportPreviewCadence } from "./export-render-sources";

function conflict(message: string): never {
  throw Object.assign(new Error(message), { status: 409 });
}

/** Capture synchronously under the caller's project lock, before dispatching a job.
 * No hydrated preview proxies or working-cut writes enter this snapshot. */
export function readProposalRenderSnapshot(projectId: string, proposalId: string, optionId: string,
  expected?: { revision: string; fingerprint: string }) {
  const record = readProposal(projectId, proposalId);
  if (record.status !== "pending" || record.resolution) conflict("Only an unresolved pending proposal can be rendered as a preview");
  assertWaveStepOpen(projectId, record);
  if (record.proposal.decision !== "propose") conflict("This proposal has no candidate to render");
  const { revision, timeline: base } = readTimelineSnapshot(projectId);
  if (revision !== record.proposal.expected_revision || (expected && revision !== expected.revision)) {
    conflict("Proposal preview revision changed; read the candidate again before rendering");
  }
  const selected = proposalOption(record.proposal, optionId);
  const overrides = readProposalTuning(projectId, proposalId)[selected.id] ?? [];
  const metadata = readMetadata(projectId);
  const proposal = applyProposalReviewOverrides(record.proposal, selected.id, overrides, base);
  const derived = previewEditorAgentProposal(proposal, selected.id, base);
  const elements = withExportPreviewCadence(projectId, activeElements(derived.timeline));
  // Hash inputs rather than derived rows: newly created rows receive timestamps
  // during derivation. Metadata is included because it is outside timelineRevision.
  const fingerprint = createHash("sha256").update(JSON.stringify({
    version: 1, projectId, proposalId, optionId: selected.id, revision,
    proposal: record.proposal, overrides, metadata,
    previewCadence: elements.map(element => ({ id: element.id, proof: element.props?.preview_proxy_validation })),
  })).digest("hex");
  if (expected && expected.fingerprint !== fingerprint) conflict("Proposal preview settings changed; read the candidate again before rendering");
  // Detach nested props and arrays: the asynchronous renderer must retain this
  // exact candidate even if the user edits or tunes the project while it runs.
  return structuredClone({
    identity: { kind: "unapproved_proposal_preview" as const, proposal_id: proposalId,
      option_id: selected.id, revision, fingerprint },
    composition: {
      elements, transitions: activeTransitions(derived.timeline),
      laneOrderKeys: derived.laneOrderKeys ?? metadata.lane_order_keys,
      mutedLaneKeys: derived.mutedLaneKeys ?? metadata.muted_lane_keys,
      hiddenLaneKeys: metadata.hidden_lane_keys,
      aspectRatio: derived.outputFormat?.aspect_ratio ?? metadata.output_aspect_ratio,
      frameRate: derived.outputFormat?.frame_rate ?? projectFrameRate(metadata),
    },
  });
}

export type ProposalRenderSnapshot = ReturnType<typeof readProposalRenderSnapshot>;
