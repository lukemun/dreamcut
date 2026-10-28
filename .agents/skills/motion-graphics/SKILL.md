---
name: motion-graphics
description: Route any motion graphics request to the right DreamCut workflow: timeline-native semantic motion, a Hyperframes animation overlay, or both. Use for animated titles, kinetic type, animated graphics, logo stings, or revisions to existing motion.
---

# Motion graphics

Read `../dreamcut-proposals/SKILL.md` before timeline work. This skill routes; the craft skills below do the work.

**Graphics over speech** (charts, diagrams, explainers that accompany what a speaker says): plan what each one shows with [explainer-visuals](../explainer-visuals/SKILL.md), then build it here.

## Route the request

**Every separable object is its own timeline element.** A logo, a title, a tagline, a word block, a stamp or a picture is something a creator may want to move, retime, restyle or delete on its own, so each one gets its own element on its own lane. Never draw two of them in one composition; `motion_graphic_prepare` refuses a composition that shows more than one at once, or that does not name its one object. One drawing that draws on in pieces passes only if the pieces join into one shape later; check with `npx tsx scripts/composition-object-probe.ts <dir>` before preparing. A Look the creator selected for a new scene is drawn in, not generated: see [a look on a new scene](templates/explainer-looks.md#a-look-on-a-new-scene).

**Timeline-native motion** (required for logos, titles, words and labels): animated text, titles, callouts, graphic labels, transitions, retiming existing motion. A logo is an image element; its spin, pop, glow and glitch are native animations and properties. Coordinate a lockup through timing on the separate elements, not by baking them together. Draw every outline as a native shape with `create_shape`, each on its own visual lane: a base shape (`rect`, `ellipse`, `polygon` with `shape_sides`, `star` with `shape_sides` and `shape_star_depth`, `line`, `arc` with `shape_arc_start/end`, `arrow` with `shape_arrow_head/shaft`), or `path` for anything else (a heart, a speech bubble, a squiggle, a traced logo mark) given as SVG path data in `shape_path_d`. Path data is stored as points the creator can drag on the canvas, so never fall back to an image or a composition for an outline. Fill, outline, corners and `shape_draw` (traces each outline from its first point) apply to all of them; keyframe `media_scale`, `media_offset_x/y`, `media_opacity`, `media_rotation` and `shape_draw`. To morph a path shape, give its outlines over time as SVG path data drawn in the same coordinates: `create_shape.keyframes.shape_contours` with `shape_path_d` for a new shape, or `props.shape_morph` for one already placed. Outlines may differ in points and contours; they are matched automatically, but a morph reads cleaner when partner outlines have similar point counts starting at matching places. Later proposals change a shape with `props` (any `shape_*` field, or `shape_contours` for its points). Tilt text with `rotationDeg`; colour a word or put a highlight box behind it with `wordStyles` (`[{index, color?, background?}]`, words counted from 0).
Read `../video-typography/SKILL.md`, `../visual-timing/SKILL.md`, `../spatial-composition/SKILL.md`, and `../video-compositing/SKILL.md`.
Author motion semantically: named 3x5 safe-grid slot, size class, named-slot motion. Deterministic code derives the internal transform keyframes; never author raw keyframes. Effects must use allowlisted derived-effect roles backed by an editable effect graph. Keep text native and editable; never bake copy into image cards.

**Hyperframes overlay** (only for one object whose motion native elements cannot make, such as letters cycling random glyphs, a particle burst or a drawn shockwave): one composition draws exactly that object. Declare it in `dreamcut.controls.json` as `"object": {"label", "native_gap"}`, where `native_gap` says in one sentence what native elements cannot do, and repeat that reason in the proposal option's rationale. Everything around it (the word's subline, the logo beside it, a backdrop) goes on native elements. Declare at most one actor. Packaged Templates that still draw several objects carry `"template"` and are a recorded gap (`MULTI_OBJECT_TEMPLATE_GAPS` in `src/lib/hyperframes/composition-manifest.ts`), not a pattern to copy.
Motion graphics reach the creator only as proposals on the timeline; there is no Generate section for them, and never launch HyperFrames Studio for the creator.

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

A logo sting is a scene of separable objects (logo, name, tagline), not one composition (decided 2026-10-22, replacing the 2026-10-10 experiment exception). The `dreamcut-proposals` rule against full-scene composites applies to every motion graphic.

**Synthesized sound**: for abstract motion sounds (whooshes, hits, ticks, risers), use `sound_synth_prepare` with `synth_js` defining `render({ sampleRate, controls, random })`, then propose it with `create_audio` (`sound_effect`) as its own independent proposal beside the visual. Equal source, values and seed give identical bytes. Use library SFX from the sound-design skill when a realistic sound fits better. A waveform does not prove how a sound sounds; say so when reporting.

**Both**: when one request needs timeline graphics and overlay animation, keep independently reviewable actors as separate proposals so each can be approved or rejected on its own.

## Packaged templates

[Word Search Trace](templates/word-search-trace.md): a letter grid with hand-drawn outlines around one hidden word per cut.

[3D Sketch Scene](templates/sketch-3d.md): a scene of simple 3D shapes drawn in ink on paper (a city, a forest, any arrangement) that draws in while the camera flies, circles or rises through it. Use it whenever a flat drawing or the flat camera cannot show depth; write a new `scene.js`, not a new engine.

Explainer set: each template is one composition with five switchable [explainer looks](templates/explainer-looks.md) and a canvas sized to the project. Use one when a creator wants to explain their own work in motion, without footage:
- [Explainer Sequence](templates/explainer-sequence.md): title, key point, a number counting up, three steps, a closing line.
- [Animated Chart](templates/animated-chart.md): bars or a line that build up, with counting values and a highlight.
- [Plan Comparison](templates/plan-comparison.md): two or three plans, prices, feature ticks and a badged favourite.
- [Walkthrough Steps](templates/walkthrough-steps.md): numbered steps, each with a screenshot.

## Revisions

Revisions to existing motion are edits, not new builds: route through `proposal_create` with the changed actor only. For retiming across many elements, prefer one proposal per independently tweakable actor.

## Verification

Use frame-state for pixel proof of representative frames: `pnpm frame-state <project-id>`, or in the editor `run_instrument` (frame-state) then `timeline_evidence`.

Effect changes require `pnpm verify:effect-primitives`.
