import { readScreenSpace } from "@/lib/local-store/screen-space";
import { activeElements, type TimelineFile } from "@/lib/local-store/store";
import { elementRectAt } from "@/lib/media-analysis/visual-overlap";
import { motionSubjectFromSourceUrl } from "@/lib/hyperframes/motion-media";
import { readKeyframeMap } from "@/lib/timeline/keyframes";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { deriveProposalTimeline, type EditorAgentOption } from "./timeline-editor-agent-apply";

/**
 * Does a graphic in this option land on the speaker's face? The element-to-element spatial check
 * cannot see a face inside footage, so this samples the moments where changed text or drawn
 * shapes are on screen (or sit over re-framed footage, or follow a changed camera), finds the face
 * in those frames, and reports every graphic that covers the head. Cameras are applied to both
 * the graphic and the footage, so a push-in that brings a sketch onto the face is caught. Read-only.
 */
export type SpeakerClearance = {
  option_id: string;
  checked: number;
  /** Moments where a face was found, so coverage was actually judged. */
  judged: number;
  covered: Array<{ at_seconds: number; element_id: string; text: string }>;
  unknown: Array<{ at_seconds: number; reason: string }>;
};

const MAX_MOMENTS = 16;
const isCamera = (e: TimelineElement) => e.type === "shape" && e.props?.shape_kind === "camera";
const overlapsInTime = (a: TimelineElement, b: TimelineElement) => a.timeline_start < b.timeline_start + b.duration && a.timeline_start + a.duration > b.timeline_start;

/** Graphics whose placement the option changes, directly or through what they sit over or follow. */
const isFootage = (e: TimelineElement) => (e.type === "video_clip" || e.type === "still") && !motionSubjectFromSourceUrl(e.source_url ?? "") && !e.props?.has_alpha;

function coveringActors(active: TimelineElement[], touched: Set<string>) {
  const cameras = new Set(active.filter(e => isCamera(e) && touched.has(e.id)).map(e => e.id));
  const moved = (e: TimelineElement) => touched.has(e.id) || (typeof e.props?.camera_id === "string" && cameras.has(e.props.camera_id));
  const reframed = active.filter(e => moved(e) && e.type === "video_clip" && !motionSubjectFromSourceUrl(e.source_url ?? "") && !e.props?.has_alpha);
  return active.filter(e => ((e.type === "caption_text" && String(e.props?.text ?? "").trim()) || (e.type === "shape" && !isCamera(e)))
    && (moved(e) || reframed.some(f => overlapsInTime(e, f))))
    .sort((a, b) => a.timeline_start - b.timeline_start);
}

/** When to look: across each graphic's time on screen, plus every camera keyframe it lives through. */
function sampleMoments(actors: TimelineElement[], active: TimelineElement[]) {
  const moments = new Set<number>();
  for (const actor of actors) {
    const fractions = actor.type === "shape" ? [0.25, 0.5, 0.9] : [0.5];
    for (const f of fractions) moments.add(round(actor.timeline_start + actor.duration * f));
    const camera = active.find(e => e.id === actor.props?.camera_id);
    if (!camera) continue;
    for (const track of Object.values(readKeyframeMap(camera.props))) for (const key of track ?? []) {
      const at = round(camera.timeline_start + key.t);
      if (at > actor.timeline_start && at < actor.timeline_start + actor.duration) moments.add(at);
    }
  }
  const sorted = [...moments].sort((a, b) => a - b);
  return sorted.length <= MAX_MOMENTS ? sorted : Array.from({ length: MAX_MOMENTS }, (_, i) => sorted[Math.round(i * (sorted.length - 1) / (MAX_MOMENTS - 1))]!);
}

export async function reviewSpeakerClearance(projectId: string, before: TimelineFile, options: readonly EditorAgentOption[]): Promise<SpeakerClearance[]> {
  const reviews: SpeakerClearance[] = [];
  for (const option of options) {
    const derived = deriveProposalTimeline(before, option.operations, projectId, option.preserve_fields);
    const active = activeElements(derived.timeline);
    // A scene with no footage (only drawings, text and rendered motion graphics) has no face to clear.
    if (!active.some(isFootage)) continue;
    const actors = coveringActors(active, new Set(derived.touched));
    if (!actors.length) continue;
    const moments = sampleMoments(actors, active);
    // The shared screen read finds the speaker; elementRectAt gives each graphic's box, as placement sees it.
    const space = await readScreenSpace(projectId, derived.timeline, { start_seconds: moments[0]!, moments });
    const review: SpeakerClearance = { option_id: option.id, checked: moments.length, judged: 0, covered: [], unknown: [] };
    for (const moment of space.moments) {
      const at = moment.at_seconds, head = moment.occupied.find(o => o.kind === "speaker head");
      if (!head) { review.unknown.push({ at_seconds: at, reason: moment.reason ?? "No face found" }); continue; }
      review.judged += 1;
      for (const actor of actors.filter(e => at >= e.timeline_start && at < e.timeline_start + e.duration)) {
        const box = elementRectAt(actor, at, active, space.canvas);
        if (!box) continue;
        const overlapW = Math.min(box.x + box.width, head.x + head.width) - Math.max(box.x, head.x);
        const overlapH = Math.min(box.y + box.height, head.y + head.height) - Math.max(box.y, head.y);
        if (overlapW > 0 && overlapH > 0 && !review.covered.some(c => c.element_id === actor.id)) {
          review.covered.push({ at_seconds: at, element_id: actor.id, text: String(actor.props?.text ?? actor.props?.title ?? "a drawn shape") });
        }
      }
    }
    reviews.push(review);
  }
  return reviews;
}

/** Plain warnings: a graphic on the face, or graphics whose clearance could not be judged. */
export function speakerClearanceWarnings(reviews: readonly SpeakerClearance[]) {
  return reviews.flatMap(review => {
    if (review.covered.length) {
      const what = review.covered.slice(0, 4).map(c => `"${c.text}" at ${clock(c.at_seconds)}`).join(", ");
      return [`Option ${review.option_id}: covers the speaker's face: ${what}. Move it off the face before presenting this card.`];
    }
    if (review.checked && !review.judged) return [`Option ${review.option_id}: could not find the speaker's face at any of ${review.checked} sampled moments, so face clearance is unchecked.`];
    return [];
  });
}

const round = (value: number) => Math.round(value * 1000) / 1000;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
