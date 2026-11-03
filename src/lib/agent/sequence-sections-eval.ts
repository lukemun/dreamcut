import { isDeepStrictEqual } from "node:util";
import { editorAgentOptionSchema, countOperationMutations } from "./timeline-editor-agent-apply";
import { assertProposalControlBudget } from "./proposal-control-budget";

// A card that runs through a sequence lays its dials out in time order, one section per beat
// (docs/standards/proposal-presentation.md). This synthetic case hands over a finished
// three-move sequence without review controls and grades the layout an agent gives it.
export const SEQUENCE_SECTIONS_EVAL_VERSION = "sequence-sections-v1";
export const SEQUENCE_SECTIONS_CASE = "sequence-dials-by-beat";

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const F = 1 / 30;
const round = (v: number) => Math.round(v * 1e6) / 1e6;
type Visual = { title: string; start: number; source_start: number; frames: number; cutout?: boolean; blur?: number };

/** Beats in time order; each move into a beat belongs to that beat, with the hold that follows it. */
const BEATS = [
  { place: "the door", section: "At the door", hold: "Hold at the door", stand: 10 },
  { place: "the window", section: "To the window", hold: "Hold at the window", stand: 12, blur: 14 },
  { place: "the stairs", section: "To the stairs", hold: "Hold on the stairs", stand: 12, blur: 22 },
  { place: "the camera", section: "To the camera", stand: 60, blur: 30 },
] as const;
const MOVE = 6;

function sequence() {
  const visuals: (Visual & { beat: number; kind: "live" | "out" | "in" })[] = [];
  let frame = 0, source = 90;
  BEATS.forEach((beat, k) => {
    if (k > 0) {
      const blur = "blur" in beat ? beat.blur : 0;
      visuals.push({ beat: k, kind: "out", title: `Move out: ${BEATS[k - 1].place} to ${beat.place}`, start: frame, source_start: 0, frames: MOVE, cutout: true, blur });
      frame += MOVE;
      visuals.push({ beat: k, kind: "in", title: `Move in: ${BEATS[k - 1].place} to ${beat.place}`, start: frame, source_start: 0, frames: MOVE, cutout: true, blur });
      frame += MOVE;
      source += 120;
    }
    visuals.push({ beat: k, kind: "live", title: k === BEATS.length - 1 ? "Your line in front of the camera" : `You at ${beat.place}`, start: frame, source_start: source, frames: beat.stand });
    frame += beat.stand;
  });
  const operations = visuals.map((v, i) => ({
    element_id: uuid(i + 1),
    create_visual: {
      type: "video_clip" as const, title: v.title, timeline_start: round(v.start * F),
      source_url: v.cutout ? `/api/projects/eval-sequence/media/cutouts/move-${i}.webm` : "/api/projects/eval-sequence/media/sources/walk.mp4",
      source_start_seconds: round(v.source_start * F), source_end_seconds: round((v.source_start + v.frames) * F),
      source_duration_seconds: v.cutout ? 1 : 60, playback_rate: 1, lane_key: "visual_1", lane_index: 1, volume: 0,
      ...(v.cutout ? { has_alpha: true, directional_blur_x: v.blur, transition_keyframes: {
        directional_blur_x: [{ t: 0, v: v.kind === "out" ? 0 : v.blur!, ease: "linear" as const }, { t: round((MOVE - 1) * F), v: v.blur! }],
      } } : {}),
    },
  }));
  const at = (beat: number, kind: string) => visuals.findIndex(v => v.beat === beat && v.kind === kind);
  const bind = (i: number, field: string, mult: number) => ({ operation_index: i, target: "create_visual" as const, field, offset_seconds: (operations[i].create_visual as Record<string, unknown>)[field] as number, spacing_multiplier: mult });
  const moves = visuals.map((v, i) => ({ v, i })).filter(({ v }) => v.cutout);
  // Move length: every move's clips lengthen together and everything after them ripples.
  const moveBindings = visuals.flatMap((v, i) => {
    const before = moves.filter(m => m.i < i).length;
    return [...(before ? [bind(i, "timeline_start", before)] : []), ...(v.cutout ? [bind(i, "source_end_seconds", 1)] : [])];
  });
  const timing_controls = [
    { id: "move", kind: "hold" as const, label: "Move length", display_unit: "frames" as const, reference_seconds: round(MOVE * F), spacing_seconds: round(MOVE * F), min_spacing_seconds: round(2 * F), max_spacing_seconds: round(10 * F), bindings: moveBindings },
    ...BEATS.flatMap((beat, k) => "hold" in beat ? [{
      id: `hold-${k}`, kind: "hold" as const, label: beat.hold, display_unit: "seconds" as const,
      reference_seconds: round(beat.stand * F), spacing_seconds: round(beat.stand * F), min_spacing_seconds: 0.1, max_spacing_seconds: 1.5,
      bindings: [bind(at(k, "live"), "source_start_seconds", -1), ...visuals.map((_, i) => i).filter(i => i > at(k, "live")).map(i => bind(i, "timeline_start", 1))],
    }] : []),
  ];
  const beatOf = visuals.map(v => v.beat);
  return { operations, timing_controls, beatOf, at };
}

export function sequenceSectionsPacket() {
  const { operations, timing_controls } = sequence();
  return {
    suite: SEQUENCE_SECTIONS_EVAL_VERSION, case_id: SEQUENCE_SECTIONS_CASE, fixture_version: 1,
    request: "This card moves me from the door to the window, the stairs and then the camera, where I say my line. Lay out its dials for review: show the move length, each move's blur and each hold. I want all the controls for everything in time order, grouped together.",
    input: { option: { id: "moves", label: "Door to camera", summary: "Moves stop to stop, then the line", recommended: true, operations, requested_mutations: countOperationMutations(operations), timing_controls, review_controls: [] } },
    constraints: "Return the option with review_controls filled in. Do not change operations or timing bindings; you may rename timing control labels. At most 15 visible numeric sliders. This synthetic component fixture has no playable media.",
  };
}

const MARK = /\bmark\s*#?\d+|\bM\d\b/i;

/** Structural grade of a dial layout: sections, their order, and which dial sits where. */
export function gradeSequenceSections(raw: unknown) {
  const { beatOf, operations, timing_controls } = sequence();
  const checks: Record<string, boolean> = {};
  const failures: string[] = [];
  const check = (name: string, ok: boolean, why: string) => { checks[name] = ok; if (!ok) failures.push(why); };
  try {
    const option = editorAgentOptionSchema.parse(raw);
    assertProposalControlBudget({ elements: [], transitions: [] }, [option]);
    checks.schema_and_budget = true;
    check("preserve_sequence", isDeepStrictEqual(option.operations, operations)
      && isDeepStrictEqual(option.timing_controls?.map(({ label: _, ...tc }) => tc), timing_controls.map(({ label: _, ...tc }) => tc)), "changes the sequence or its timing bindings");
    const rcs = option.review_controls ?? [];
    const tcs = option.timing_controls ?? [];
    // The beats a dial tunes. A hold also ripples every later clip's start; that is not tuning those beats.
    const beats = (rc: typeof rcs[number]) => new Set(rc.target === "timing_control"
      ? (tcs[rc.operation_index]?.bindings ?? []).filter(b => b.field !== "timeline_start").map(b => beatOf[b.operation_index])
      : [rc.operation_index, ...(rc.linked_operation_indices ?? [])].map(i => beatOf[i]));
    const exposed = (target: string, index: number) => rcs.some(rc => rc.target === target && (rc.operation_index === index || rc.linked_operation_indices?.includes(index)));
    check("coverage", tcs.every((_, i) => exposed("timing_control", i)) && operations.every((op, i) => !op.create_visual.has_alpha || exposed("create_visual", i)),
      "leaves a move length, blur or hold dial off the card");
    check("sectioned", rcs.length > 0 && rcs.every(rc => rc.section?.trim()), "a dial has no section, so timing dials fall under \"Time on screen\"");
    const runs: { section: string; items: typeof rcs }[] = [];
    for (const rc of rcs) runs.at(-1)?.section === rc.section ? runs.at(-1)!.items.push(rc) : runs.push({ section: rc.section ?? "", items: [rc] });
    check("contiguous", new Set(runs.map(r => r.section)).size === runs.length, "a section is split, so its dials do not sit together");
    // A section is shared (every dial tunes several beats), one beat's, or mixed.
    const runBeat = runs.map(r => {
      if (r.items.every(rc => beats(rc).size > 1)) return null;
      const all = new Set(r.items.flatMap(rc => [...beats(rc)]));
      return all.size === 1 ? [...all][0] : -1;
    });
    check("one_beat_per_section", !runBeat.includes(-1), "a section mixes dials of different beats");
    const first = runBeat.findIndex(b => b !== null);
    check("shared_first", first >= 0 && runBeat.slice(first).every(b => b !== null), "dials that tune every beat are not first under their own section");
    const order = runBeat.filter((b): b is number => b !== null && b >= 0);
    check("time_order", order.length === BEATS.length && order.every((b, i) => b === i), "sections are not one per beat in time order");
    check("blur_before_hold", runs.every(r => {
      const blur = r.items.findIndex(rc => rc.target !== "timing_control"), hold = r.items.findIndex(rc => rc.target === "timing_control");
      return blur < 0 || hold < 0 || blur < hold;
    }), "a beat lists its hold before the move into it");
    const names = [...runs.map(r => r.section), ...tcs.map(tc => tc.label ?? "")];
    check("named_by_place", !names.some(n => MARK.test(n)) && runs.every((r, i) => runBeat[i] == null || runBeat[i]! < 0 || r.section.toLowerCase().includes(BEATS[runBeat[i]!].place.replace("the ", ""))),
      "a section or dial is named by a mark number rather than what is there");
    return { case_id: SEQUENCE_SECTIONS_CASE, pass: Object.values(checks).every(Boolean), checks, failures, quality: "unreviewed", model_trial: false };
  } catch (error) { return { case_id: SEQUENCE_SECTIONS_CASE, pass: false, checks, failures: [...failures, String(error)], quality: "unreviewed", model_trial: false }; }
}

/** The layout the rule asks for, and layouts that break it one way each. Used by the grader's tests. */
export function sequenceSectionsExamples() {
  const { option } = sequenceSectionsPacket().input;
  const { at } = sequence();
  const blur = (k: number) => ({ operation_index: at(k, "out"), target: "create_visual" as const, field: "directional_blur_x", linked_operation_indices: [at(k, "in")] });
  const hold = (k: number) => ({ operation_index: k + 1, target: "timing_control" as const, field: "spacing_seconds" });
  const move = { operation_index: 0, target: "timing_control" as const, field: "spacing_seconds" };
  const sectioned = (controls: object[], sections: string[]) => ({ ...option, review_controls: controls.map((rc, i) => ({ ...rc, section: sections[i] })) });
  const good = sectioned([move, hold(0), blur(1), hold(1), blur(2), hold(2), blur(3)],
    ["Every move", "At the door", "To the window", "To the window", "To the stairs", "To the stairs", "To the camera"]);
  const withRc = (review_controls: object[]) => ({ ...option, review_controls });
  return {
    good,
    bad: {
      flat_time_on_screen: withRc([move, hold(0), hold(1), hold(2), blur(1), blur(2), blur(3)]),
      mark_numbers: sectioned([move, hold(0), blur(1), hold(1), blur(2), hold(2), blur(3)], ["Every move", "Mark 1", "Mark 2", "Mark 2", "Mark 3", "Mark 3", "Mark 4"]),
      hold_in_next_beat: sectioned([move, hold(0), blur(1), blur(2), hold(1), hold(2), blur(3)], ["Every move", "At the door", "To the window", "To the stairs", "To the stairs", "To the stairs", "To the camera"]),
      by_kind_not_beat: sectioned([move, hold(0), hold(1), hold(2), blur(1), blur(2), blur(3)], ["Every move", "Holds", "Holds", "Holds", "Blur", "Blur", "Blur"]),
      shared_last: sectioned([hold(0), blur(1), hold(1), blur(2), hold(2), blur(3), move], ["At the door", "To the window", "To the window", "To the stairs", "To the stairs", "To the camera", "Every move"]),
      hold_before_move: sectioned([move, hold(0), hold(1), blur(1), hold(2), blur(2), blur(3)], ["Every move", "At the door", "To the window", "To the window", "To the stairs", "To the stairs", "To the camera"]),
      missing_blur: sectioned([move, hold(0), blur(1), hold(1), hold(2), blur(3)], ["Every move", "At the door", "To the window", "To the window", "To the stairs", "To the camera"]),
    },
  };
}
