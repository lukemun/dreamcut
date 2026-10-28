# color-grading evolution

## Purpose

Turn a creator's colour request into a proposal whose grade is close on the first card and
tunable with the right wheel, curve or slice, using the `dreamcut-scene-v2` model.
Success: the creator reaches the look by adjusting the card's main dials, without asking
for a different tool, and HDR clips keep their highlight detail.

Boundaries: proposal mechanics belong to dreamcut-proposals and dial choice to
proposal-dial-selection. Personal colour taste belongs in My Style, not here.

## 2026-10-23: created with the v2 grade model

Observation: the grade engine was rebuilt to match Resolve's architecture (float, scene
linear, tone map at output) and gained offset, wheels, nine curves and colour slice. The
agent surface exposes them as list fields, and proposal cards render the same wheel and
curve controls as Properties.

Decision: one craft skill that maps common requests to the tool that owns them, with value
formats and the grade axis spelled out, since list values are easy to get wrong.

Verification: field names, ranges and the list formats were checked against
`src/lib/timeline/effect-controls.ts` and `pnpm check:parameter-contract`. Not yet
measured against creator sessions.

## 2026-10-23 — copy/paste grade and shot match

Problem: matching shots and reusing a grade meant re-entering values clip by clip; Resolve's
copy grade and shot match had no equivalent.

Change: Properties → Color has Copy grade, Paste grade (every selected picture clip, one undo,
keyframes flattened at the playhead, look file only within its own project) and Match to…;
agents use `color_shot_match` and propose the returned props. The solver measures both clips in
CIELAB as they display and moves only exposure, contrast, highlights, temperature, tint and
saturation, each within a limited reach, with a heavy penalty for clipping more highlights than the
reference.

Verification: `color-grade.test.ts`, `shot-match.test.ts` (recovers a known primary offset to
ΔE 0.04). On local footage a same-street pair moved by a few hundredths (ΔE 1.2 → 0); a sunny vs
overcast pair evened brightness without blowing the sky but still reads as two scenes. Not yet
measured against creator sessions; LUTs are not included in the measurement.

## 2026-10-24 — look matching as proposal cards

Problem: the creator found Copy grade / Paste grade and a Match to… filename list opaque: nothing said
what would change, and they applied at once. It was Resolve's interface, not the outcome.

Change: Color → Match a clip / Copy a clip's look waits for a click on the reference clip in the
timeline and drafts one proposal card per selected clip (`/analysis/look-cards`). The card title names
both clips, its line says what changes ("Brighter by 1.1 stops, softer contrast, warmer…"), and it
previews, tunes and applies like any card. Agents use `color_look_cards`, which returns the same
cards for `proposal_create`. The clipboard and the immediate-apply match were removed.

Verification: on the disposable `zz-shot-match-check`, both actions drafted cards that validated,
previewed on the timeline and showed the change in words; `look-cards.test.ts` covers the wording.
Not yet tried by a fresh reviewer; the card was not applied (approval is the creator's).

## 2026-10-24 — film look

Problem: no grain, halation, bloom, vignette or split tone, the finishing treatments Resolve users
reach for after a grade.

Change: Film Look (`timeline/film-look.ts`): 14 fields with keyable strengths, a CanvasKit stage
after color map (`canvaskit-film.ts`), a Standard approximation (`FilmLookFilter`), Effects → Film
Look dials, and a "Finish with a film look" table here. Agents propose it as ordinary cards.

Verification: unit tests; CanvasKit property proofs show each treatment drawing, repeat-seek exact,
reset clean; Standard matches for split tone and vignette, differs for grain pattern and glow
edges (recorded in gpu-catalog-coverage.md). A film-look card on a disposable project validated
and previewed. Not yet measured against creator sessions or a model eval.

## 2026-10-27 — Check a grade with frames that exist

Problem: in a tutorial-editing session the agent posted two grade cards on the presenter (three looks, then three warmth
amounts) without seeing a graded face. Step 2 said to check "`proposal_preview` frames", but
`proposal_preview` returns the derived timeline, not pictures, so the agent gave up the check
both times. (Copying the creator's brightness change to all 48 shots was hand-built as one card;
`color_look_cards` mode `same` returns one card per clip, which would have been 47 cards. That gap
is recorded as later work in project status.)

Change: step 2 now renders the card with `pnpm frame-state <id> --proposal-file … --option …`.

Verification: `frame-state` accepts `--proposal-file` and `--option` (its usage line). Not yet
run by a fresh agent.
