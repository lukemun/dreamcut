import type { DetectorBox } from "./detector";
import type { Shot } from "./shot-association";

export type TrackLabel = DetectorBox["label"];

export type TrackDetection = DetectorBox & {
  detection_id: string;
  frame_id: string;
  time_seconds: number;
};

export type TrackSample = {
  detection_id: string;
  frame_id: string;
  time_seconds: number;
  confidence: number;
  box: { x: number; y: number; width: number; height: number };
};

export type AnonymousTrack = {
  analysis_revision: string;
  track_id: string;
  shot_id: string;
  label: TrackLabel;
  start_seconds: number;
  end_seconds: number;
  confidence: number;
  samples: TrackSample[];
};

export type TrackAssociationOptions = {
  /** A longer absence starts a new anonymous track; samples are never synthesized. */
  max_gap_seconds?: number;
  min_iou?: number;
  max_center_distance?: number;
};

type BuildingTrack = Omit<AnonymousTrack, "confidence" | "start_seconds" | "end_seconds"> & {
  ordinal: number;
};

const precise = (value: number) => Number(value.toFixed(6));

function boxOf(detection: TrackDetection): TrackSample["box"] {
  return {
    x: precise(detection.x),
    y: precise(detection.y),
    width: precise(detection.width),
    height: precise(detection.height),
  };
}

export function boxIou(a: TrackSample["box"], b: TrackSample["box"]): number {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function centerDistance(a: TrackSample["box"], b: TrackSample["box"]): number {
  return Math.hypot(
    a.x + a.width / 2 - (b.x + b.width / 2),
    a.y + a.height / 2 - (b.y + b.height / 2),
  );
}

function compareDetections(a: TrackDetection, b: TrackDetection): number {
  return a.time_seconds - b.time_seconds
    || a.label.localeCompare(b.label)
    || a.x - b.x
    || a.y - b.y
    || a.width - b.width
    || a.height - b.height
    || b.confidence - a.confidence
    || a.detection_id.localeCompare(b.detection_id)
    || a.frame_id.localeCompare(b.frame_id);
}

function containingShot(timeSeconds: number, shots: Shot[]): Shot | null {
  for (let index = 0; index < shots.length; index += 1) {
    const shot = shots[index]!;
    if (timeSeconds >= shot.start_seconds
      && (timeSeconds < shot.end_seconds || (index === shots.length - 1 && timeSeconds === shot.end_seconds))) {
      return shot;
    }
  }
  return null;
}

/**
 * Associates anonymous face/person detections inside individual shots.
 *
 * Input order is deliberately ignored. Matching is a deterministic global greedy
 * assignment per timestamp. It uses only geometry, label, and bounded temporal
 * continuity; it never performs face recognition or infers a person's identity.
 */
export function buildShotBoundedTracks(
  analysisRevision: string,
  detections: TrackDetection[],
  shots: Shot[],
  options: TrackAssociationOptions = {},
): AnonymousTrack[] {
  if (!analysisRevision.trim()) throw new Error("analysisRevision is required");
  const maxGap = options.max_gap_seconds ?? 0.75;
  const minIou = options.min_iou ?? 0.15;
  const maxDistance = options.max_center_distance ?? 0.25;
  const orderedShots = [...shots].sort((a, b) => a.start_seconds - b.start_seconds || a.end_seconds - b.end_seconds || a.shot_id.localeCompare(b.shot_id));
  const ordered = [...detections]
    .filter((item) => Number.isFinite(item.time_seconds) && item.width > 0 && item.height > 0)
    .sort(compareDetections);
  const counters: Record<TrackLabel, number> = { face: 0, person: 0 };
  const tracks: BuildingTrack[] = [];

  for (const shot of orderedShots) {
    const shotDetections = ordered.filter((item) => containingShot(item.time_seconds, orderedShots)?.shot_id === shot.shot_id);
    const times = [...new Set(shotDetections.map((item) => item.time_seconds))].sort((a, b) => a - b);
    const shotTracks: BuildingTrack[] = [];

    for (const time of times) {
      const atTime = shotDetections.filter((item) => item.time_seconds === time);
      const candidates: Array<{ track: BuildingTrack; detection: TrackDetection; score: number; iou: number; distance: number }> = [];
      for (const track of shotTracks) {
        const previous = track.samples.at(-1)!;
        const gap = time - previous.time_seconds;
        if (gap <= 0 || gap > maxGap) continue;
        for (const detection of atTime) {
          if (detection.label !== track.label) continue;
          const box = boxOf(detection);
          const iou = boxIou(previous.box, box);
          const distance = centerDistance(previous.box, box);
          if (iou < minIou && distance > maxDistance) continue;
          // IoU dominates, then proximity and shorter gaps. All tie breakers below
          // are stable, so worker/frame completion order cannot change identity.
          const score = iou * 4 + (1 - Math.min(1, distance)) - gap / Math.max(maxGap, 0.000001);
          candidates.push({ track, detection, score, iou, distance });
        }
      }
      candidates.sort((a, b) => b.score - a.score
        || b.iou - a.iou
        || a.distance - b.distance
        || a.track.ordinal - b.track.ordinal
        || compareDetections(a.detection, b.detection));

      const assignedTracks = new Set<string>();
      const assignedDetections = new Set<string>();
      for (const candidate of candidates) {
        if (assignedTracks.has(candidate.track.track_id) || assignedDetections.has(candidate.detection.detection_id)) continue;
        candidate.track.samples.push({
          detection_id: candidate.detection.detection_id,
          frame_id: candidate.detection.frame_id,
          time_seconds: precise(candidate.detection.time_seconds),
          confidence: precise(candidate.detection.confidence),
          box: boxOf(candidate.detection),
        });
        assignedTracks.add(candidate.track.track_id);
        assignedDetections.add(candidate.detection.detection_id);
      }

      for (const detection of atTime) {
        if (assignedDetections.has(detection.detection_id)) continue;
        counters[detection.label] += 1;
        const trackId = `${detection.label}_${String(counters[detection.label]).padStart(2, "0")}`;
        const track: BuildingTrack = {
          analysis_revision: analysisRevision,
          track_id: trackId,
          shot_id: shot.shot_id,
          label: detection.label,
          ordinal: tracks.length + shotTracks.length,
          samples: [{
            detection_id: detection.detection_id,
            frame_id: detection.frame_id,
            time_seconds: precise(detection.time_seconds),
            confidence: precise(detection.confidence),
            box: boxOf(detection),
          }],
        };
        shotTracks.push(track);
      }
    }
    tracks.push(...shotTracks);
  }

  return tracks.map(({ ordinal: _ordinal, ...track }) => {
    const confidences = track.samples.map((sample) => sample.confidence);
    return {
      ...track,
      start_seconds: track.samples[0]!.time_seconds,
      end_seconds: track.samples.at(-1)!.time_seconds,
      confidence: precise(confidences.reduce((sum, value) => sum + value, 0) / confidences.length),
    };
  });
}
