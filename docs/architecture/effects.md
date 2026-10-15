# Effects and recipe catalog architecture

[Architecture overview](README.md) · Status: current organization and design contract, reviewed 2026-09-28. Catalog entries carry their own maturity and evidence.

## Responsibility and design decision

The effects system turns an observed visual behavior into a reusable editable construction. A reference clip is evidence of a desired result; it is neither the implementation nor an asset ready for reuse. The system separates runtime capabilities from recipes that compose them and from catalog records that describe and demonstrate them.

This avoids hard-coding a new feature around every reference's people, object count, or project. It also avoids treating one visually successful render as proof that another creator can supply new assets and tune the same effect.

## Components and artifacts

| Component | Owns | Does not establish |
| --- | --- | --- |
| Reference breakdown | Observed layers, timing, mechanics, uncertainty, desired outcome | Knowledge of the original editor's hidden project |
| Runtime capability | A reusable transform, treatment, timing behavior, or composition operation | A complete creator workflow merely by exposing a renderer prop |
| Preparation step | Source-preserving cutouts, masks, or other derived media and receipts | Timeline placement or approval |
| Recipe and craft skill | Asset roles, steps, replaceable inputs, controls, limits, and verification | A new runtime feature through prose alone |
| Catalog entry and evidence receipt | Version, ownership, artifacts, hashes, success criteria, maturity | Fidelity merely because the JSON validates |
| Guide presentation | Browsable recreated results, requirements, prompts, limitations | Automatic application to a user's cut |

## Reference-to-capability flow

```text
reference + explicit recreation goal
  → observed construction and timing map
  → required assets and capability assessment
  → compose existing primitives OR implement a missing general capability
  → native editable actors + supported controls + safe authoring contract
  → compare motion/appearance and exercise different inputs
  → versioned recipe + evidence receipt + catalog presentation
```

Catalog the complete perceived effect—setup, coordinated transformation, payoff—while retaining reusable component mechanics. New capability development crosses the [UI](editor-ui.md), [proposal](proposals.md), [spatial](spatial-engine.md), and [rendering](playback-rendering.md) boundaries. A recipe should not have private file mutation or a hidden external renderer as its application interface.

A continuous performance remains one source clock with timed effects wherever supported. Native text and independently meaningful actors retain their own controls. Prepared pixels are appropriate when the operation genuinely needs them; their recipe and source mapping make regeneration explicit. The tradeoff is slower initial construction than baking a demonstration, in exchange for later tuning and replacement.

The [Properties and recipes boundary](properties-and-recipes.md) defines the target inspector separation: Library workflows compose editable building blocks; Properties owns their values and supported keyframes. Existing bundled presets require explicit migration.

## Composed treatments

A recipe can coordinate several existing effects and sound actors around shared anchors without flattening them. [Compound effect recipes](compound-effect-recipes.md) works through the masked flash and crisp click, separating reusable construction, per-project bindings, and personal parameter choices. Its current execution is through an owning skill and existing proposals; a runtime graph compiler is not implied.

## Catalog identity and maturity

`docs/effects/catalog.json` is the machine-readable recipe catalog. Each owning skill links a reciprocal `references/effect-evidence.json` receipt. Artifact identity and portable paths let the catalog verify that the shown evidence belongs to the recorded recipe. Small Guide playback proxies have separate bindings to evidence masters.

Candidate, partial, and complete describe evidence maturity. Reuse and fidelity are separate questions: a second input trial checks the recipe's generality, while reference comparisons check the intended appearance and timing. Private personal styles store chosen parameter bundles; they are not the shared contribution unit.

## Implementation map and open boundaries

- [recipes.ts](../../src/lib/effects/recipes.ts): catalog types and recipe validation.
- [catalog.json](../effects/catalog.json), [catalog.schema.json](../effects/catalog.schema.json): versioned records and schema.
- [validate-effect-recipes.ts](../../scripts/validate-effect-recipes.ts): packaging, hash, path, and reciprocal-reference checks.
- [effect-controls.ts](../../src/lib/timeline/effect-controls.ts): supported editor effect-control declarations.
- [prepare-guide-proxies.ts](../../scripts/prepare-guide-proxies.ts): packaged Guide media preparation.
- [Recreate-effect skill](../../.agents/skills/recreate-effect/SKILL.md): execution procedure.
- [Effect capability standard](../standards/effect-capabilities.md) and [catalog format](../effects/README.md): integration and evidence contracts.

The architecture does not imply a universal plugin runtime or an automatic reference-to-effect compiler. Missing mechanics still require deliberate implementation, and partial catalog entries remain partial even when they are browsable.

## Editable parameter integration

The [editable parameter contract](../standards/editable-parameter-contract.md) makes
control wiring part of effect implementation. Numeric registry entries carry mandatory
proposal display metadata, consumed by the shared proposal controls. New scalar schema
fields must be classified by the executable contract check. Compound timing/geometry
needs a typed deterministic adapter; UI/render verification remains separate.

Native boundary-transition numbers use [transition-controls.ts](../../src/lib/timeline/transition-controls.ts).
Their nested schema coverage, bounded proposal overrides and display metadata share
that owner. The production smear resolver consumes zoom, travel and blur independently;
the renderer contract tests legacy defaults, reset, seeks and encoded output. This is
finite transition coverage, not automatic discovery of every hard-coded visual constant.

## Shared opening window

A full-canvas frame layer can use `window_open_duration` and
`window_corner_radius` to expose a rounded opening over independently editable
pictures. Put a black frame above the picture effects and below foreground actors
and titles. `resolveWindowOpening` evaluates one clip-local clock, so overlapping
picture transitions cannot move or blur the aperture edge. Duration is seconds;
roundness is pixels at 1080 canvas width. The opening starts at zero height, grows
with smoothstep easing, and resolves full canvas with no corner residue. Duration
zero removes the opening effect, restoring the source frame layer.

Both controls belong to Animation → Blur & reveal and use the existing numeric
preview, commit and reset owners. They are static treatment controls, not
independent keyframe tracks. Proposal creation and tuning share the same registry
bounds and renderer. The spatial assessor marks this inverse mask as requiring
pixel evidence; it does not infer foreground clearance from the full-canvas source.

The opening also supports `window_side_margin_percent` and
`window_vertical_margin_percent` (0–45% per edge). These reserve equal left/right
and top/bottom space at the terminal opening; inset windows retain corner roundness.
Zero margins preserve the historical full-canvas finish. Both reuse the existing
Animation → Blur & reveal controls and proposal tuning path.

## Moving grid matte

A prepared subject mask can reveal sharp video through an averaged cell grid.
`cutout_status` publishes `grid_matte_mask`: immutable grayscale frame URLs,
source start, cadence, dimensions, frame count and source hash. `GridMatte` follows
the picture's source clock and refuses uncovered times. It averages the mask only;
the source picture remains sharp. Backgrounds remain separate timeline actors.

Prepared clips expose Cell size, Mask coverage, Grid strength and Grid width in
Style → Effects through `GridMatteControls` and the numeric registry. Controls are
static; enable/disable and reset preserve the mask binding. Cell size zero is
identity, and positive sizes below 24 reference pixels are bounded to 24 to keep
live grid work finite. Rounded row counts produce nearly square cells at arbitrary
source aspects. Replacing a source requires preparing its matching mask.

The runtime preloads a bounded mask lookahead and retains the previous mask while
an interactive frame decodes; exact frame rendering waits for its own mask.
Prepared mask directories participate in frame-evidence and still-cache hashes.
Synthetic renderer cases exercise four controls, identity/reset and preview parity;
project-specific moving-mask quality still needs visual review.


## Subject window

Any video or still can show only inside (or outside) another clip's moving subject:
the reference "silhouette window" where fills cycle under one person's shape while the
rest of the frame keeps the original shot. The windowed clip stores
`subject_window_parent_id` (the subject video clip) and `subject_window_mask` (the
subject footage's prepared mask, the same record `cutout_status` publishes as
`grid_matte_mask`), plus `subject_window_mode` (`inside`/`outside`),
`subject_window_feather` (edge softness, px at 1080 width), `subject_window_expand`
(±px; negative shrinks), `subject_window_strength` (0–1) and `subject_window_enabled`.

The subject owns the clock and geometry. `buildCompositionElements` attaches a
composition-only snapshot of the subject (`runtime_subject_window_subject`), resolved
before lane visibility so a hidden or muted subject lane still drives the window. At
timeline frame F, `subjectWindowPlanAtFrame` (`timeline/subject-window.ts`) reads the
subject's own source time through `mediaPictureAtFrame` (trim, speed, reverse, holds)
and picks that mask frame; the mask is placed where the subject's picture is drawn
(contain fit, scale/position keyframes, crop) at the subject's local time. The
windowed clip's own trim, speed and duration never affect the mask, so any number of
short fills in sequence share one subject. When the subject is not on screen (before
or after its span, removed or disabled) there is no subject shape: inside shows
nothing, outside shows the whole clip. Uncovered subject source times are refused at
proposal validation and GPU admission. Rotated or mirrored subjects and page-turn
transitions on a windowed clip are refused until they are implemented.

`subjectWindowAlpha` derives one alpha grid at half composition resolution that covers
the composition (bilinear mask sample, expand by box-filter threshold, feather by
three box passes, invert, strength). Standard's `SubjectWindow` uses those bytes as a
CSS alpha mask on the whole element; CanvasKit isolates the actor and applies them
with DstIn (`canvaskit-subject-window.ts`), moving the actor's blend to the isolated
layer. Effects → Subject Window (`SubjectWindowControls`) shows Subject, Show footage,
Edge softness, Expand edge and Strength with enable, Reset and Remove. Adding a window
from scratch in the UI needs a subject with a prepared cutout and is currently an
agent/proposal action.


## Creator-facing recipe presentation

The [effect page template](../effects/creator-template.md) defines the common order:
demonstration, supplied inputs, generation suitability, build sequence, copyable
agent request, and evidence limits. `creator-guides.ts` owns the plain-language
brief keyed by stable catalog identity; the evidence catalog continues to own
maturity and artifacts. Both Library detail and Guide use
`EffectRecipeInstructions` and `EffectAgentRequest`. The shared request builder
names the skill and recipe, asks for missing inputs, keeps generation separately
reviewable and ends at a proposal for existing edits.

The README index and `docs/effects/recipes.md` are generated from these briefs and
the catalog by `scripts/generate-effect-pages.ts --write`. `check:effects` checks
coverage and freshness. Candidate references remain distinguishable from partial
and complete recreations. Additional Guide workflows without catalog acceptance
are labeled as unverified demos, or missing demos, in the index.

This is read-only recipe guidance: it adds no timeline values, generation submission
or approval action. Properties → Templates remains the discovery and agent handoff home;
Properties and proposal tweaks remain the homes for persistent applied controls.
The existing detail/back navigation, media player and shared copy control are reused.

Creator-facing examples follow the [visual recipe standard](../standards/recipe-visual-presentation.md). `TemplateCatalog` (with the result, input and stage parts in `RecipeVisualOverview.tsx`) is the one template browser for Guide, Library and Properties → Templates. Teaching illustrations remain separate from catalog reference-match evidence.
