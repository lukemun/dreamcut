import { createHash } from "node:crypto";

import { validateEditorAgentProposalAgainstProject, type LiveOptionDerivation } from "@/lib/agent/timeline-editor-agent-apply";
import { proposalOptionDerivationKey, type ProposalOptionDerivations } from "@/lib/agent/proposal-detail";
import {
  evaluateProposalStaleness,
  proposalElementFingerprints,
  type ProposalStaleness,
} from "@/lib/agent/proposal-staleness";
import {
  listProposals,
  rebasePendingProposal,
  type ProposalRecord,
} from "@/lib/local-store/proposals";
import { readMetadata, readTimelineSnapshot, type TimelineFile } from "@/lib/local-store/store";
import { waveStates } from "@/lib/agent/proposal-waves";
import { projectInputsKey } from "@/lib/local-store/poll-cache";
import { preparationRecordsKey } from "@/lib/local-store/media-preparation";

/**
 * Keep pending proposals usable across human edits.
 *
 * Rebasing used to happen only when ANOTHER proposal was approved, never when a
 * person edited the timeline — so ordinary editing silently stranded every
 * pending proposal on a dead revision. This runs on READ instead (the review
 * drawer's poll), which keeps it lazy and off the write path.
 *
 * A proposal is only moved forward when BOTH hold:
 *   1. no element it touches changed (element-scoped staleness), and
 *   2. it still validates against the current project — the same dry-run every
 *      option gets at create time, so an option that can no longer apply is
 *      left behind rather than silently carried onto a revision it will 409 on.
 */

export type RefreshedProposal = {
  record: ProposalRecord;
  staleness: ProposalStaleness;
  rebased: boolean;
  /**
   * Each option as this refresh's validation derived it onto the snapshot (`revision`), when validation
   * ran (a cached verdict derives nothing) and passed. Read-only: frozen own rows, shared untouched rows.
   */
  derivations?: { revision: string; options: LiveOptionDerivation[] };
};

/** The refresh's derives keyed for `proposalReviewDetail`, which reuses those made onto its own timeline. */
export function refreshedOptionDerivations(refreshed: readonly RefreshedProposal[]): ProposalOptionDerivations {
  const byKey = new Map<string, LiveOptionDerivation>();
  for (const { record, derivations } of refreshed) {
    for (const derivation of derivations?.options ?? []) {
      byKey.set(proposalOptionDerivationKey(record.proposal_id, derivation.option.id, derivations!.revision), derivation);
    }
  }
  return byKey;
}

// The dry-run validation of a card depends on the card and on the project around it (timeline,
// metadata, media and its preparation records). Cards, feedback memory and history are left out of the
// project key, so a poll that follows a tuning or a new card re-validates only the card that changed.
// The poll key skips preparation scratch, so its records are added back: a card refused while a clip
// was preparing validates again once it is ready.
const validations = new Map<string, string | null>();
const MAX_VALIDATIONS = 512;

// Every card validates against the one timeline read the refresh rebases onto (`timeline`), rather
// than re-reading and re-parsing the whole file per card. Validation only reads it, and only reads its
// derives ("read_only": no copy), which are kept for review detail when the card validates. Nothing
// stored (the rebased record, its fingerprints) comes from a derive.
function validationError(projectId: string, candidate: ProposalRecord["proposal"], projectKey: string, timeline: TimelineFile):
  { error: string | null; derivations?: LiveOptionDerivation[] } {
  const key = createHash("sha1").update(JSON.stringify([projectId, projectKey, candidate])).digest("base64url");
  if (validations.has(key)) return { error: validations.get(key)! };
  let error: string | null = null;
  const derivations: LiveOptionDerivation[] = [];
  try {
    validateEditorAgentProposalAgainstProject(candidate, candidate.caps.max_mutations, projectId, timeline,
      (derivation) => { derivations.push(derivation); }, "read_only");
  } catch (caught) {
    // Still applies to its own clips, but no longer derives cleanly against
    // the newer timeline. Surface it as stale with the validator's reason.
    error = caught instanceof Error ? `No longer applies: ${caught.message}` : "No longer applies to the current timeline.";
  }
  validations.set(key, error);
  if (validations.size > MAX_VALIDATIONS) validations.delete(validations.keys().next().value!);
  return error ? { error } : { error, derivations };
}

/**
 * `snapshot`: the project's timeline read once (`readTimelineSnapshot`) when the caller already holds it,
 * so the inbox route reports staleness and detail against the same read the cards were rebased onto.
 */
export function refreshPendingProposals(
  projectId: string,
  snapshot: { revision: string; timeline: TimelineFile } = readTimelineSnapshot(projectId),
): RefreshedProposal[] {
  // One read gives both the revision and the parsed timeline, so a card is validated against exactly
  // the revision it is moved onto.
  const { revision, timeline } = snapshot;
  const metadata = readMetadata(projectId);
  const laneOrderKeys = metadata.lane_order_keys;
  const projectKey = `${projectInputsKey(projectId, [], ["proposals", "memory", "history"])}:${preparationRecordsKey(projectId)}`;

  const records = listProposals(projectId);
  const waves = waveStates(records);
  return records.filter((record) => record.status === "pending").map((record) => {
    // A wave step still waiting on earlier steps was drafted on top of them; it cannot
    // validate against the live timeline until they are approved, and is not stale for that.
    const wave = waves.get(record.proposal_id);
    if (wave?.waiting_for.length || wave?.blocked_by.length) {
      return { record, staleness: { stale: false, rebasable: false, reason: null }, rebased: false };
    }
    const staleness = evaluateProposalStaleness(record, timeline, revision, laneOrderKeys);
    if (staleness.stale) return { record, staleness, rebased: false };

    const candidate = { ...record.proposal, expected_revision: revision };
    const { error, derivations: options } = validationError(projectId, candidate, projectKey, timeline);
    if (error) return { record, staleness: { stale: true, rebasable: false, reason: error }, rebased: false };
    const derivations = options ? { derivations: { revision, options } } : {};

    // Even a proposal already carrying the live revision can become unsafe
    // when a sibling approval rebases it without changing its create-only
    // element ids. Re-run the full dry-run before reporting it actionable.
    if (!staleness.rebasable) return { record, staleness, rebased: false, ...derivations };

    const next = rebasePendingProposal(
      projectId,
      record.proposal_id,
      revision,
      proposalElementFingerprints(timeline, candidate),
    );
    return {
      record: next,
      staleness: { stale: false, rebasable: false, reason: null },
      rebased: true,
      ...derivations,
    };
  });
}
