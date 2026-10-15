---
name: motion-graphics
description: Route any motion graphics request to the right DreamCut workflow: timeline-native semantic motion, a Hyperframes animation overlay, or both. Use for animated titles, kinetic type, animated graphics, logo stings, or revisions to existing motion.
---

# Motion graphics

Read `../open-edit-proposals/SKILL.md` before timeline work. This skill routes; the craft skills below do the work.

## Route the request

**Timeline-native motion** (default): animated text, titles, callouts, graphic labels, transitions, retiming existing motion.
Read `../video-typography/SKILL.md`, `../visual-timing/SKILL.md`, `../spatial-composition/SKILL.md`, and `../video-compositing/SKILL.md`.
Author motion semantically: named 3x5 safe-grid slot, size class, named-slot motion. Deterministic code derives the internal transform keyframes; never author raw keyframes. Effects must use allowlisted derived-effect roles backed by an editable effect graph. Keep text native and editable; never bake copy into image cards.

**Hyperframes overlay**: self-contained animation compositions (logo stings, complex multi-element animation, reusable animation assets).
Manual path, only when the creator builds an animation themselves in Generate → Motion graphics (agents use `motion_graphic_prepare` instead): `pnpm hyperframes-overlay scaffold`, `check`, `preview`, then `render --approved` after their Studio approval.

**Creator asks in chat → proposal.** In the editor, use `motion_graphic_prepare` with the composition files (and `assets` copied from project media), poll `motion_graphic_status` if it is still rendering, then `proposal_create` with `create_visual` (`video_clip`, `has_alpha: true`, `source_url`, source window 0 to `duration_seconds`) on its own visual lane. The proposal is the approval point; do not ask the creator to approve in Generate. Coding agents outside the editor use the same path through `pnpm hyperframes-overlay prepare <project> <id> --spec @spec.json --json`.

Write the motion you judge best; creator controls are optional and never required. When a value is cheap to expose and likely to change (copy, brand color, a count, a hold), declare it in `dreamcut.controls.json` beside `index.html` and read it from `window.__dreamcut.controls` / `.segment_durations`, falling back to the same defaults so Studio preview matches. Declared controls appear on the proposal card; a creator's change re-renders in the background and swaps the proposed clip. Tag elements a person may want to move with `data-actor="<id>"` and list them as actors. Pick each control's kind by what the creator decides, using the [dial table](../../../docs/standards/editor-controls.md#dials-on-proposal-cards-and-motion-graphics): an amount is a `number`, one of several named things is a `choice` (name options after the creator's words with `label_from`), a yes/no is a `switch`. Derive what follows from another control rather than offering both. A `choice` may also set the render size (`canvas`), and a switch may mark a full-frame graphic as opaque on purpose (`opaque_control`); see the [explainer looks](templates/explainer-looks.md). Validation fails for a broken file, a declared value the code never reads, or a `number` with a handful of whole-number positions and no unit (that is a pick: use a `choice`). Mark a control `"fixed": true` when where the graphic is placed decides it (which section a header announces, its length): it still renders but is never offered as a dial. Which controls a card leads with is chosen per card ([proposal-dial-selection](../proposal-dial-selection/SKILL.md)). Label each control in one or two plain words a non-technical creator would say ("Chart start", "Wiggle", "Speed", "Title time"), not the code's terms ("Ticker volatility", "Build length"); labels share one line with the slider. See the [design](../../../docs/architecture/model-authored-motion-graphics.md#optional-composition-manifest).

**Timing is a knob, not a constant.** When a composition's length or moments matter to anything else
(sounds, the edit after it), expose them as number controls (for example `pace`, `title_hold`) and declare
a `timing` block in `dreamcut.controls.json`: `duration` and named `cues`, each a formula over number
controls (`"4.2 * pace + title_hold"`; numbers, control ids, + - * / ( ) and min/max). The composition's
code must place the same moments at the same times. Renders record the resolved timing, so changing a
knob on the proposal card or in Properties moves what is linked to it. Give sounds for those moments as
separate `create_audio` clips with `follows_visual: { element_id, cue, offset_seconds }`, link their levels
with one dial (`linked_operation_indices`), and set `ripple_after: true` on an inserted clip (an opener)
so a longer render pushes the rest of the edit. A follow-up proposal unlinks with `clear_props:
["follows_visual"]` when the creator wants to change sounds one by one.

**The creator's own Library.** When the creator asks to keep a graphic they will reuse (their opener,
a sting), call `motion_library_save` with the placed clip's element_id and a name they will ask for; its
linked sounds and placed values are saved with it. In another project, `motion_library_list` then
`motion_library_use` (override values such as an episode number) renders it there and returns the render
and sounds; place them with one `proposal_create` (create_visual plus create_audio with `follows_visual`).
This is the personal Library, not Templates: Templates are treatments for other people to follow.

Inspect frames before proposing: `npx hyperframes snapshot --output <scratch dir> --at <times> --describe false <composition dir>`. Keep snapshots outside the composition folder; files there change its fingerprint. Pass `request`, `feedback_ids` and your `model` so the audit trail can attribute the work.

A self-contained piece whose motion is the point, such as a logo sting, may stay one composition while this is an experiment (from 2026-10-10). The `open-edit-proposals` rule against full-scene composites still applies to scenes assembled from separable objects.

**Synthesized sound**: for abstract motion sounds (whooshes, hits, ticks, risers), use `sound_synth_prepare` with `synth_js` defining `render({ sampleRate, controls, random })`, then propose it with `create_audio` (`sound_effect`) as its own independent proposal beside the visual. Equal source, values and seed give identical bytes. Use library SFX from the sound-design skill when a realistic sound fits better. A waveform does not prove how a sound sounds; say so when reporting.

**Both**: when one request needs timeline graphics and overlay animation, keep independently reviewable actors as separate proposals so each can be approved or rejected on its own.

## Packaged templates

[Word Search Trace](templates/word-search-trace.md): a letter grid with hand-drawn outlines around one hidden word per cut.

Explainer set: each template is one composition with five switchable [explainer looks](templates/explainer-looks.md) and a canvas sized to the project. Use one when a creator wants to explain their own work in motion, without footage:
- [Explainer Sequence](templates/explainer-sequence.md): title, key point, a number counting up, three steps, a closing line.
- [Animated Chart](templates/animated-chart.md): bars or a line that build up, with counting values and a highlight.
- [Plan Comparison](templates/plan-comparison.md): two or three plans, prices, feature ticks and a badged favourite.
- [Walkthrough Steps](templates/walkthrough-steps.md): numbered steps, each with a screenshot.
- [Kinetic Type](templates/kinetic-type.md): a phrase landing word by word on a beat.

## Revisions

Revisions to existing motion are edits, not new builds: route through `proposal_create` with the changed actor only. For retiming across many elements, prefer one proposal per independently tweakable actor.

## Verification

Use frame-state for pixel proof of representative frames: `pnpm frame-state <project-id>`, or in the editor `run_instrument` (frame-state) then `timeline_evidence`.

Effect changes require `pnpm verify:effect-primitives`.
