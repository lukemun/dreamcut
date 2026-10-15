# Color grading UX

Status: first increment implemented (2026-09-28); remaining workspace and scope features are proposals.

## Implemented first increment

- The selected scope filters the main controls: Brightness waveform shows Exposure, Contrast, Highlights, Shadows, Whites and Blacks; RGB parade shows Color balance. Closing scopes restores the manual Tone/Color balance groups. Scope and control visibility share one state, so they cannot select different domains.
- Separate Tone and Color balance groups; Highlights, Shadows, Whites and Blacks use new localized linear-light responses. Existing grades keep their exact behavior with these controls at zero. Fine numeric/stepper controls, reset, keyframes and proposal adjustments share the registry.
- Advanced grading opens on a gridded, draggable master curve. Only the selected point's exact value is shown; keyboard arrows adjust it. RGB balance is a peer view. Existing LUT import remains available.
- Optional video scopes offer labeled Brightness waveform and RGB parade views; scopes start collapsed. RGB parade shows separate red, green and blue level distributions, not hue/saturation. The selected-clip sample uses the already-decoded media and the same browser SVG grading filter, or the existing LUT output canvas. It is **not a composite/output scope**: labels explicitly state selected clip, before layout and other layers, SDR brightness 0–100%, and 256 × 144 sample resolution. Updates are bounded to roughly six per second, suspended offscreen/hidden, and withheld while the source seeks. No additional video decoder is created.
- Scope filter parity is checked against rendered opaque pixels in the renderer contract. Unit coverage verifies waveform weighting and transparent-pixel exclusion, localized tone response, identity, monotonicity, keyframes and reset.

Full-composite scopes, vectorscope, color wheels and press-and-hold Original are remaining work. The selected-clip scope intentionally narrows the original proposal; it does not claim to measure masks, layout, overlays or final compositing. Dehaze remains separate future work.

## Remaining design

Keep Color in Style. Put compact tone rows first: Exposure, Contrast, Highlights, Shadows, Whites, Blacks. Then Temperature, Tint, Saturation. Add neutral white-balance sampling when a tested pixel-to-balance implementation exists. Controls need exact numeric fields, fine steps, reset and supported keyframe diamonds.

Replace the sprawling Advanced grading block with a focused Color workspace opened from Style. Provide peer views: Tone, Wheels, Curves, Looks. Preserve the selected clip and paused frame while switching. Keep Recolor and subject masks outside grading.

Wheels: Shadows, Midtones, Highlights, each with a color puck and a brightness control. Expose individual RGB channels only in one Precise values disclosure. Neutral center and reset must be visibly clear. Mapping wheels to current lift/gamma/gain requires an explicit reversible transform; do not silently reinterpret existing RGB values or claim the regions are isolated masks.

Curves: a large gridded graph with draggable points, black-to-white input/output ramps, keyboard adjustment and exact selected-point values. Replace the seven simultaneously visible numeric rows with the selected point's controls. Keep source endpoints and monotonic constraints enforced.

Scopes: start with an optional luma waveform beside the viewer, then RGB parade; vectorscope can follow. Sample the graded composite, not the untouched source or DOM chrome. State scope, scale and color space explicitly. Start with the verified SDR display pipeline and a 0–100 percent scale; do not label it IRE or nits without the appropriate signal conversion. Refresh paused adjustments immediately, throttle during playback, suspend when hidden and discard stale results on seek. Never add a second video decoder solely for scopes.

Add one press-and-hold Original comparison and Reset color. A before/after comparison must bypass only grading and retain source clock, composition and masks.

## Capability work

Existing code has exposure, contrast, temperature, tint, saturation, hue, RGB lift/gamma/gain, a master curve and LUTs. Highlights/Shadows/Whites/Blacks are new renderer capabilities, not labels for the existing RGB controls. Each needs identity/reset, normalization, preview/export parity, keyframe support and renderer pixel tests before being shown.

Dehaze/local contrast is a later effect requiring algorithm evaluation and temporal stability checks. The current bridge correction can improve the washed-out appearance using exposure and contrast; it is not a physical glare-removal operation.

## Acceptance

Verify narrow and wide inspector layouts, paused preview updates, reset/Undo and keyboard fine adjustment. Curve and wheel gestures commit once on release and discard on cancel. Scopes must match the displayed graded pixels and report their sample resolution; test color-space conversion, clipping, random seeks and playback cost. Run the renderer and playback gates for changes to those paths.

## Verification receipt (2026-09-28)

- Typecheck passed.
- Color-grade, waveform and renderer-case unit tests: 16 passed. Inspector hydration and proposal control/inventory tests: 29 passed.
- `pnpm verify:renderer`: 29 effect cases, exact reset, preview/export parity, repeated seeks, cancellation/missing-media gates and 87 encoded frames passed. Waveform sampling matched graded opaque pixels exactly for exposure, highlights and blacks. See `testing/results/renderer-contract/latest.json`. The missing-media case now selects a video fixture by property rather than a brittle numeric index.
- `pnpm verify:color-grade`: 30-second 1080p export passed; encoded color delta 2 levels. See `testing/results/color-grade/latest.json`.
- Browser review confirmed the optional waveform and compact curve with selected-point readout on the bridge clip. This implementation did not apply a timeline edit.
- The broader `inspector-ui-contract.test.ts` still has failing source-text expectations involving proposal controls, caption fill and stabilization UI. Those areas were not repaired as part of this increment; do not report the entire UI suite as passing.
