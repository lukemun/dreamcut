import { resolveMediaTransformAtTime } from "@/lib/timeline/media-transform";

type ElementLike = {
  id: string;
  type: string;
  lane_key: string;
  timeline_start: number;
  duration: number;
  props: Record<string, unknown> | null;
};

type PresenterContinuityFinding = {
  code: string;
  severity: "blocker";
  elementId: string;
  atSeconds: number;
  message: string;
  measured: string;
  limit: string;
  source: string;
  remedy: string;
};

const FPS = 30;
const ADJACENCY_TOLERANCE_SECONDS = 1.5 / FPS;
const SCALE_DELTA_LIMIT = 0.04;
const OFFSET_DELTA_LIMIT = 0.08;

function nonempty(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Adjacent pieces from the same presenter take and semantic section should read as one
 * composition. A material reframe at that internal edit is allowed only when the editor names
 * its semantic purpose in `presenter_reframe_contract`; otherwise the cut has no reviewable owner.
 */
export function checkPresenterContinuityContracts(elements: ElementLike[]): PresenterContinuityFinding[] {
  const videos = elements
    .filter((element) => element.type === "video_clip" && element.lane_key.startsWith("visual_"))
    .sort((a, b) => a.lane_key.localeCompare(b.lane_key) || a.timeline_start - b.timeline_start);
  const findings: PresenterContinuityFinding[] = [];

  for (let index = 0; index < videos.length - 1; index += 1) {
    const outgoing = videos[index]!;
    const incoming = videos[index + 1]!;
    const outgoingProps = outgoing.props ?? {};
    const incomingProps = incoming.props ?? {};
    const outgoingEnd = outgoing.timeline_start + outgoing.duration;
    const gap = incoming.timeline_start - outgoingEnd;

    if (outgoing.lane_key !== incoming.lane_key || Math.abs(gap) > ADJACENCY_TOLERANCE_SECONDS) continue;
    if (!nonempty(outgoingProps.source_id) || outgoingProps.source_id !== incomingProps.source_id) continue;
    if (!nonempty(outgoingProps.section) || outgoingProps.section !== incomingProps.section) continue;

    const before = resolveMediaTransformAtTime(outgoingProps, Math.max(0, outgoing.duration - 1 / FPS));
    const after = resolveMediaTransformAtTime(incomingProps, Math.min(incoming.duration, 1 / FPS));
    if (before.scale >= 0.8 || after.scale >= 0.8) continue;

    const scaleDelta = Math.abs(after.scale - before.scale);
    const xDelta = Math.abs(after.offsetX - before.offsetX);
    const yDelta = Math.abs(after.offsetY - before.offsetY);
    const materiallyReframed = scaleDelta > SCALE_DELTA_LIMIT
      || xDelta > OFFSET_DELTA_LIMIT
      || yDelta > OFFSET_DELTA_LIMIT;
    if (!materiallyReframed || nonempty(incomingProps.presenter_reframe_contract)) continue;

    findings.push({
      code: "unsupported_presenter_reframe",
      severity: "blocker",
      elementId: incoming.id,
      atSeconds: incoming.timeline_start,
      message: "Adjacent pieces of the same presenter take change framing without a named semantic handoff.",
      measured: `scale Δ${scaleDelta.toFixed(3)}, x Δ${xDelta.toFixed(3)}, y Δ${yDelta.toFixed(3)} at a ${gap.toFixed(3)}s join`,
      limit: `scale Δ<=${SCALE_DELTA_LIMIT}, x/y Δ<=${OFFSET_DELTA_LIMIT}, or an explicit presenter_reframe_contract`,
      source: "Cut-pacing: crop changes and visual resets belong to semantic boundaries",
      remedy: "Carry the established presenter transform through the pickup, or add a presenter_reframe_contract that names the visual or semantic beat owning the reframe.",
    });
  }

  return findings;
}
