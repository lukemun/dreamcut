// Regression cases for the proposal-dial-selection skill: which dials a card shows up front.
// Grading is structural; it does not judge taste beyond each case's required and excluded dials.
export const DIAL_SELECTION_EVAL_VERSION = "dial-selection-v1";

type Dial = { id: string; label: string; kind: "clip" | "graphic"; fixed?: boolean };
type Case = {
  id: string;
  /** Where the case came from, so it can be re-checked against the original episode. */
  episode: string;
  /** ready: the creator's own choice or tuning backs the grading. needs-evidence: the agent's
   * judgment, accepted in general terms but not yet confirmed by an approved card. Do not tune
   * the skill against a needs-evidence case. */
  readiness: "ready" | "needs-evidence";
  request: string;
  change: string;
  dials: Dial[];
  required: string[];
  excluded: string[];
  max_main: number;
  reference: string[];
  known_bad: string[][];
};

const header = (id: string, label: string, fixed = false): Dial => ({ id, label, kind: "graphic", ...(fixed ? { fixed } : {}) });
const clip = (id: string, label: string): Dial => ({ id, label, kind: "clip" });

const cases: Case[] = [
  {
    id: "header-flash-fix",
    episode: "creator session 2026-10-13: a fix card re-rendering three section headers",
    // The creator asked why these dials showed and agreed to "Entrance only" as the agent's
    // offer; no card with that choice has been approved yet.
    readiness: "needs-evidence",
    request: "At this mark my face flashes back for a frame after the graphic already covered it. Why is the motion graphic doing that?",
    change: "Re-renders three section headers with every value unchanged after fixing the graphic's code: its first frame drew the finished page before the slide-in started.",
    dials: [header("section", "Section", true), header("point_1", "Point 1"), header("point_2", "Point 2"), header("point_3", "Point 3"), header("point_4", "Point 4"),
      header("accent", "Pen colour"), header("entrance", "Entrance"), header("write_on", "Writing time"), header("duration", "Duration", true), header("backdrop_opacity", "Backdrop opacity")],
    required: ["entrance"],
    excluded: ["section", "duration", "point_1", "point_2", "point_3", "point_4"],
    max_main: 2,
    reference: ["entrance"],
    known_bad: [["section", "point_1", "point_2", "point_3", "point_4", "accent", "entrance", "write_on", "duration", "backdrop_opacity"], []],
  },
  {
    id: "article-behind-speaker",
    episode: "creator session 2026-10-13: an article screenshot moved behind the speaker",
    // The approved card offered exactly these three dials and the creator tuned all three before approving.
    readiness: "ready",
    request: "Put this visual fully behind me, big, or at least not covering my face.",
    change: "Moves the article to the lane behind the speaker cutout and enlarges it.",
    dials: [clip("media_scale", "Scale"), clip("media_offset_x", "Horizontal position"), clip("media_offset_y", "Vertical position"), clip("media_opacity", "Opacity"),
      clip("animationInDuration", "Entrance duration"), clip("subject_glow", "Glow strength")],
    required: ["media_scale", "media_offset_x", "media_offset_y"],
    excluded: ["subject_glow"],
    max_main: 5,
    reference: ["media_scale", "media_offset_x", "media_offset_y"],
    known_bad: [["media_opacity"], ["media_scale", "subject_glow"]],
  },
];

function find(id: string) {
  const item = cases.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`Unknown dial-selection case: ${id}`);
  return item;
}

export function dialSelectionCases() { return cases.map(({ id, episode, readiness, request }) => ({ id, episode, readiness, request })); }

/** What the agent sees: the request, the change and the dials, never the grading. */
export function dialSelectionPacket(id: string) {
  const { request, change, dials, max_main } = find(id);
  return {
    suite: DIAL_SELECTION_EVAL_VERSION, case_id: id, request, change, dials, max_main,
    instructions: "Following the proposal-dial-selection skill, return {\"main\": [dial ids in order]} for the dials this card should show up front. Every other dial stays in Advanced adjustments.",
  };
}

export function gradeDialSelection(id: string, raw: unknown) {
  const item = find(id);
  const main = (raw as { main?: unknown })?.main;
  if (!Array.isArray(main) || !main.every((value) => typeof value === "string")) {
    return { case_id: id, pass: false, checks: { shape: false }, error: "Answer must be {\"main\": string[]}" };
  }
  const known = new Set(item.dials.map((dial) => dial.id));
  const checks = {
    shape: true,
    known_dials: main.every((dial) => known.has(dial)),
    required: item.required.every((dial) => main.includes(dial)),
    excluded: !main.some((dial) => item.excluded.includes(dial) || item.dials.find((candidate) => candidate.id === dial)?.fixed),
    size: main.length <= item.max_main,
  };
  return { case_id: id, pass: Object.values(checks).every(Boolean), checks, error: null };
}

/** The suite's own check: each reference answer passes and each known-bad answer fails. */
export function dialSelectionSelfCheck() {
  return cases.map((item) => ({
    case_id: item.id,
    reference_passes: gradeDialSelection(item.id, { main: item.reference }).pass,
    known_bad_fail: item.known_bad.every((answer) => !gradeDialSelection(item.id, { main: answer }).pass),
  }));
}
