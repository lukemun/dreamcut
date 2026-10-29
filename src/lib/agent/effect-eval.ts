import { readTimeline } from "@/lib/local-store/store";
import { proposalSliderCount } from "./proposal-control-budget";
import { proposalControlTier } from "./proposal-controls";
import { sweepProposalDials } from "./proposal-dial-sweep";
import { reviewOption } from "./proposal-review";
import { validateEditorAgentProposalAgainstProject, type EditorAgentProposal } from "./timeline-editor-agent-apply";

/**
 * effect-one-click-v1: does picking a Templates effect build it, whole and working, in one card?
 * A fresh agent gets only the effect's card and the creator's footage, and stages a proposal. This
 * grades that proposal with the checks the editor itself runs (validation, the card's dials and the
 * dial sweep) plus each effect's own expectations: its compiled route, the choices its template
 * fixes, its sounds. Structural only; how the motion looks and sounds stays a human question.
 * Contract: docs/evals/effect-one-click.md. Every shared effect has a case or a reason in
 * EFFECTS_WITHOUT_EVAL (effect-eval.test.ts enforces it).
 */
export const EFFECT_EVAL_VERSION = "effect-one-click-v1";

/** Dial names creators could not read; a card that shows one is not one click. */
export const JARGON_DIAL_LABELS = ["Variant", "Travel", "Empty beat", "Leaves toward", "Streak length"];

type BlockLike = { block_id: string; kind: string; inputs: Record<string, unknown>; settings?: Record<string, unknown> };
type Operation = EditorAgentProposal["options"][number]["operations"][number];

export type EffectExpectation = {
  recipe_id: string;
  /** The private case packages `pnpm eval:case` runs (private/editing-evals/<case>). */
  case_packages: string[];
  /** The compiled route the effect must use, and the inputs that select its template. */
  block: { kind: string; inputs: Record<string, unknown> };
  /** Settings the template fixes: never authored by hand and never shown as dials. */
  fixed_settings: string[];
  /** Sounds the effect brings with it, counted from the block's inputs. */
  sounds?: { count: (inputs: Record<string, unknown>) => number; source: RegExp };
  human_questions: string[];
};

export const EFFECT_EVALS: Record<string, EffectExpectation> = {
  "FX-SPEED-HOPS-TO-CAMERA": {
    recipe_id: "FX-SPEED-HOPS-TO-CAMERA",
    case_packages: ["speed-hops-one-click-v1"],
    block: { kind: "hop_sequence", inputs: { template: "speed_hops" } },
    fixed_settings: ["variant", "travel_percent", "empty_beat_frames", "direction"],
    sounds: { count: hopCount, source: /tutorial-speed-sfx/ },
    human_questions: [
      "Play it at normal speed: does each hop land on its spot, with you visible the whole way?",
      "Does every landing have its whoosh, at the moment you land?",
      "Could you tune it from the main dials alone, without reading any help?",
    ],
  },
};

/**
 * Shared effects with no one-click case yet, and why. This list only shrinks: a newly shared effect
 * ships with its case (effect-authoring step 7).
 */
/** One whoosh per hop: the opening entrance, each move between stops and the closing exit. */
function hopCount(inputs: Record<string, unknown>) {
  return (inputs.first_entrance ? 1 : 0) + Math.max(0, ((inputs.stops as unknown[] | undefined)?.length ?? 0) - 1) + (inputs.closing_exit ? 1 : 0);
}
EFFECT_EVALS["FX-SPEED-ENTRANCE-EXIT"] = {
  recipe_id: "FX-SPEED-ENTRANCE-EXIT",
  case_packages: ["speed-entrance-exit-footage-v1", "speed-entrance-exit-poses-v1"],
  block: { kind: "hop_sequence", inputs: { template: "entrance_exit" } },
  fixed_settings: ["variant", "empty_beat_frames"],
  sounds: { count: hopCount, source: /tutorial-speed-sfx/ },
  human_questions: [
    "Play it at normal speed: do you streak in, stand, and streak out, staying visible through the blur?",
    "Does each streak have its whoosh, landing as you arrive and as you set off?",
    "With still poses: does the walking pose read as moving and the standing pose as standing?",
  ],
};

EFFECT_EVALS["FX-FLASH-EFFECT"] = {
  recipe_id: "FX-FLASH-EFFECT",
  case_packages: ["flash-effect-one-click-v1"],
  block: { kind: "flash_sequence", inputs: {} },
  fixed_settings: [],
  sounds: { count: inputs => inputs.sound ? ((inputs.poses as unknown[] | undefined)?.length ?? 0) : 1, source: /Shutter_Click/ },
  human_questions: [
    "Play it at normal speed: does each pose land white for a frame, then show in colour, getting closer to the camera?",
    "Does every flash have its shutter click, right on the flash?",
    "Does the take go live at the camera with no jump?",
  ],
};

export const EFFECTS_WITHOUT_EVAL: Record<string, string> = {
  "FX-MASK-GLITCH-GLOW": "Hand-keyed flash and glow; needs the reveal-sequence block (a recipe today).",
  "FX-CLONE-FLASH": "Hand-written copies; needs the reveal-sequence block with stacked lanes.",
  "FX-PAPER-CUTOUT": "Hand-written outline clip; needs the reveal-sequence block's single-subject case.",
  "FX-SILHOUETTE-WINDOW": "Hand-linked fill clips; needs the reveal-sequence block with a window preset.",
  "FX-MOVING-GRID-MATTE": "Native props on the clip; needs a block for a treatment on an existing clip.",
  "FX-VIDEO-LETTERS": "Hand-written native title; needs a text/title block.",
  "FX-WORD-SEARCH-TRACE": "Motion graphic pasted from files; needs shipped templates by id and a placement block.",
  "FX-MOTION-SKETCH-3D": "Motion graphic with an agent-written scene; needs shipped templates by id and a placement block.",
  "FX-CROSS-NEGATIVE": "Hand-written masks and stills; no existing builder fits.",
};

export type EffectGrade = {
  suite: string; recipe_id: string; pass: boolean;
  checks: Record<string, boolean>; failures: string[]; human_questions: string[];
};

/** Grade a staged proposal on its project as it stands now. */
export async function gradeEffectProposal(recipeId: string, projectId: string, raw: unknown): Promise<EffectGrade> {
  const expect = EFFECT_EVALS[recipeId];
  if (!expect) throw new Error(`No one-click eval for ${recipeId}; see EFFECTS_WITHOUT_EVAL`);
  const failures: string[] = [];
  const checks: Record<string, boolean> = {};
  const check = (name: string, ok: boolean, why: string) => { checks[name] = ok; if (!ok) failures.push(`${name}: ${why}`); };
  const result = (): EffectGrade => ({ suite: EFFECT_EVAL_VERSION, recipe_id: recipeId, pass: failures.length === 0, checks, failures, human_questions: expect.human_questions });

  let proposal: EditorAgentProposal;
  try {
    proposal = validateEditorAgentProposalAgainstProject(raw, 512, projectId);
    check("stages", proposal.decision === "propose" && proposal.options.length > 0, "the card proposes no option");
  } catch (error) {
    check("stages", false, error instanceof Error ? error.message.slice(0, 400) : String(error));
    return result();
  }
  if (!checks.stages) return result();
  const option = proposal.options.find(candidate => candidate.recommended) ?? proposal.options[0]!;
  const blocks = ((option as { blocks?: BlockLike[] }).blocks ?? []).filter(block => block.kind === expect.block.kind);
  const block = blocks[0];
  check("one_card", blocks.length === 1, blocks.length ? "the effect is split across several blocks" : `no ${expect.block.kind} block: the effect was hand-built instead of compiled`);
  if (!block) return result();
  const handWritten = option.operations.filter(operation => !operation.block_ref && (operation.create_visual || operation.create_audio || operation.create_text || operation.create_shape));
  check("compiled_route", handWritten.length === 0, `${handWritten.length} hand-written clip(s) beside the block`);
  const wrongInputs = Object.entries(expect.block.inputs).filter(([key, value]) => block.inputs[key] !== value).map(([key, value]) => `${key} must be ${JSON.stringify(value)}`);
  check("template", wrongInputs.length === 0, wrongInputs.join("; "));
  const authored = expect.fixed_settings.filter(name => block.settings && name in block.settings);
  check("template_choices_left_alone", authored.length === 0, `set by hand: ${authored.join(", ")}`);

  if (expect.sounds) {
    const want = expect.sounds.count(block.inputs);
    const sounds = option.operations.filter((operation: Operation) => operation.block_ref?.block_id === block.block_id && operation.create_audio);
    const locked = sounds.filter(operation => operation.create_audio!.follows_visual && expect.sounds!.source.test(operation.create_audio!.source_url));
    check("sounds", sounds.length === want && locked.length === want, `${sounds.length} sound(s), ${locked.length} from the effect's set and locked to the picture; want ${want}`);
  }

  const timeline = readTimeline(projectId);
  const changes = reviewOption(timeline, option).adjustment_rows.flatMap(row => row.changes);
  const shown = changes.filter(change => expect.fixed_settings.some(name => change.field === name || change.field.startsWith(`${name}.`)));
  check("fixed_choices_hidden", shown.length === 0, `the card shows ${shown.map(change => change.label).join(", ")}`);
  const jargon = changes.filter(change => JARGON_DIAL_LABELS.includes(change.label ?? ""));
  check("plain_dials", jargon.length === 0, `jargon dials: ${jargon.map(change => change.label).join(", ")}`);
  const main = changes.filter(change => proposalControlTier(change, option.review_controls) === "main");
  check("main_dials", main.length > 0 && proposalSliderCount(timeline, option) <= 15, `${main.length} main dial(s), ${proposalSliderCount(timeline, option)} sliders`);
  const sweep = await sweepProposalDials(projectId, timeline, proposal, 60_000);
  check("dials_work", sweep.failures.length === 0 && !sweep.dead.some(item => item.main) && sweep.unchecked === 0,
    [...sweep.failures.map(item => `${item.label} fails at ${item.value}`), ...sweep.dead.filter(item => item.main).map(item => `${item.label} does nothing`), ...(sweep.unchecked ? [`${sweep.unchecked} dial(s) unchecked`] : [])].join("; "));
  return result();
}
