# Blue steel inverse captions

Optional look `blue-steel-inverse-captions`, version 1, for the existing **Inverse
Video** caption effect. Catalog ID: **FX-INVERSE-CAPTIONS**.

## Entry point

Select a caption → Text → Effect → **Inverse Video** → **Blue steel captions**.
The option appears in the caption typography controls in both workspace layouts.
It uses the existing safe inspector commit and Undo path.

For an agent, merge `BLUE_STEEL_CAPTION_LOOK` from
[`captions.ts`](../../src/lib/timeline/captions.ts) into a caption props patch through
the proposal contract. The exact stored settings are:

```json
{
  "styleVariant": "inverse",
  "textColor": "#ffffff",
  "outlineWidthPx": 0,
  "inverseMaskMotion": "none",
  "inverseMaskDriftXPercent": 0,
  "inverseMaskDriftYPercent": 0,
  "inverseMaskSweepIntensity": 0,
  "inverseMaskSweepCycles": 1
}
```

This is a clean white Difference matte. It inverts the composed footage under the
glyphs: warm skin tends toward blue steel, white fabric toward charcoal. It is not
a constant blue paint or metallic 3D material. Keep word-level colour overrides
white or unset; an authored coloured word overrides the base glyph colour.

## Reference and rhythm

Reference: [@anderson.taii reel](https://www.instagram.com/reel/Da0d8suu6kJ/).
Opening frames 0–79 at 24 fps show large bold sans-serif words over the upper
chest. Word “every” descends during frames 41–43, approximately 0.0833 seconds.
Some word changes are direct cuts. Font identity and original blend preset remain
unconfirmed. White Difference and white Exclusion produce the same inversion.

Use a bold sans-serif available in the project and fit placement to the subject.
For literal speech, route through caption-craft and reviewed MFA word alignment.
`timingMode: "single_word"` with valid `wordTimings` already displays one word at
a time. The look button changes appearance only; it preserves text and clocks.

The current single-word renderer has no downward entrance per word: its existing
motion is word-scale/squash. For independently timed native word clips, the existing
`animationIn: "slide_down"`, `animationInDuration: 0.0833333333` and
`animationOut: "none"` provide an approximate quick descent at each clip start.
Do not describe block entrance on a multiword rail as per-word entrance. An exact
aligned per-word downward variant remains unimplemented.

## Handoff to another agent

Use **FX-INVERSE-CAPTIONS / blue-steel-inverse-captions**. Read
[video-typography](../skills/video-typography/SKILL.md), then the project timeline
and applicable preferences. Required inputs: background footage, exact text, and
reviewed aligned word timings when following speech. Apply the settings above in
one reviewable proposal on a working edit; preserve source links, word timings,
placement and unrelated adjustments. Record editorial feedback when applicable.
For a complete caption rail, use the atomic source-bound replacement contract.
Inspect actual rendered contrast at word changes with frame-state. Report colour
dependence and the per-word descent gap. Do not claim an exact recreation yet.

## Evidence and status

[Catalog receipt](../skills/video-typography/references/effect-evidence.json)
records source attribution and hash. Full local analysis, if retained, is
`analysis/effect-references/Da0d8suu6kJ/caption-analysis.md`; it is optional evidence,
not a dependency for executing this portable recipe.

The named appearance option reuses the existing renderer. Catalog recreation status
is **candidate** until a new-footage recreation and motion/UI checks are packaged.

Implementation checks: 38 caption and skill-discovery tests passed; `pnpm typecheck`
passed; `pnpm check:effects` validated all 15 entries, hashes and owner backlinks.
Live UI Undo/reload and new-footage motion checks have not been performed for this
option. These limits apply to the recreation claim, not an inferred fixed-blue palette.
