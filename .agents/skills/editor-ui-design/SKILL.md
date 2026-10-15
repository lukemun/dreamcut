---
name: editor-ui-design
description: Audit or change DreamCut editor UI and creator-facing documentation, including Properties, timeline controls, drawers, onboarding and media import. Use for UX audits and before any editor UI change, including styling, headings and disclosures; covers nontechnical creator review, task placement, shared interactions, visual review, and regression enforcement. Does not choose an editorial treatment or mutate a project timeline.
---

# Extend the editor coherently

Deliver a feature the creator can find, understand, adjust and undo within the existing editor. Read the [UI architecture](../../../docs/architecture/editor-ui.md), [feature integration standard](../../../docs/standards/editor-feature-integration.md), [inspector standard](../../../docs/standards/inspector-information-architecture.md), and [form controls](../../../docs/standards/form-controls.md). These own the rules; this skill owns execution.

## Establish the task and baseline

Use the requested behavior, affected selection types and current editor as inputs. Inspect the real UI and its owning components before proposing navigation. When a reference or running app is unavailable, continue the code inventory and mark visual assessment unverified. Do not invent screenshots or claim a written walkthrough is a usability test.

For an audit, inventory all affected domains, headings, controls, actions and disclosures. Trace each to its owner and saved value. Distinguish observed UI behavior, source findings and inferred causes. Include empty selection, ordinary video, transparent picture, still, text, audio, transition and multi-selection; mark every unexercised case. Inspect both workspace layouts and narrow panel widths. Preserve the user's workspace preferences after temporary inspection.

Flag session-specific shortcuts that duplicate general controls; use the rhythm viewer's removed **Last 10s** button as the [feature integration anti-example](../../../docs/standards/editor-feature-integration.md#avoid-session-specific-shortcuts). For detection tools, check whether a person can manually add or correct a missed event without rerunning analysis.

## Design before adding a control

Write the creator task in one sentence, its single canonical home, applicable selections, value/unit, animated versus static behavior, commit/cancel/reset/undo semantics and existing primitive to reuse. State what existing UI is replaced or consolidated. If nothing is removed, justify the additional visible control. Follow the standard's review record; keep it proportional to the change.

For a reference effect, use [recreate-effect](../recreate-effect/SKILL.md) for rendering capability and this skill for its editor integration. Recipe-specific instructions belong in the recipe, not a general property row. For normal timeline editing use [open-edit-proposals](../open-edit-proposals/SKILL.md).

## Choose shared presentation components first

Before editing JSX, read the [component map and hierarchy](../../../docs/standards/editor-controls.md#properties-hierarchy-and-shared-sections), even for a small styling fix.
Map each affected section, item, disclosure and property row to its existing owner:

- `InspectorSection` with a registered `sectionId` owns sections; `InspectorHeading` owns their typography.
- `InspectorItemHeader` owns subordinate names, optional enable controls and trailing actions.
- `InspectorDisclosure` owns optional details/tools such as Video scopes. Do not substitute a full-width action button.
- `InspectorPropertyControl` and the numeric primitives below own property rows and gestures.

Import these components from the paths in the standard. Do not copy them into a
feature file or override their typography locally. If a shared primitive cannot
express the task, extend it and migrate the affected callers together. Record
which owners were reused or changed. Keep recipe orchestration in Properties → Templates;
Properties effects are independently applicable clip treatments.

Verify section → item → property hierarchy in the rendered panel: headings must
be stronger than their children, actions must be distinguishable from disclosures,
and narrow widths must not produce overlapping labels. Run the existing gates
without weakening their assertions or legacy allowances. Report untested layouts
and interactions explicitly; source checks do not establish visual quality.

## Write for non-technical creators

Creators and their audiences are not editors or engineers. Every visible label, heading and message uses one or two everyday words for what the person sees or hears: "Sound effects" and "Volume", not "Linked items"; "Wiggle", not "Volatility"; the clip's name, not its id. Drop words the context already says (a row under "Chart" is "Start", not "Chart start price"). Show units as short suffixes (`s`, `x`, `dB`, `%`) beside the value. A compact property row keeps label, value and Reset on one line; if a label does not fit, shorten the words rather than wrapping the control. Never expose ids, field names, operation terms or file names.

## Numeric controls are a required gate

Read the [control examples and component map](../../../docs/standards/editor-controls.md) before implementing a property. Use `InspectorEffectNumber` for numeric effect values, `SliderScrubControl` for general slider + exact value + clickers, and `ScrubNumberInput` for justified number-only inputs. Do not author local numeric `<input>` / `<Input>` or range inputs. A shared row wrapper alone is not sufficient. Provide draft preview, cancellation and a single committed Undo entry. Run `pnpm check:editor-ui`; the numeric-input gate must pass without expanding its legacy allowance. The gate checks source structure, so also exercise slider, clicker, typing, Escape and Undo on a disposable fixture.

## Implement through shared owners

Properties sections use `inspector-sections.ts` and a required stable `sectionId`; labels never decide reachability. Reuse existing row, numeric, reset, keyframe and tab primitives. If an existing primitive cannot express the behavior, improve or extract it for all applicable consumers before adding a parallel widget. Keep tall and wide layouts on the shared inspector body. Do not silently remove a legacy path without checking its callers.

Separate selection/navigation from persisted edits. Preserve playback and draft state. New controls must bind to the same resolved element and local clock for display, preview and commit. Use the renderer/playback standards when those paths change; UI presence is not pixel proof.

## Test unaided editing

For UX audits and changes to creator-facing help, onboarding or media workflows, include the [nontechnical creator judge](references/nontechnical-creator-judge.md). Launch a fresh sub-agent with no inherited implementation/conversation context when delegation is permitted; otherwise use an unfamiliar human or report independent review unverified. This is the documentation-and-discoverability branch of the existing fresh-eyes check, not a second reviewer for the same task. Apply its older-audience readability criteria to the affected surface. A full documentation audit inventories creator-facing material and developer-only material separately; it does not assume all repository instructions are end-user help.

First run the standard's separate placement audit: a visual-only reviewer states expected homes from the visible labels, then checks actual controls and tab changes. Record category contradictions independently of task success. Finding a control after searching does not prove its placement is coherent; both gates must pass.

Run the standard’s [fresh-eyes acceptance check](../../../docs/standards/editor-feature-integration.md#fresh-eyes-acceptance-check) for new or materially reorganized editing interactions. Prepare a disposable fixture and an outcome-only task. Use an unfamiliar human tester or a fresh agent without inherited conversation/code context; keep the implementer’s navigation instructions out of the test. Preserve tool safety instructions, but restrict the task to visible UI. Record independence, wrong turns, task completion, visible result and Undo. Do not coach a failed attempt and call it a pass. If no independent test ran, mark the check unverified. This is acceptance evidence for the UI, not authorization to change the creator’s working cut.

## Verify and report

Run `pnpm check:editor-ui` and `pnpm typecheck`. Run relevant behavioral tests for the changed interactions; retain existing failures and report attribution rather than weakening checks for unrelated drift. Verify a control from selection through finding it, tuning it, cancel/reset/undo and selection change on a disposable fixture when edits are needed. Do not use the creator's working cut as a destructive test fixture.

Capture before/after UI evidence for the changed domain in tall and wide layouts, including a narrow panel and keyboard access. Check supported selection types, not only the author's project. Keep private project screenshots local; use synthetic media for committed evidence. If only part is exercised, list the gap.

Report the outcome, exact UI path, checks, remaining defects and next bounded migration. For an audit, deliver a ranked findings table with evidence, owner, user impact, remedy and acceptance check. A new skill or passing static check does not prove visual cohesion. Do not close a full redesign while only routing or documentation changed.

## Learned refinements

- For repeated duration parameters, provide one compact shared main control in seconds, place per-item overrides in Advanced, and keep frame counts secondary.
