import {
  projectSourceToComposition,
  projectVisibleNormalizedSourceBox,
  type ProjectionRect,
  type SourceProjectionInput,
} from "../timeline/source-projection";
import type { HumanTrackDecision, TrackReference } from "./annotation-rebase";
import type { AnonymousTrack, TrackSample } from "./semantic-tracks";

export type SemanticEvidenceStatus = "complete" | "partial" | "stale" | "unavailable";

export type FocalRegion = {
  track_ref: TrackReference;
  shot_id: string;
  kind: AnonymousTrack["label"];
  time_seconds: number;
  box: ProjectionRect;
  confidence: number;
  confirmed_subject_id: string | null;
  confirmed_primary: boolean;
};

export type FocalRegionsResult = {
  status: "complete" | "partial" | "unknown";
  reason: string | null;
  interval: [number, number];
  regions: FocalRegion[];
  gaps: Array<{ track_ref: TrackReference; start_seconds: number; end_seconds: number }>;
};

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return Math.min(aEnd, bEnd) >= Math.max(aStart, bStart);
}

function decisionApplies(decision: HumanTrackDecision, track: AnonymousTrack, time: number): boolean {
  return decision.confirmed_by === "human"
    && decision.track_ref.analysis_revision === track.analysis_revision
    && decision.track_ref.track_id === track.track_id
    && (!decision.interval || (time >= decision.interval[0] && time <= decision.interval[1]));
}

function intervalSamples(track: AnonymousTrack, start: number, end: number): TrackSample[] {
  const inside = track.samples.filter((sample) => sample.time_seconds >= start && sample.time_seconds <= end);
  // Include the nearest real observations bracketing the interval. This grows the
  // conservative union without fabricating an interpolated observation.
  const before = [...track.samples].filter((sample) => sample.time_seconds < start).at(-1);
  const after = track.samples.find((sample) => sample.time_seconds > end);
  return [...new Map([before, ...inside, after].filter((sample): sample is TrackSample => Boolean(sample))
    .map((sample) => [sample.detection_id, sample])).values()]
    .sort((a, b) => a.time_seconds - b.time_seconds || a.detection_id.localeCompare(b.detection_id));
}

export function focalRegions(input: {
  interval: [number, number];
  evidence_status: SemanticEvidenceStatus;
  tracks: AnonymousTrack[];
  confirmed_decisions?: HumanTrackDecision[];
  max_observation_gap_seconds?: number;
}): FocalRegionsResult {
  const [start, end] = input.interval;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start) throw new Error("Invalid focal-region interval");
  if (input.evidence_status === "stale" || input.evidence_status === "unavailable") {
    return { status: "unknown", reason: `Visual-track evidence is ${input.evidence_status}.`, interval: input.interval, regions: [], gaps: [] };
  }
  const decisions = input.confirmed_decisions ?? [];
  const relevant = input.tracks
    .filter((track) => overlaps(track.start_seconds, track.end_seconds, start, end))
    .sort((a, b) => a.start_seconds - b.start_seconds || a.track_id.localeCompare(b.track_id));
  const regions: FocalRegion[] = [];
  const gaps: FocalRegionsResult["gaps"] = [];
  const maxGap = input.max_observation_gap_seconds ?? 0.75;
  for (const track of relevant) {
    const samples = intervalSamples(track, start, end);
    for (const sample of samples) {
      const aliases = decisions.filter((decision) => decision.kind === "alias" && decisionApplies(decision, track, sample.time_seconds));
      const roles = decisions.filter((decision) => decision.kind === "role" && decisionApplies(decision, track, sample.time_seconds));
      regions.push({
        track_ref: { analysis_revision: track.analysis_revision, track_id: track.track_id },
        shot_id: track.shot_id,
        kind: track.label,
        time_seconds: sample.time_seconds,
        box: sample.box,
        confidence: sample.confidence,
        confirmed_subject_id: aliases[0]?.value ?? null,
        confirmed_primary: roles.some((decision) => decision.value === "primary_subject"),
      });
    }
    for (let index = 1; index < samples.length; index += 1) {
      const left = samples[index - 1]!;
      const right = samples[index]!;
      if (right.time_seconds - left.time_seconds > maxGap) gaps.push({
        track_ref: { analysis_revision: track.analysis_revision, track_id: track.track_id },
        start_seconds: Math.max(start, left.time_seconds),
        end_seconds: Math.min(end, right.time_seconds),
      });
    }
  }
  const partial = input.evidence_status === "partial" || gaps.length > 0 || relevant.length === 0;
  return {
    status: partial ? "partial" : "complete",
    reason: relevant.length === 0 ? "No observation coverage is established by an empty set of tracks." : input.evidence_status === "partial"
      ? "Visual-track analysis is partial."
      : gaps.length > 0 ? "One or more relevant tracks contain an unobserved gap." : null,
    interval: input.interval,
    regions,
    gaps,
  };
}

type StaticProjectionInput = Omit<SourceProjectionInput, "timeline_time_seconds">;

export type CaptionQueryLayer = {
  layer_id: string;
  visible_timeline_interval: [number, number];
  opacity_evidence: "known_visible" | "known_hidden" | "unknown";
  evidence_status: SemanticEvidenceStatus;
  tracks: AnonymousTrack[];
  confirmed_decisions?: HumanTrackDecision[];
  /** Transform properties must already be resolved for this cue interval. */
  projection: StaticProjectionInput;
};

export type CaptionRegionCandidate = {
  candidate_id: string;
  /** Exact measured caption footprint in composition pixels. */
  rect: ProjectionRect;
  contrast: { status: "measured" | "unknown"; minimum_ratio: number | null; texture_score: number | null };
};

export type RankedCaptionRegion = CaptionRegionCandidate & {
  score: number;
  minimum_focal_distance: number;
};

export type CaptionRegionRankingResult = {
  status: "ranked" | "unknown" | "no_clear_region";
  reason: string | null;
  ranked: RankedCaptionRegion[];
  exclusion_regions: Array<{ layer_id: string; track_ref: TrackReference; rect: ProjectionRect }>;
};

function rectArea(rect: ProjectionRect): number {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function containedBy(inner: ProjectionRect, outer: ProjectionRect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

function padded(rect: ProjectionRect, amount: number): ProjectionRect {
  return { x: rect.x - amount, y: rect.y - amount, width: rect.width + amount * 2, height: rect.height + amount * 2 };
}

function intersects(a: ProjectionRect, b: ProjectionRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function rectDistance(a: ProjectionRect, b: ProjectionRect): number {
  const ax = a.x + a.width / 2;
  const ay = a.y + a.height / 2;
  const bx = b.x + b.width / 2;
  const by = b.y + b.height / 2;
  return Math.hypot(ax - bx, ay - by);
}

function sourceTimeToTimelineTime(sourceTime: number, projection: StaticProjectionInput): number {
  const rate = projection.playback_rate && projection.playback_rate > 0 ? projection.playback_rate : 1;
  return projection.timeline_start_seconds + (sourceTime - (projection.source_trim_start_seconds ?? 0)) / rate;
}

/**
 * Ranks only evidence-backed caption candidates. This function never chooses a
 * final caption placement and never treats missing analysis as clear space.
 */
export function rankCaptionRegions(input: {
  cue_interval: [number, number];
  composition: { width: number; height: number };
  safe_rect: ProjectionRect;
  font_measurement: "exact" | "estimated" | "missing";
  candidates: CaptionRegionCandidate[];
  layers: CaptionQueryLayer[];
  focal_padding_px?: number;
  minimum_contrast_ratio?: number;
}): CaptionRegionRankingResult {
  const [cueStart, cueEnd] = input.cue_interval;
  if (cueEnd < cueStart || cueStart < 0) throw new Error("Invalid caption cue interval");
  if (input.font_measurement !== "exact") return {
    status: "unknown", reason: "Exact loaded-font caption bounds are required.", ranked: [], exclusion_regions: [],
  };
  const exclusions: CaptionRegionRankingResult["exclusion_regions"] = [];
  for (const layer of [...input.layers].sort((a, b) => a.layer_id.localeCompare(b.layer_id))) {
    if (!overlaps(layer.visible_timeline_interval[0], layer.visible_timeline_interval[1], cueStart, cueEnd)) continue;
    const midpoint = (Math.max(cueStart, layer.visible_timeline_interval[0]) + Math.min(cueEnd, layer.visible_timeline_interval[1])) / 2;
    const midpointProjection = projectSourceToComposition({ ...layer.projection, timeline_time_seconds: midpoint });
    const fullyMasked = rectArea(midpointProjection.visible_rect) === 0;
    if (fullyMasked || layer.opacity_evidence === "known_hidden") continue;
    if (layer.opacity_evidence === "unknown") return {
      status: "unknown", reason: `Layer ${layer.layer_id} has unknown opacity/occlusion evidence.`, ranked: [], exclusion_regions: exclusions,
    };
    const sourceStart = projectSourceToComposition({ ...layer.projection, timeline_time_seconds: cueStart }).source_time_seconds;
    const sourceEnd = projectSourceToComposition({ ...layer.projection, timeline_time_seconds: cueEnd }).source_time_seconds;
    const focal = focalRegions({
      interval: [Math.min(sourceStart, sourceEnd), Math.max(sourceStart, sourceEnd)],
      evidence_status: layer.evidence_status,
      tracks: layer.tracks,
      confirmed_decisions: layer.confirmed_decisions,
    });
    if (focal.status !== "complete") return {
      status: "unknown", reason: `Layer ${layer.layer_id} focal evidence is ${focal.status}.`, ranked: [], exclusion_regions: exclusions,
    };
    for (const region of focal.regions) {
      const timelineTime = sourceTimeToTimelineTime(region.time_seconds, layer.projection);
      const projection = projectSourceToComposition({ ...layer.projection, timeline_time_seconds: timelineTime });
      const rect = projectVisibleNormalizedSourceBox(region.box, projection);
      if (rect) exclusions.push({ layer_id: layer.layer_id, track_ref: region.track_ref, rect });
    }
  }

  exclusions.sort((a, b) => a.layer_id.localeCompare(b.layer_id)
    || a.track_ref.track_id.localeCompare(b.track_ref.track_id)
    || a.rect.x - b.rect.x || a.rect.y - b.rect.y);
  const padding = input.focal_padding_px ?? 12;
  const minimumContrast = input.minimum_contrast_ratio ?? 4.5;
  let incompleteContrast = false;
  const ranked: RankedCaptionRegion[] = [];
  for (const candidate of [...input.candidates].sort((a, b) => a.candidate_id.localeCompare(b.candidate_id))) {
    if (!containedBy(candidate.rect, input.safe_rect)) continue;
    if (candidate.contrast.status !== "measured" || candidate.contrast.minimum_ratio == null || candidate.contrast.texture_score == null) {
      incompleteContrast = true;
      continue;
    }
    if (candidate.contrast.minimum_ratio < minimumContrast) continue;
    if (exclusions.some((item) => intersects(candidate.rect, padded(item.rect, padding)))) continue;
    const distances = exclusions.map((item) => rectDistance(candidate.rect, item.rect));
    const minDistance = distances.length ? Math.min(...distances) : Math.hypot(input.composition.width, input.composition.height);
    const diagonal = Math.max(1, Math.hypot(input.composition.width, input.composition.height));
    const contrastScore = Math.min(1, candidate.contrast.minimum_ratio / 12);
    const distanceScore = Math.min(1, minDistance / diagonal);
    const texturePenalty = Math.min(1, Math.max(0, candidate.contrast.texture_score));
    ranked.push({
      ...candidate,
      minimum_focal_distance: Number(minDistance.toFixed(6)),
      score: Number((contrastScore * 0.5 + distanceScore * 0.35 + (1 - texturePenalty) * 0.15).toFixed(6)),
    });
  }
  ranked.sort((a, b) => b.score - a.score || a.candidate_id.localeCompare(b.candidate_id));
  if (ranked.length) return { status: "ranked", reason: null, ranked, exclusion_regions: exclusions };
  if (incompleteContrast) return {
    status: "unknown", reason: "No candidate has complete safe geometry, focal, and measured contrast evidence.", ranked: [], exclusion_regions: exclusions,
  };
  return {
    status: "no_clear_region", reason: "Every measured candidate intersects an exclusion, violates safe geometry, or misses contrast requirements.",
    ranked: [], exclusion_regions: exclusions,
  };
}
