# effect-authoring — evolution log

## Purpose

Let a creator turn an effect that works in their edit into an effect they (or, when the owner
ships it, every creator) can pick from Templates and have an agent rebuild on new footage.
Success means the card says what to supply and what is left out, the owning skill holds every
build step, personal media and assets stay in the creator's profile, and an agent with only the
card and the skill can rebuild the effect as a proposal. Recreating an effect from someone
else's video stays with [recreate-effect](../recreate-effect/SKILL.md).

## 2026-10-27 — Created from the Speed Entrance & Exit session

- **Observation:** After a long session building the speed effect on the creator's walk
  (mark-to-mark hops, an exit past the camera, sounds extracted from the tutorial), the creator
  asked to package "the whole speed thing, with the sound effects", without captions or colour
  grading, and asked whether an author-effect skill existed. Packaging guidance existed only
  as a reference inside recreate-effect, written for effects copied from a reference, and the
  creator's own Templates card still carried the first, unverified brief.
- **Decision:** A skill of its own for packaging a working edit: scope in and out by the
  creator's words, put the build in the owning skill, choose Yours or shared by what the media
  shows and who may redistribute it, write the brief, keep personal assets in the profile, and
  check by tracing a fresh request. The shared-card steps moved here as
  [template packaging](references/template-packaging.md).
- **Verification:** Applied the same day as "Speed hops to camera" in the creator's Templates,
  with their finished version and raw take; see speed-entrance-exit's evolution log. The first
  attempt rewrote the shared Speed Entrance & Exit card, and the creator could not find their
  effect: it looked like the bobblehead demo. Hence the rule that a fuller sequence is its own
  card that leads with the creator's version. Fresh-footage reuse is untested.

## 2026-10-28 — The one-click bar

- **Observation:** The first fresh build of the packaged Speed hops card on the creator's
  take did not work in one click. The card's request named the skill but no template input,
  so the block defaulted to the other variant and the agent restaged it; the agent copied
  stops, windows and timings from an earlier build because nothing measured them; the skill
  sent the hop sounds as a second card, which never came; the dials were internal words
  ("Variant", "Travel", "Empty beat", "Every hop"); and 27 derived per-clip sliders errored
  when touched. `proposal_create` had returned that last one as a warning. The creator asked
  that every effect be one click, and whether there was an authoring skill and an eval
  ([retro](../../../docs/audits/2026-10-28-one-click-effects-retro.md), git-ignored).
- **Decision:** A new step 3, the one-click bar: one compiled route whose template input
  fixes the effect's choices, everything (sounds included) in one card, plain main dials with
  fixed settings hidden, a clean `dial_sweep` on a disposable copy, measurements from named
  tools or listed as limits, sound placement checked from the card, and the card and skill
  re-read together after any route change. Step 8 (Check) proves it. The demo manifest's
  receipt is named as where to find the take a demo was built from. Later steps renumbered.
- **Verification:** Speed hops meets the bar after the same session's block change
  (`template: "speed_hops"`, `sounds`, `hidden` settings; restaged with an empty sweep on a
  disposable copy and on the creator's take). Measurement is still the agent's judgement there,
  a listed limit. No other effect has been checked against the bar yet; a per-effect eval is
  being built separately.

## 2026-10-28 — Each effect gets a one-click eval

- **Observation:** The owner: effects "need to be one-click working… an eval for each of them." Speed hops needed hand-passed settings and lost its sounds until its block gained a template input; nothing caught that before the creator did.
- **Decision:** Step 8 now gives every shared effect an `effect-one-click-v1` case: expectations in `EFFECT_EVALS` (src/lib/agent/effect-eval.ts), reference and known-bad cards in its test, and a private package from real footage run with `pnpm eval:case`. Effects without a case are listed with a reason in `EFFECTS_WITHOUT_EVAL`, which only shrinks; the test fails on a shared effect with neither.
- **Verification:** `pnpm eval:effects:check` (reference passes; hand-set style, missing sounds, hand-built and stale cards fail). On the creator's take the one-click card passes and the card it replaced fails on template, hand-set style, 0 of 3 sounds and shown fixed dials. No model trial yet.

## 2026-10-28 — A template is a starting point

- **Observation:** After the closing exit was added to Speed hops, the owner: a template
  "shouldn't be an exact thing… their instance could be a bit different. It may not have an
  exit, or it may have an exit. On the card, yes, we should have an exit." Step 3 said a
  template input "fixes every choice the effect has already made", which read as one exact
  result; the exit shipped without an off position, although AGENTS.md already requires one
  for visible motion. speed-entrance-exit recorded the lesson for its own template only
  ([retro part 2](../../../docs/audits/2026-10-28-one-click-effects-retro-part-2.md), git-ignored).
- **Decision:** Step 3 says the template fixes what makes it this effect, the agent fits the
  card to each take, and a part a creator may not want (an exit, a flourish) is a dial with an
  off position that keeps its clips. Hidden settings are the defining variant only.
- **Verification:** Walkthrough against the Speed hops card as it stands (Leaves: out the
  side, past the camera, Stays; `variant` hidden). Skill purpose and catalog tests pass.

## 2026-10-29 — Shared effects take their sounds from the shared library

- **Observation:** Shipping the Flash effect, the owner asked that anything in a published effect be in the shared library, fetched from DreamCut Cloud. Its shutter click was already in the members' list.
- **Decision:** Step 6 requires a shared effect's sounds to be in the shared library (catalog or the Cloud members' list) before it ships; demos stay silent when the sound is not cleared for the repository.
- **Verification:** Applied to FX-FLASH-EFFECT (Camera 02 Shutter Click, members).

