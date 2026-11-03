# Editable title entrance, hold and exit

Use for a single title that travels into a held position and then leaves the frame. Keep the title as native text; this is not a baked animation or a compiled one-click template. Route motion through [motion graphics](../../motion-graphics/SKILL.md), with the [measured coordinate fallback](../../../../docs/standards/spatial-authoring.md#coordinate-fallback) only when named slots cannot express the reference path.

## Inputs and measurements

Require wording, target canvas/rate, a reference or explicit motion brief, and intended audio. A text-only reference needs no invented footage. A mobile sticker example does not substitute for a desktop text example. Read the full tutorial through its final revision and preserve its operation ledger before choosing the retained variant.

Record the text's visible glyph bounds, fill, weight, case and font identity or uncertainty using the [typography record](../../../../docs/effects/reference-typography.md). Measure ink, not the layout box. An editor's generic System label does not identify a font family. Test a supported face at its actual rendered weight; several native presets use a fixed weight, so a similar family name alone is insufficient. Declare substitutions, fit visible width and height separately, and inspect the resulting letterforms.

For a screen recording, distinguish lesson PTS from the editor clock displayed inside it. Preserve actual decoded PTS and viewport coordinates. Inspect embedded clocks at entry, settle, departure and exit. Repeated or missing captured states cannot prove exact editor-frame timing. Record uncertain intervals rather than manufacturing a frame-exact map.

## Native construction

Use `assembly_create` for a new first build and the bounded workspace tools until handoff; use `proposal_create` for an existing cut. Read preferences and record direction. Keep the whole title as one `caption_text` element with editable wording, font, fill, size, alignment and duration.

Prefer semantic placement and native entrance/exit presets when they meet the observed path. The current named-slot motion expresses one movement followed by a hold; a measured offscreen entrance, center hold and separate offscreen departure can require the standard's coordinate fallback. State the limitation, measurement source, coordinate frame and anchor in the assembly analysis and in `coordinate_fallback_reason` for a proposal. Do not combine conflicting placement modes or guess coordinates. Check the actual tool schema before authoring.

The supported position channels are `keyframes.media_offset_x` and `keyframes.media_offset_y` on the native actor. Each point has clip-local seconds `t`, value `v` and optional `ease`. Offsets are half-canvas units, added to the caption's resolved placement; derive them from measured glyph centers and the rendered baseline. Keep the fixed axis fixed. The ease belongs to the left point of each segment. Native `easeIn`/`easeOut` are quadratic, not arbitrary external-app Bezier curves. If they do not match the reference, measured intermediate points can approximate its path while remaining editable; disclose the approximation and inspect every join for velocity changes. Do not reuse source-specific point values as a generic recipe.

Set entry/hold/exit and offscreen handles from the reference clock. Preserve intended opacity, size and rotation; motion does not imply adding fades or zoom. Native `textScaleX`/`textScaleY` can fit measured glyph geometry but may alter letterforms, so expose them and record the adaptation. Silence is appropriate when no effect soundtrack is established; tutorial narration is not an effect stem.

## Review and controls

Run canonical frame-state before visual review; compare rendered ink bounds across the full moving interval and hold. Static caption layout boxes may not describe keyframed translation; use visible rendered ink for motion geometry. Review every frame for short sequences, normal-speed playback, and decoded export when requested. Keep still coverage, transport progression and continuous sensory review distinct.

On a disposable copy, exercise wording, size, fill, position keys, interpolation, keyframe add/remove, timing, available reset controls and reload persistence. Follow the normal human-approval boundary for Undo and history restoration. Verify any edited value changes the combined picture; a visible dial alone is not acceptance. Preserve the reviewed candidate.

Keep source observations, current adaptation and verification receipts separate. Save the procedure before a fresh build. Repeatability requires another builder without the earlier timeline, output or fitted coordinates; transfer requires a separately changed input dimension. If the fresh session lacks required visual access, record a blocked trial without counting a written walkthrough as execution. A successful first export is not reusable-effect certification.
