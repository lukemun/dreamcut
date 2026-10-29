# Effects work in one click — v1

Suite `effect-one-click-v1` checks that picking a Templates effect builds it, whole and
working, in one card: the creator picks the effect, says what to apply it to, and the card
that arrives already has its sounds, shows only dials they can read, and has no dial that
errors. It backs step 7 of the [effect-authoring skill](../../.agents/skills/effect-authoring/SKILL.md):
every shared effect ships with a case here.

## What passes

A fresh agent gets only the effect's Templates card, the creator's footage (with any marks
and preparation the effect needs) and the creator's request. It stages a proposal. The grader
([effect-eval.ts](../../src/lib/agent/effect-eval.ts)) runs on that proposal with the editor's
own checks:

| Check | Passes when |
| --- | --- |
| `stages` | The card validates against the project as it stands |
| `one_card` | The effect is one compiled block of the effect's kind, not hand-built clips |
| `compiled_route` | No hand-written clips sit beside the block |
| `template` | The block's inputs select the effect's template (e.g. `template: "speed_hops"`) |
| `template_choices_left_alone` | No setting the template fixes was set by hand |
| `sounds` | The effect's sounds are in the same card, from its own set, each locked to the picture |
| `fixed_choices_hidden` | No dial the template fixes reaches the card |
| `plain_dials` | No dial carries a name creators could not read (`JARGON_DIAL_LABELS`) |
| `main_dials` | At least one main dial and at most 15 sliders |
| `dials_work` | The dial sweep finds no dial that errors or does nothing at either end of its slider, and checks them all |

Each case also lists human questions (does it land, does every landing have its sound, can
the creator tune it from the main dials alone). A structural pass does not answer them.

## Cases

| Effect | Case | Readiness |
| --- | --- | --- |
| Speed hops (`FX-SPEED-HOPS-TO-CAMERA`) | `speed-hops-one-click-v1`, a private package from a creator's take with four marks, run with `pnpm eval:case` | Grader self-check passes (reference card passes; the hand-set style, missing-sound, hand-built and stale cards fail); a real staged card passes and the card it replaced fails. No model trial yet. |
| Speed Entrance & Exit (`FX-SPEED-ENTRANCE-EXIT`) | `speed-entrance-exit-footage-v1` (a stock take against a plain backdrop) and `speed-entrance-exit-poses-v1` (still poses over a picture), private packages from the shipped demos | Grader self-check passes (a pose card passes; without the template or the exit sound it fails); a staged pose card on a copy passes. The footage case needs its cut-out prepared during the run. No model trial yet. |

Every other shared effect is listed in `EFFECTS_WITHOUT_EVAL` with the reason it has no case;
`effect-eval.test.ts` fails when a shared effect has neither, and the list only shrinks.

## Run

- Grader self-check: `pnpm eval:effects:check`.
- A model trial: `pnpm eval:case private/editing-evals/<case> --provider claude|codex [--runs N]`
  with the editor running. The runner re-stamps the copied project's preparation receipts for
  unchanged bytes, so prepared clips stay ready in the attempt.

## Limits

- Development cases: the curator has seen the accepted result; not held out.
- The packages include the effect's prepared inputs (cut-outs), so a case tests building the
  effect, not segmentation or measurement; the agent's settle and takeoff times are not judged.
- Structural only. How the motion looks and the sound lands needs a person.
