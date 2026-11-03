/**
 * Recognize media produced by model-authored motion: composition renders under
 * media/hyperframes/<id>/ and synthesized sounds under media/sounds/<id>/.
 * Pure string logic so the review UI and server share it.
 */
/** Proposal override field that swaps a proposed composition to another value-keyed render. */
export const MOTION_RENDER_FIELD = "motion_render_source_url";

export type MotionSubject = { kind: "composition" | "sound"; id: string };

export function motionSubjectFromSourceUrl(sourceUrl: string): MotionSubject | null {
  const match = /\/media\/(hyperframes|sounds)\/([A-Za-z0-9._-]{1,128})\/[^/?#]+$/.exec(sourceUrl)
    ?? /^media\/(hyperframes|sounds)\/([A-Za-z0-9._-]{1,128})\/[^/?#]+$/.exec(sourceUrl)
    ?? /^(hyperframes|sounds)\/([A-Za-z0-9._-]{1,128})\/[^/?#]+$/.exec(sourceUrl);
  if (!match) return null;
  const id = decodeURIComponent(match[2]!);
  if (id === "." || id === "..") return null;
  return { kind: match[1] === "hyperframes" ? "composition" : "sound", id };
}
