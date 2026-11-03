import { readMetadata, type TimelineFile } from "@/lib/local-store/store";
import { getCompositionDimensions } from "@/lib/render/composition-adapters";
import { elementRectAt } from "@/lib/media-analysis/visual-overlap";
import { isCamera } from "@/lib/timeline/camera";
import { timelinePayload } from "@/lib/local-store/timeline-payload";
import { proposalControlTier } from "./proposal-controls";
import { proposalDialSlider } from "./proposal-dial-range";
import { applyProposalReviewOverrides } from "./proposal-overrides";
import { reviewOption, type ProposalFieldChange, type ProposalOptionReview } from "./proposal-review";
import { previewEditorAgentProposal, type EditorAgentProposal } from "./timeline-editor-agent-apply";

export type DialSweepFailure = { option_id: string; label: string; field: string; operation_index: number; value: number; main: boolean; message: string; block_id?: string };
/** A dial whose two slider ends look and sound the same in the card's preview: moving it does nothing. */
export type DialSweepDead = { option_id: string; label: string; field: string; operation_index: number; main: boolean; from: number; to: number; block_id?: string };
export type DialSweep = { failures: DialSweepFailure[]; dead: DialSweepDead[]; checked: number; unchecked: number };

/** Time a card's save may spend dragging dials; main dials go first, so they are always covered. */
const SWEEP_BUDGET_MS = 3000;

/** The slider ends a creator can drag a card's dial to, in stored (native) units, exactly as the card draws them. */
export function dialSweepValues(change: ProposalFieldChange, option: { rows: ProposalOptionReview["rows"]; adjustment_rows?: ProposalOptionReview["adjustment_rows"] } = { rows: [] }): number[] {
  if (typeof change.after_value !== "number") return [];
  const slider = proposalDialSlider(option, change, () => undefined);
  if (!slider) return [];
  const native = (display: number) => slider.spec.fromDisplay?.(display) ?? display;
  return [...new Set([slider.range.min, slider.range.max])].map(native);
}

/**
 * Drags every numeric dial on every option to both ends of its slider and builds the preview there,
 * through the same override, derivation and payload steps the card's preview uses. A dial that fails at
 * either end shows the creator an error while tuning.
 */
export async function sweepProposalDials(projectId: string, timeline: TimelineFile, proposal: EditorAgentProposal, budgetMs = SWEEP_BUDGET_MS): Promise<DialSweep> {
  const sweep: DialSweep = { failures: [], dead: [], checked: 0, unchecked: 0 };
  if (proposal.decision !== "propose") return sweep;
  const started = performance.now();
  const previewAt = (option: EditorAgentProposal["options"][number], candidate: EditorAgentProposal) => {
    const preview = previewEditorAgentProposal(candidate, option.id, timeline);
    reviewOption(timeline, preview.option);
    timelinePayload(projectId, preview.timeline, preview.laneOrderKeys, preview.outputFormat, preview.mutedLaneKeys);
    return preview.timeline;
  };
  const canvas = getCompositionDimensions(readMetadata(projectId).output_aspect_ratio);
  for (const option of proposal.options) {
    // A card that cannot preview as authored fails for a reason no dial causes: report it once.
    try { previewAt(option, proposal); } catch (error) {
      sweep.failures.push({ option_id: option.id, label: "The card itself", field: "", operation_index: -1, value: Number.NaN, main: true,
        message: (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 300) });
      continue;
    }
    const review = reviewOption(timeline, option);
    const changes = review.adjustment_rows.flatMap(row => row.changes)
      .map(change => ({ change, main: proposalControlTier(change, option.review_controls) === "main" }))
      .sort((a, b) => Number(b.main) - Number(a.main));
    const range = review.playback_range;
    for (const { change, main } of changes) {
      const values = dialSweepValues(change, review);
      const derivedEnds: TimelineFile[] = [];
      for (const value of values) {
        if (performance.now() - started > budgetMs) { sweep.unchecked++; continue; }
        // Each preview is a few milliseconds of work; stepping aside between them lets the editor's
        // polls and previews answer while a card stages instead of waiting seconds behind it.
        await new Promise(resolve => setImmediate(resolve));
        sweep.checked++;
        try {
          const derived = previewAt(option, applyProposalReviewOverrides(proposal, option.id, [{ operation_index: change.operation_index, target: change.target, field: change.field, value }] as Parameters<typeof applyProposalReviewOverrides>[2], timeline));
          derivedEnds.push(derived);
        } catch (error) {
          sweep.failures.push({ option_id: option.id, label: change.label, field: change.field, operation_index: change.operation_index, value, main, ...(change.block_id ? { block_id: change.block_id } : {}),
            message: (error instanceof Error ? error.message : String(error)).replace(/\s+/g, " ").slice(0, 300) });
        }
      }
      if (values.length === 2 && derivedEnds.length === 2 && looksTheSame(derivedEnds[0]!, derivedEnds[1]!, range, canvas))
        sweep.dead.push({ option_id: option.id, label: change.label, field: change.field, operation_index: change.operation_index, main, from: values[0]!, to: values[1]!, ...(change.block_id ? { block_id: change.block_id } : {}) });
    }
  }
  return sweep;
}

/**
 * Whether two dial positions look and sound the same across the card's preview: every clip and transition
 * is identical (cameras only count through what follows them), and every picture sits in the same place
 * at evenly spaced moments. Screen positions are only sampled when everything else already matches.
 */
function looksTheSame(first: TimelineFile, second: TimelineFile, range: { start_seconds: number; end_seconds: number } | undefined, canvas: { width: number; height: number }) {
  const content = (derived: TimelineFile) => JSON.stringify([
    derived.elements.filter(element => !element.removed_at && !isCamera(element)).map(({ updated_at: _updated, ...element }) => element),
    derived.transitions ?? [],
  ]);
  if (content(first) !== content(second)) return false;
  // The same moments for both ends, from the visible clips (a camera's own length never moves them).
  const shownEnd = (derived: TimelineFile) => Math.max(0, ...derived.elements.filter(element => !element.removed_at && !isCamera(element)).map(element => element.timeline_start + element.duration));
  const start = range?.start_seconds ?? 0;
  const end = range?.end_seconds ?? Math.max(shownEnd(first), shownEnd(second));
  const moments = Array.from({ length: SIGNATURE_SAMPLES + 1 }, (_, index) => Math.min(end - 1e-3, start + (end - start) * index / SIGNATURE_SAMPLES));
  const frames = (derived: TimelineFile) => {
    const elements = derived.elements.filter(element => !element.removed_at);
    const shown = elements.filter(element => !isCamera(element));
    return JSON.stringify(moments.map(at => shown.map(element => {
      try {
        const box = elementRectAt(element, at, elements, canvas);
        return box ? [Math.round(box.x), Math.round(box.y), Math.round(box.width), Math.round(box.height)] : null;
      } catch { return "?"; }
    })));
  };
  return frames(first) === frames(second);
}

/** Moments sampled across the preview when comparing two dial positions. */
const SIGNATURE_SAMPLES = 24;

/** Where a dial lives, for the agent: a block setting by name, or an operation field by index. */
function dialPlace(dial: { operation_index: number; field: string; block_id?: string }) {
  return dial.block_id ? `block ${dial.block_id} setting ${dial.field}` : `operation ${dial.operation_index} ${dial.field}`;
}

/** The card is refused when a main dial does nothing: the creator would move it and see no change. */
export function deadMainDialMessage(sweep: DialSweep) {
  const dead = sweep.dead.filter(item => item.main);
  return dead.length ? `These main dials change nothing in the preview from one end of their slider to the other, so the creator would move them and see no change: ${dead.slice(0, 8).map(item => `"${item.label}" (${dialPlace(item)}, ${Number(item.from.toFixed(3))} to ${Number(item.to.toFixed(3))})`).join(", ")}. Make the dial drive the visible result (for example a move that scales with its length) or drop it from review_controls, then stage the card again.` : null;
}

/** One warning naming each failing dial, for the agent to repair before presenting the card. */
export function dialSweepWarnings(sweep: DialSweep): string[] {
  const warnings: string[] = [];
  if (sweep.failures.length) {
    const lines = sweep.failures.slice(0, 8).map(failure => failure.operation_index < 0
      ? `the card does not preview as written: ${failure.message}`
      : `"${failure.label}" (${dialPlace(failure)}${failure.main ? ", main dial" : ""}) fails at ${Number(failure.value.toFixed(4))}: ${failure.message}`);
    warnings.push(`Dials that break the preview at the end of their slider, so the creator would hit an error while tuning: ${lines.join("; ")}${sweep.failures.length > 8 ? `; and ${sweep.failures.length - 8} more` : ""}. Fix the operation or drop the dial, then stage a replacement card.`);
  }
  if (sweep.dead.some(dead => !dead.main)) warnings.push(`Advanced dials that change nothing in the preview from one end of their slider to the other: ${sweep.dead.filter(dead => !dead.main).slice(0, 8).map(dead => `"${dead.label}" (${dialPlace(dead)})`).join(", ")}.`);
  if (sweep.unchecked) warnings.push(`${sweep.unchecked} slider ends were not checked within the time limit (main dials were checked first).`);
  return warnings;
}
