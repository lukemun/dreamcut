/**
 * The Guide's hands-on tour: chapters a new creator works through in the real editor, on a
 * practice project the Guide makes for them. The tour points and explains; the creator clicks
 * and presses every key. It never applies, rejects or shares anything for them.
 */

export const GUIDE_PRACTICE_PROJECT = "guide-practice";
/** The site's page on adding an effect to DreamCut. */
export const CONTRIBUTE_PAGE_URL = "https://dreamcut.io/mission#contribute";
export const CONTRIBUTING_URL = "https://github.com/lukemun/DreamCut/blob/main/CONTRIBUTING.md#contribute-an-effect-or-editing-workflow";

export const GUIDE_TOUR_CHAPTERS = [
  { id: "effects", title: "Try an effect", summary: "Pick an effect, see what it needs, and choose your footage." },
  { id: "cards", title: "Review the result", summary: "Play it, compare it, tune it, then apply or reject it." },
  { id: "marks", title: "Mark moments", summary: "Press M to flag the places you mean." },
  { id: "creators", title: "Add your own effect", summary: "Turn an edit you made into a template everyone can use." },
] as const;
export type GuideTourChapterId = (typeof GUIDE_TOUR_CHAPTERS)[number]["id"];

export const GUIDE_TOUR_STATE_KEY = "dreamcut:guide-tour";
export const GUIDE_TOUR_DONE_KEY = "dreamcut:guide-tour-done";
export const GUIDE_TOUR_EVENT = "dreamcut:guide-tour";

export function readGuideTourDone(): GuideTourChapterId[] {
  try { return JSON.parse(localStorage.getItem(GUIDE_TOUR_DONE_KEY) ?? "[]"); } catch { return []; }
}

/** Starts the tour at a chapter, on whichever page the creator is. */
export function startGuideTour(chapter: GuideTourChapterId, projectId: string) {
  const state = { chapter, step: 0, projectId };
  try { localStorage.setItem(GUIDE_TOUR_STATE_KEY, JSON.stringify(state)); } catch { /* the event still starts it */ }
  window.dispatchEvent(new CustomEvent(GUIDE_TOUR_EVENT, { detail: { start: state } }));
}
