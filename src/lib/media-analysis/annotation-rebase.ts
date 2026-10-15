import { boxIou, type AnonymousTrack } from "./semantic-tracks";

export type TrackReference = { analysis_revision: string; track_id: string };

export type HumanTrackDecision = {
  decision_id: string;
  track_ref: TrackReference;
  kind: "alias" | "role";
  value: string;
  interval?: [number, number];
  confirmed_by: "human";
};

export type AnnotationRebaseCandidate = {
  track_ref: TrackReference;
  score: number;
  temporal_overlap: number;
  mean_sample_iou: number;
};

export type AnnotationRebaseProposal = {
  decision: HumanTrackDecision;
  status: "proposed" | "needs_review" | "orphaned";
  /** Even an exact proposal remains untrusted until a human accepts it. */
  confirmation_required: true;
  proposed_track_ref: TrackReference | null;
  candidates: AnnotationRebaseCandidate[];
  reason: string;
};

const precise = (value: number) => Number(value.toFixed(6));

function overlapRatio(a: AnonymousTrack, b: AnonymousTrack): number {
  const intersection = Math.max(0, Math.min(a.end_seconds, b.end_seconds) - Math.max(a.start_seconds, b.start_seconds));
  const union = Math.max(a.end_seconds, b.end_seconds) - Math.min(a.start_seconds, b.start_seconds);
  if (union === 0) return a.start_seconds === b.start_seconds ? 1 : 0;
  return intersection / union;
}

function meanSampleIou(a: AnonymousTrack, b: AnonymousTrack, toleranceSeconds: number): number {
  const values: number[] = [];
  for (const sample of a.samples) {
    const nearest = [...b.samples]
      .filter((candidate) => Math.abs(candidate.time_seconds - sample.time_seconds) <= toleranceSeconds)
      .sort((left, right) => Math.abs(left.time_seconds - sample.time_seconds) - Math.abs(right.time_seconds - sample.time_seconds)
        || left.time_seconds - right.time_seconds
        || left.detection_id.localeCompare(right.detection_id))[0];
    if (nearest) values.push(boxIou(sample.box, nearest.box));
  }
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function candidateFor(oldTrack: AnonymousTrack, newTrack: AnonymousTrack, toleranceSeconds: number): AnnotationRebaseCandidate {
  const temporal = overlapRatio(oldTrack, newTrack);
  const spatial = meanSampleIou(oldTrack, newTrack, toleranceSeconds);
  return {
    track_ref: { analysis_revision: newTrack.analysis_revision, track_id: newTrack.track_id },
    score: precise(temporal * 0.35 + spatial * 0.65),
    temporal_overlap: precise(temporal),
    mean_sample_iou: precise(spatial),
  };
}

/**
 * Produces review proposals without mutating or confirming durable annotations.
 * Names/roles originate exclusively in the supplied human decisions.
 */
export function proposeAnnotationRebase(input: {
  decisions: HumanTrackDecision[];
  previous_tracks: AnonymousTrack[];
  next_tracks: AnonymousTrack[];
  min_proposal_score?: number;
  ambiguity_margin?: number;
  sample_tolerance_seconds?: number;
}): AnnotationRebaseProposal[] {
  const minScore = input.min_proposal_score ?? 0.7;
  const margin = input.ambiguity_margin ?? 0.12;
  const tolerance = input.sample_tolerance_seconds ?? 0.2;
  const previousByRef = new Map(input.previous_tracks.map((track) => [`${track.analysis_revision}:${track.track_id}`, track]));

  const ranked = input.decisions.map((decision) => {
    const oldTrack = previousByRef.get(`${decision.track_ref.analysis_revision}:${decision.track_ref.track_id}`);
    if (!oldTrack) return { decision, oldTrack: null, candidates: [] as AnnotationRebaseCandidate[] };
    const candidates = input.next_tracks
      .filter((track) => track.label === oldTrack.label)
      .map((track) => candidateFor(oldTrack, track, tolerance))
      .filter((candidate) => candidate.temporal_overlap > 0 || candidate.mean_sample_iou > 0)
      .sort((a, b) => b.score - a.score || a.track_ref.track_id.localeCompare(b.track_ref.track_id));
    return { decision, oldTrack, candidates };
  });

  const strongTargetSources = new Map<string, Set<string>>();
  for (const item of ranked) {
    const best = item.candidates[0];
    const second = item.candidates[1];
    if (best && best.score >= minScore && (!second || best.score - second.score >= margin)) {
      const key = `${best.track_ref.analysis_revision}:${best.track_ref.track_id}`;
      const sourceKey = `${item.decision.track_ref.analysis_revision}:${item.decision.track_ref.track_id}`;
      const sources = strongTargetSources.get(key) ?? new Set<string>();
      sources.add(sourceKey);
      strongTargetSources.set(key, sources);
    }
  }

  return ranked.map(({ decision, oldTrack, candidates }): AnnotationRebaseProposal => {
    if (!oldTrack) return {
      decision, status: "orphaned", confirmation_required: true, proposed_track_ref: null, candidates,
      reason: "The annotation's prior analysis track is unavailable; the original decision was preserved.",
    };
    const best = candidates[0];
    if (!best) return {
      decision, status: "orphaned", confirmation_required: true, proposed_track_ref: null, candidates,
      reason: "No overlapping anonymous track exists in the new analysis revision.",
    };
    const second = candidates[1];
    const targetKey = `${best.track_ref.analysis_revision}:${best.track_ref.track_id}`;
    const uniquelyStrong = best.score >= minScore
      && (!second || best.score - second.score >= margin)
      && strongTargetSources.get(targetKey)?.size === 1;
    if (!uniquelyStrong) return {
      decision, status: "needs_review", confirmation_required: true, proposed_track_ref: null, candidates,
      reason: best.score < minScore
        ? "No candidate met the high-confidence proposal threshold."
        : "Multiple plausible one-to-one mappings require human review.",
    };
    return {
      decision, status: "proposed", confirmation_required: true, proposed_track_ref: best.track_ref, candidates,
      reason: "A high-confidence one-to-one mapping is available for human confirmation.",
    };
  });
}
