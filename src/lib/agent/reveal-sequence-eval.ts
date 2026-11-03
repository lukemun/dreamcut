import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { editorAgentOptionSchema, countOperationMutations } from "./timeline-editor-agent-apply";
import { applyProposalNumericOverrides } from "./proposal-overrides";
import { assertProposalControlBudget } from "./proposal-control-budget";

export const REVEAL_EVAL_VERSION = "reveal-controls-v1";
export const revealEvalCases = ["shared-gap-first", "independent-gaps-followup"] as const;
export function revealEvalPacket(id: string) {
  if (!revealEvalCases.includes(id as typeof revealEvalCases[number])) throw new Error("Unknown reveal eval case");
  const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const actors = Array.from({ length: 6 }, (_, i) => ({ element_id: uuid(i + 1), label: `Subject ${i + 1}`, presence: { seconds: 1, min_seconds: 0.2, max_seconds: 2 }, audio: [{ element_id: uuid(i + 7), offset_seconds: 0 }] }));
  const operations = actors.flatMap((a, i) => [
    { element_id: a.element_id, create_visual: { type: "video_clip" as const, source_url: `/api/projects/eval-reveals/media/subject-${i}.webm`, timeline_start: i * 0.4, source_start_seconds: 1, source_end_seconds: 2, source_duration_seconds: 4, playback_rate: 1, lane_key: `visual_${i}`, lane_index: i, subject_flash: 1, subject_glow: 1.8 } },
    { element_id: a.audio[0].element_id, create_audio: { type: "sound_effect" as const, volume: 1, fade_in: 0, fade_out: 0, playback_rate: 1, source_url: `/api/projects/eval-reveals/media/click-${i}.wav`, timeline_start: i * 0.4, source_start_seconds: 0, source_end_seconds: 0.1, source_duration_seconds: 1, lane_key: `audio_sfx_${i}`, lane_index: i } },
  ]);
  return { suite: REVEAL_EVAL_VERSION, case_id: id, fixture_version: 1, fixture_sha256: createHash("sha256").update(JSON.stringify({ actors, operations })).digest("hex"),
    request: id === "shared-gap-first"
      ? "Reveal these six prepared moving subjects in order. Keep them moving after appearing, with equal time between entrances. Let me adjust that shared interval and each subject's time on screen. Preserve appearance, sources and linked clicks."
      : "Now give me an individual delay between each consecutive pair. Preserve the current equal spacing as the defaults, each subject's duration, sources, appearance and linked clicks.",
    input: { option: { id: "reveals", label: "Reveals", summary: "Six prepared subjects", recommended: true, operations, requested_mutations: countOperationMutations(operations), review_controls: [] }, actors, start_seconds: 0 },
    constraints: "Return an existing proposal option, at most 15 visible numeric sliders. No coding, preparation jobs, approval or export. Prepared source identities are fixed. This synthetic component fixture has no playable media and is not the private footage trial.",
  };
}

/** Behavioral grading over existing override machinery, not a reference payload match. */
export function gradeRevealOption(id: string, raw: unknown) {
  const packet = revealEvalPacket(id);
  const checks: Record<string, boolean> = {};
  try {
    const option = editorAgentOptionSchema.parse(raw);
    assertProposalControlBudget({ elements: [], transitions: [] }, [option]);
    checks.schema_and_budget = true;
    const byId = (ops: typeof option.operations) => new Map(ops.map(op => [op.element_id, op]));
    const original = byId(packet.input.option.operations);
    const starts = (op: typeof option.operations[number]) => op.create_visual?.timeline_start ?? op.create_audio?.timeline_start;
    checks.preserve_baseline = option.operations.length === original.size && option.operations.every(op => isDeepStrictEqual(op, original.get(op.element_id)));
    const gaps = (option.timing_controls ?? []).map((c, i) => ({ c, i })).filter(({ c }) => c.bindings.some(b => b.field === "timeline_start"));
    const presence = (option.timing_controls ?? []).map((c, i) => ({ c, i })).filter(({ c }) => c.bindings.some(b => b.field === "source_end_seconds"));
    const exposed = (i: number) => option.review_controls?.some(r => r.target === "timing_control" && r.operation_index === i && r.field === "spacing_seconds");
    const presenceActors = new Set(presence.flatMap(({ c }) => c.bindings.filter(b => b.field === "source_end_seconds").map(b => option.operations[b.operation_index].element_id)));
    checks.controls = packet.input.actors.every(a => presenceActors.has(a.element_id)) && gaps.length === (id === "shared-gap-first" ? 1 : 5) && presence.length === 6 && [...gaps, ...presence].every(({ i }) => exposed(i));
    checks.gaps = gaps.every(({ c, i }, gapIndex) => {
      const value = 0.8;
      const tuned = applyProposalNumericOverrides(option, [{ operation_index: i, target: "timing_control", field: "spacing_seconds", value }]);
      const map = byId(tuned.operations);
      return packet.input.actors.every((actor, j) => [actor.element_id, actor.audio[0].element_id].every(elementId => {
        const before = original.get(elementId)!;
        const after = map.get(elementId)!;
        const shift = id === "shared-gap-first" ? j * (value - c.spacing_seconds) : j > gapIndex ? value - c.spacing_seconds : 0;
        const target = after?.create_visual ?? after?.create_audio;
        if (!target || Math.abs(starts(after)! - starts(before)! - shift) > 1e-7) return false;
        const restored = structuredClone(after);
        (restored.create_visual ?? restored.create_audio)!.timeline_start = starts(before)!;
        return isDeepStrictEqual(restored, before);
      }));
    });
    checks.presence = presence.every(({ i }) => {
      const tuned = applyProposalNumericOverrides(option, [{ operation_index: i, target: "timing_control", field: "spacing_seconds", value: 1.5 }]);
      const changed = tuned.operations.filter(op => !isDeepStrictEqual(op, original.get(op.element_id)));
      if (changed.length !== 1 || !changed[0].create_visual || changed[0].create_visual.source_end_seconds !== 2.5) return false;
      const restored = structuredClone(changed[0]); restored.create_visual!.source_end_seconds = 2;
      return isDeepStrictEqual(restored, original.get(restored.element_id));
    });
    checks.reset = isDeepStrictEqual(applyProposalNumericOverrides(option, []), option);
    return { case_id: id, pass: Object.values(checks).every(Boolean), checks, quality: "unreviewed", model_trial: false };
  } catch (error) { return { case_id: id, pass: false, checks, error: String(error), quality: "unreviewed", model_trial: false }; }
}
