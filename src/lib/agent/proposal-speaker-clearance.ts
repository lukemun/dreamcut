import { speakerHeadsAt } from "@/lib/local-store/open-space";
import { activeElements, type TimelineFile } from "@/lib/local-store/store";
import { captionRectangle } from "@/lib/media-analysis/visual-overlap";
import { motionSubjectFromSourceUrl } from "@/lib/hyperframes/motion-media";
import { deriveProposalTimeline, type EditorAgentOption } from "./timeline-editor-agent-apply";

/**
 * Does text in this option land on the speaker's face? The element-to-element spatial check
 * cannot see a face inside footage, so text over a talking head passed silently. This samples
 * the moments where changed text (or text over re-framed footage) is on screen, finds the face
 * in those frames and reports every caption that covers the head. Read-only.
 */
export type SpeakerClearance = {
  option_id: string;
  checked: number;
  /** Moments where a face was found, so coverage was actually judged. */
  judged: number;
  covered: Array<{ at_seconds: number; element_id: string; text: string }>;
  unknown: Array<{ at_seconds: number; reason: string }>;
};

const MAX_MOMENTS = 10;

export async function reviewSpeakerClearance(projectId: string, before: TimelineFile, options: readonly EditorAgentOption[]): Promise<SpeakerClearance[]> {
  const reviews: SpeakerClearance[] = [];
  for (const option of options) {
    const derived = deriveProposalTimeline(before, option.operations, projectId, option.preserve_fields);
    const touched = new Set(derived.touched);
    const active = activeElements(derived.timeline);
    const reframed = active.filter(e => touched.has(e.id) && e.type === "video_clip" && !motionSubjectFromSourceUrl(e.source_url ?? "") && !e.props?.has_alpha);
    const captions = active.filter(e => e.type === "caption_text" && String(e.props?.text ?? "").trim()
      && (touched.has(e.id) || reframed.some(f => e.timeline_start < f.timeline_start + f.duration && e.timeline_start + e.duration > f.timeline_start)))
      .sort((a, b) => a.timeline_start - b.timeline_start);
    if (!captions.length) continue;
    // Evenly spread across the changed text so a whole-talk rail is judged start to end.
    const picked = captions.length <= MAX_MOMENTS ? captions
      : Array.from({ length: MAX_MOMENTS }, (_, i) => captions[Math.round(i * (captions.length - 1) / (MAX_MOMENTS - 1))]!);
    const moments = picked.map(c => c.timeline_start + c.duration / 2);
    const { canvas, moments: heads } = await speakerHeadsAt(projectId, derived.timeline, moments);
    const media = active.filter(e => e.type === "video_clip" || e.type === "still");
    const review: SpeakerClearance = { option_id: option.id, checked: picked.length, judged: 0, covered: [], unknown: [] };
    for (const [i, caption] of picked.entries()) {
      const at = moments[i]!, head = heads.find(h => Math.abs(h.at - at) < 1e-6)?.head ?? null;
      if (!head) { review.unknown.push({ at_seconds: round(at), reason: heads.find(h => Math.abs(h.at - at) < 1e-6)?.reason ?? "No face found" }); continue; }
      review.judged += 1;
      const box = captionRectangle(caption, canvas, media);
      if (!box) continue;
      const overlapW = Math.min(box.x + box.width, head.x + head.width) - Math.max(box.x, head.x);
      const overlapH = Math.min(box.y + box.height, head.y + head.height) - Math.max(box.y, head.y);
      if (overlapW > 0 && overlapH > 0) review.covered.push({ at_seconds: round(at), element_id: caption.id, text: String(caption.props?.text ?? "") });
    }
    reviews.push(review);
  }
  return reviews;
}

/** Plain warnings: text on the face, or text whose clearance could not be judged. */
export function speakerClearanceWarnings(reviews: readonly SpeakerClearance[]) {
  return reviews.flatMap(review => {
    if (review.covered.length) {
      const when = review.covered.slice(0, 4).map(c => clock(c.at_seconds)).join(", ");
      return [`Option ${review.option_id}: text covers the speaker's face at ${when} (${review.covered.length} of ${review.judged} judged moments). Move it off the face before presenting this card.`];
    }
    if (review.checked && !review.judged) return [`Option ${review.option_id}: could not find the speaker's face at any of ${review.checked} sampled moments, so face clearance is unchecked.`];
    return [];
  });
}

const round = (value: number) => Math.round(value * 1000) / 1000;
const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
