# Browser GPU: complete catalog coverage and acceptance plan

Status: implementation audit, 2026-10-08. This is an explicit backlog, not certification.
The user requested parallel coverage of all catalog effects. The accepted browser-first
architecture and renderer contract remain authoritative. Read current source before
acting on this snapshot: parallel implementation can make individual gaps stale.

## Scope and owners

“All effects” cannot mean only the three acceptance projects or only recipe IDs.
The complete inventory joins these independently owned sets:

| Inventory | Source of truth | Audit size / purpose |
| --- | --- | --- |
| Versioned reference recipes | `docs/effects/catalog.json` | 22 entries; candidate/partial maturity is distinct from runtime support |
| Promoted construction recipes | `src/lib/effects/promoted-recipes.ts` | 3 additional shared recipes |
| Additional Guide workflows | `src/lib/effects/guide-examples.ts` | Layered Paper Cutout and Talking-Head Background Removal, beyond duplicate catalog entries |
| User recipes | `src/lib/local-store/user-effect-recipes.ts` | Dynamic local inventory; inspect privately, never copy private paths or media into public fixtures |
| Effect properties | `src/lib/timeline/effect-controls.ts` | 58 registered controls, each has an explicit Standard fixture in `src/lib/render/effect-render-contract.ts` |
| Actor animations | `src/lib/timeline/animation-presets.ts` | 17 values; applicability differs between media and captions |
| Motion presets | `src/lib/timeline/motion-presets.ts` | none, float, bounce, orbit, spiral; compile into ordinary transform keyframes |
| Boundary transitions | `src/components/studio/timeline/types.ts`, `src/lib/timeline/transition-controls.ts` | 9 types and 10 numerical controls plus direction/motion/origin/easing |
| Text, 3D and tracking | caption resolver, `PerspectiveTitleReveal`, surface tracking, GPU text raster | Font/style/layout, media fills, projective surfaces; not contained in the 46-property list |
| Advanced grading and LUTs | `color-grade.ts`, `cube-lut.ts` | Additional supported model payloads beyond the scalar inspector list |

Relative source paths above and below start at the repository root. The production
admission owner is `src/lib/gpu-preview/scene.ts`; transition admission is in
`transition-scene.ts`. `scene-draws.ts` projects evaluated behavior into draw packets.
`canvaskit-compositor.ts` currently supports fewer packet operations than custom
WebGPU. Shared admission is not proof that a packet is supported by CanvasKit.

## Property matrix

**Implemented** below means there is a code path, not that all values/combinations
passed end-to-end qualification. **Gap** means explicit rejection or missing shared
evaluation. Existing numerical failures remain diagnostic evidence; visual acceptance
of a documented variation must not silently relabel an old regression as passing.

| Exact registered properties | Shared/custom GPU path | CanvasKit snapshot | Required observable fixture |
| --- | --- | --- | --- |
| `media_orientation`, `media_mirror` | Implemented | Projective source matrix | Each enum, asymmetric image, alpha corners and rotated aspect |
| `media_scale`, `media_offset_x`, `media_offset_y`, `media_opacity` | Implemented, keyframe evaluation | Implemented | Extremes, subpixel motion, overlap, keyframe interpolation and repeats |
| `mask_inset` | Implemented | Rectangular clip | Four independent edges, animated mask plus transformed foreground |
| `mask_feather` | Implemented | Gap: featherMask packet | Alpha ramp at each edge; inset/scale interaction |
| `window_open_duration`, `window_corner_radius`, `window_side_margin_percent`, `window_vertical_margin_percent`, `window_center_y_percent` | Implemented | Gap: window packet | Opening starts empty, intermediate rounded aperture, terminal margins and center, duration-zero reset |
| `iris_radius`, `iris_feather` | Gap: shared admission/evaluation | Gap upstream | Oval reveal at start/middle/end; soft edge and exact identity |
| `zoom_blur` | Gap: shared admission/evaluation | Gap upstream | Radial blur distinct from Gaussian; animated strength and reset |
| `transition_blur`, `directional_blur_x`, `directional_blur_y` | Implemented | Gap: nonzero inner blur (post-blur exists) | X/Y independently; actor blur before transform versus group post-blur; alpha border |
| `media_blend_mode` | normal, difference, exclusion | Same operations implemented | Nonblack background, fractional alpha, overlapping groups |
| `paper_fill_color`, `recolor_color`, `recolor_amount`, `recolor_preserve_shading` | Implemented | Color-matrix implementation | Shaded/flat branch, amounts 0/0.5/1, alpha unchanged |
| `subject_flash` | Implemented | Color-matrix implementation | Transient white silhouette preserves alpha and disappears on schedule |
| `sticker_outline_width` | Implemented | Gap: outline packet | Alpha hole, colored border, clipped transformed actor, animated width |
| `subject_glow`, `subject_glow_radius` | Implemented | Gap: glow packet | Alpha-derived halo, radius/strength independent, transparent margins |
| `grade_exposure_ev`, `grade_contrast`, `grade_highlights`, `grade_shadows`, `grade_whites`, `grade_blacks`, `grade_saturation`, `grade_temperature`, `grade_tint`, `grade_hue_degrees` | Implemented | Gap: grade packet | Gray ramp, saturated patches, skin-like colors, alpha-preserving grade, animated parameters |
| `chroma_key_color`, `chroma_key_tolerance`, `chroma_key_softness`, `chroma_key_spill` | Implemented for video; still keying lacks shared authority | Gap: chroma packet | Colored screen, soft foreground edge, spill suppression, amount animation |
| `grid_matte_cell_size`, `grid_matte_coverage`, `grid_matte_line_opacity`, `grid_matte_line_width` | Gap: shared admission/evaluation | Gap upstream | Moving source-clock grayscale mask, sharp source video, cells/coverage/grid controls, retiming, uncovered mask error |
| `subject_window_mode`, `subject_window_feather`, `subject_window_expand`, `subject_window_strength` (Subject window, added 2026-10-14) | Not admitted on custom WebGPU | Implemented: shared `subjectWindowAlpha` grid, CanvasKit DstIn on the isolated actor, Standard CSS alpha mask | Subject source clock, fills in sequence, inside/outside, expand/feather/strength, closed window outside the subject span, uncovered mask refusal |
| `gradient_map_amount`, `gradient_map_contrast`, `gradient_map_shadows`, `gradient_map_midtones`, `gradient_map_highlights` (Color Map, added 2026-10-13) | Not admitted on custom WebGPU | Implemented: `CANVASKIT_GRADIENT_MAP_SKSL` after grade/LUT in the actor colour stage; Standard `GradientMapFilter` (SVG matrix + table + arithmetic mix) | Ramp endpoints, contrast clamp, mix 0/0.5/1, alpha cutout unchanged, keyed two-frame flash |
| `glitch_amount`, `glitch_block_size`, `glitch_shift`, `glitch_rgb_split`, `glitch_smear`, `glitch_rate`, `glitch_seed` (Glitch, added 2026-10-13) | Not admitted on custom WebGPU | Implemented: both renderers draw the shared deterministic `glitchPlan` (`timeline/glitch.ts`); CanvasKit `canvasKitDrawGlitch` after the colour stage, Standard `GlitchFilter` SVG primitives | Same step/seed repeatable, step change, wrapped shifts, smears, RGB split, alpha cutout, keyed burst |

Additional packet/control obligations: rotated line masks (custom has a combined
blur qualification gap; CanvasKit rejects lineMask), video-filled caption masks
(CanvasKit rejects captionMask), LUT/color model and advanced grade fields
(CanvasKit rejects LUT/grade), tracking visibility and source clock, source alpha,
parent/group opacity, title textures and resource readiness. These must be tested
in addition to registered scalars; no positive property count implies completeness.

## Animation and transition matrix

Media production admission on the custom WebGPU backend permits only `none` and `fade`.
CanvasKit admits every media preset the inspector offers (`presetsForElementType`),
including `write_on` and `scan_reveal_down`. Media `write_on` wipes the whole media
wrapper from the right using the shared `wipeRight` fraction (in/out combine as the
larger share). The wipe box is the composition-sized wrapper in group-local space:
Standard applies `clip-path: inset(0 X% 0 0)` to the transformed wrapper and CanvasKit
clips the same rect after its group pose is concatenated, so scale/slide/rotate move
the wipe with the actor. The edge is relative to the frame, not the visible picture,
so a small inset picture only changes while the edge crosses it. `scan_reveal_down`
remains the identity on media. WebGPU rejects media wipes.
The complete
animation registry is `none`, `fade`, `slide_up`, `slide_down`, `slide_left`,
`slide_right`, `write_on`, `handwriting`, `scan_reveal_down`, `drop_in`,
`focus_settle`, `pop`, `spring_pop`, `rotate_in`, `word_fade`, `word_rise`, `word_pop`.
Ordinary captions admit all except `focus_settle`. Word/handwriting modes are
caption-specific: test actual UI applicability and shared resolver semantics rather
than inventing a new meaning for a media actor. Pop and motion experiments do not
remove production admission gaps. Motion presets compile to keyframes, so require
preset-to-keyframe evaluation and clock tests, not five unrelated shader engines.

| Boundary type | Production GPU admission snapshot | Implementation needed / acceptance variants |
| --- | --- | --- |
| fade | Admitted | Overlap, independent audio fades and handle boundaries |
| slide | Limited: travel, non-top directions, no blur | All four directions; in-place/travel/smear; zoom/travel/blur controls and motion delay |
| whip | Only one from-right smear parameter combination | All registered directions/motions, independent blur/zoom/travel, incoming source preroll |
| wipe | Gap | Directional moving boundary, incoming/outgoing alpha and terminal coverage |
| cube | Gap | Perspective face transforms, occlusion and complete transition |
| page_turn | Gap | Origin and page curl range, layered fold/shadow, terminal reset |
| film_burn | Gap | Accent strength/hold, bright color evolution, source continuity |
| camera_flash | Gap | Accent strength/hold, white peak and recovery |
| blackout | Gap | Accent strength/hold, black peak and recovery |

Text fixtures must include all currently admitted styles: none, cinematic,
bold_outline, boxed, neon, inverse, image_fill, highlight_yellow, highlight_red,
yellow_banner, black_card, thought_bubble, yellow_words, benchmark_card and
camera_reveal. Evaluate style × applicable entrance/exit interactions, multiline and
single-line wrapping, actual font readiness, alpha, image/video fills and shared
3D texture/material/blur controls. Caption offset keyframes are admitted; arbitrary
caption keyframe channels are not. Distinguish neutral metadata from visual fields.

## Every catalog recipe decomposed

These rows specify construction-level checks, not a promise that a candidate recipe
has been recreated. Each runs with new portable synthetic assets and its actual
editable primitive structure. Primitives alone cannot certify the perceived recipe.

| Catalog ID | Construction under test | Priority gaps / recipe-level assertion |
| --- | --- | --- |
| FX-12 | Persistent basket plus accumulating cutouts | Alpha/masks/lane order; items persist across background cuts exactly once |
| FX-14 | Translucent floating project screen | Opacity/projective placement; screen remains anchored and readable |
| FX-06 | Gesture-matched outfit change | Source cut/retiming continuity; gesture join is not a new filter |
| FX-07 | Foot-to-camera location change | Source timing plus occlusion transition; source handles preserved |
| FX-08 | Floating/pop objects, scene change, white blips | Media entrances and flash/alpha; correct order and flash recovery |
| FX-11 | Drinks precede background | Alpha layering/entrance and delayed background switch |
| FX-16 | Building layers become full scene | Cutout layering/transforms/transition; eventual scene takeover |
| FX-15 | Laptop-edge scene wipe | Moving edge mask/tracking; reveal bound to source edge |
| FX-02 | Unfolding paper across cuts and handheld title | Prepared deformation or projective construction, native text tracking; reconstruction gap distinct from compositor |
| FX-05 | Persistent time/activity labels | Text layout and source cuts; labels stay stable and separately editable |
| FX-10 | Lunch before/after match cut | Cut/source alignment, no invented filter |
| FX-19 | Dinner before/after match cut | Cut/source alignment, no invented filter |
| FX-20 | Remove-to-show title | Foreground alpha/tracked occlusion/native title; provisional recipe remains provisional |
| FX-SCRATCHPAD | White paper outline | Outline/recolor/alpha; preserve supplied source pose |
| FX-INVERSE-CAPTIONS | Inverse video captions | Difference blend and text/fill mask; moving video readability |
| FX-FILM-BURN | Film burn transition | Missing boundary family, strength/hold and source boundaries |
| FX-MASK-GLITCH | Mask glitch | Source-timed masks, flash/cut timings, no unintended alpha flash |
| FX-CAMERA-FLASH | Camera flash transition | Missing boundary family; white peak and full recovery |
| FX-BLACKOUT | Blackout transition | Missing boundary family; black peak and full recovery |
| FX-WHIP-PAN | Whip pan | All applicable motion/direction settings and source preroll |
| FX-NEGATIVE-POP | Negative pop | Blend/flash/masks; document exact construction rather than map name to unsupported shader |
| FX-SCENE-PORTAL | Scene portal | Aperture/window/iris plus layered sources; independent inner/outer timing |
| FX-SPEED-ENTRANCE-EXIT | Subject streak over fixed background | Source-timed cutout + transform + directional blur; background stable |
| FX-MASK-GLITCH-GLOW | White silhouettes then color | Source alpha + flash + halo; glow follows each silhouette |
| FX-MOVING-GRID-MATTE | Moving square-cell silhouette | Missing grid-matte runtime; all four registered controls and mask clock |
| Guide: Layered Paper Cutout | Multiple recolored contour actors | Layer order, alpha edges, timed entrances, independent controls |
| Guide: Talking-Head Background Removal | Continuous prepared alpha performance | Correct mask/source cadence, speech continuity and background layering |

Persisted user recipes add local construction cases after resolving their current
recipe payloads. Never mark them covered merely because their names resemble a
shared recipe. Their requirements may include additional combinations or media types.

## Executable acceptance work

Existing commands (run from repo, with isolated editor/project storage configured):

```sh
pnpm check:parameter-contract
pnpm check:effects
pnpm typecheck
pnpm verify:renderer
pnpm verify:playback
node --import tsx scripts/verify-gpu-preview.ts
```

`verify:renderer` already consumes all 58 `renderContractCases()` using
`EffectControlFixture`, explicit active value/context, identity, reset and visible
changed-pixel checks. It also has transition, LUT, 3D and encoded cases. This proves
Standard authority; it does not run every case through CanvasKit or custom GPU.
`verify-gpu-preview.ts` contains specific family experiments, not an automatically
exhaustive registry-driven suite. Its retained environmental case switches are
useful reproduction commands, not proof of complete catalog coverage.

`src/lib/gpu-preview/catalog-coverage.ts` now enumerates registry-derived property,
transition, animation, motion, caption-style and recipe obligations. It copies existing
fixture values/context and applicable control bounds, accepts local recipe identities
without reading private stores, and keeps absent/stale/failed qualification as gaps.
Unsupported assessments override green receipts; explicit nonapplicability is counted
separately. Five focused tests cover exhaustiveness, ownership, failure accounting and
input isolation. Receipt verification remains the caller’s responsibility.

Required next extension: project every enumerated case into Standard, custom GPU and
CanvasKit and retain measured receipts. The enumerator is not that rendering runner.
Fail the inventory check if any registered case lacks a result or explicit gap.
Unknown operations must fail before drawing; “skipped unsupported” is a failing
coverage obligation, not a passing engine result. Adapters must not change the
fixture's sources, timing or properties to obtain a pass.

For every applicable primitive case execute:

1. Identity, active value, min/max boundaries, reset; require visible active pixels.
2. Start, intermediate, peak, exit and end; keyframes only where registered.
3. Backward/repeated seeks (end → start → middle → middle) and exact same-engine
   repeatability. Validate actual decoded source intervals independently of pixels.
4. Alpha/opaque sources, relevant transform/filter ordering and overlapping actors.
5. Raw and encoded diagnostics against Standard; human motion review for explicitly
   accepted cross-engine raster variations. Wrong frame, missing actor, unstable
   brightness, flash and audio clock errors remain failures.
6. Failure/cancel/context loss before publication, prior complete frame preserved,
   recovery and disposal; bounded frame/intermediate caches with valid telemetry.
7. Paced playback with shared audio at normal and changed speed, then cold/warm/seek
   tests. Serialize heavy GPU benchmarks; parallelize implementation/unit work.

Each recipe then gets one coherent multi-layer construction fixture, with shared
anchors, independent knobs and replacement inputs. Real existing projects supplement
these portable cases; they cannot substitute for catalog breadth. Report both counts:
primitive implementation/qualification and recipe construction/acceptance.

## Parallel ownership and implementation order

1. Mask/filter lane: feather, rotated line, opening window, iris, inner directional
   and zoom blur, alpha outline/glow, moving grid matte. Start from shared resolvers.
2. Color/material lane: recolor/flash, complete grade/LUT/chroma and caption masks;
   preserve source color-space conversion, alpha and effect ordering.
3. Motion/composition lane: complete boundary families, media/caption entrances,
   3D/text/tracked surfaces and composed recipe fixtures.
4. Integrator: packet capability contract, admission inventory, complete-frame
   scheduling, resource/cache limits, audio and serialized real-editor acceptance.

These are module ownership proposals; avoid concurrent edits to the same compositor.
Extract narrowly owned helpers and integrate centrally. A shader or filter needs no
new creator-facing control when the existing registry already describes it. Missing
recipe controls or parameter wiring are product capability gaps: extend their shared
registry/UI/contract separately rather than hide constants inside an adapter. The
58 existing properties are already registered; their GPU absence is a renderer gap,
not a reason to add duplicate sliders.
