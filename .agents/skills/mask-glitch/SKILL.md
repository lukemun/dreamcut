---
name: mask-glitch
description: Create an editable Mask Glitch transition or consecutive Mask Glitch sequence across ordered shots. Keep incoming subjects visible as white or original-colour masks until each scene handoff. Use for the renamed pop-in/glitch effect, compound mask sequences, the masked-flash-and-click pairing, and the explicit legacy batched pop-and-white-flash variant.
---

# Mask Glitch

Build one handoff or an ordered chain of incoming-subject masks and scene switches.
The default is continuous white → original-colour mask → incoming scene, using the
corrected two-handoff construction. Every incoming subject remains visible through
its lead-in. This is a coordinated editable sequence, not a baked transition movie.

## Inputs and routing

- Two or more ordered source shots, or an existing timeline region establishing order.
- The incoming subject or selected objects for each destination shot.
- Matching white and original-colour alpha mattes, or source media from which they
  can be prepared. Moving subjects need time-matched mattes, not a held still.
- Cut times, or enough context to choose cuts without changing a speech clock.

Read current timeline and applicable preferences. Supplied files start with
[media-intake](../media-intake/SKILL.md). Prepare masks through
[object cutouts](../video-compositing/references/object-cutouts.md), preserving source
colour, alpha and destination registration. Reuse verified derivatives. Missing
or poor masks are a preparation blocker; do not redraw the subject or silently
send media to a service.

Use [open-edit-proposals](../open-edit-proposals/SKILL.md) on an existing timeline;
new first assemblies use the bounded assembly contract. Record editorial feedback
for project edits. Skill invocation alone does not authorize generation or export.

General overlays belong to [video-compositing](../video-compositing/SKILL.md).
Unmeasured reference mechanics or missing native functionality belong to
[recreate-effect](../recreate-effect/SKILL.md).

## Choose the construction

| Variant | Behavior | When to use |
| --- | --- | --- |
| Subject flash + glow | Timed white silhouette and optional soft halo, then original-colour subject | After Effects glow reference or requests for glowing pose reveals |
| Masked flash + crisp click | Short region-limited white flash plus one aligned click | Explicit flash/click pairing or masked-flash-and-click requests |
| Continuous mask, default | White silhouette, original-colour subject, scene switch; no empty mask frames | Mask Glitch, including consecutive or compound requests |
| Reference pulses | Explicit measured on/off pulses before the switch | Only when matching a supplied reference or when specifically requested |
| Batched pop and white flash | Objects pop in in groups; scene switches; white blips follow | Explicit pop/batch/post-switch-flash requests or the old `pop-in-white-flash` name |

The [legacy variant](references/batched-pop-white-flash.md) preserves the earlier
entrance and post-switch-flash recipe. Do not silently add its pops or white blips
to the continuous variant. [Reference timing and corrected variants](../../../docs/effects/anderson-taii-transitions.md)
distinguish the original reel's off frames from the creator's continuous treatment.

## Prepared reveal sequences

For ordered normal-speed moving cutouts, use `proposal_reveal_sequence` to bind
named prepared actors, source-bounded presence durations and linked audio to a
base proposal option. Default to one shared time-between-entrances dial; expose
independent gaps when requested. The compiler returns existing operations and
control bindings without media preparation or timeline writes. Retain the base
option without timing controls so control-only revisions can reuse it. Preserve
relevant appearance controls and follow the proposal standard’s 15-slider cap.
Do not rerun segmentation for a timing-control change. Normal preflight, targeted
preview verification and human approval still apply. Fixed beat anchors or speech
synchronization require their existing specialized workflow instead.

## Subject flash + glow variant

Use **Properties → Style → Effects → Add effect → Subject Flash** on a transparent
subject layer, and optionally add **Subject Glow**. These are independent clip
treatments with static defaults; explicitly author the recipe's flash/glow timing.
Each treatment has its own enable, Reset and Remove. Disable preserves its values
and animation; Remove clears only its fields and keys; Undo restores it. **Mask Glitch**
is the complete recipe in **Properties → Templates**, not an Add effect card.
White flash (`subject_flash`, 0–1) mixes original RGB toward white without changing
source alpha. Glow strength (`subject_glow`, 0–3; 0 disables it) adds an alpha-derived
white halo; Glow radius (`subject_glow_radius`, 0–80 px at 1080 canvas width, default
10) sets its softness. All three support native keyframes and per-control Reset.
This is an editable alpha halo, not a pixel-identical implementation of Adobe's
color-threshold Glow. Keep the background on its own layer.

Time flash and glow on each continuous subject clip; do not split or bake media
just to toggle these controls. For distinct poses, use real source-window cuts,
preserve handles, and keep the pose order editable. The proposal `create_visual`
contract accepts these values and `transition_keyframes` for their curves.
Keep glow off for the plain-mask variant. Set strength to zero at the end of its
falloff so the normal subject does not retain a white rim.

Measure reference pulses before choosing timing. The earlier AE tutorial uses two
frames at 25 fps while its delivered reel has one-frame pulses at 24 fps. Record
which interpretation and output-frame quantization is used. Check the last
pre-flash frame, every flash/falloff frame, and settled colour; check backward seeks
and that transparent background pixels remain unchanged beyond the halo.

## Masked flash + crisp click variant

When the request names the flash/click pairing or asks to bundle a masked white flash with its click, use [Masked flash + crisp click](references/masked-flash-click.md) and its [structured recipe](references/masked-flash-click.recipe.json). This is a short registered white overlay plus a source-anchored click, not the continuous scene handoff. Keep both actors editable and review the audiovisual accent together. Sound remains absent by default for the other variants.

## Continuous handoff timing

Use these demonstrated working defaults unless the user supplies another timing:

| Setting | Default | Adjustable |
| --- | --- | --- |
| Lead-in | Five frames at 30 fps, approximately 0.167 s | Duration or overall sequence effect speed |
| White | First two of the five frames | White/colour proportion |
| Colour | Last three frames, ending exactly at the scene cut | Colour hold |
| Visibility | White or colour mask on every lead-in frame | Only an explicit reference-pulse variant introduces off frames |
| Framing | White and colour share geometry and incoming-shot fit/crop | Explicit framing request |
| Scene hold | Retain existing shot pacing | Requested chain pacing or cut anchors |
| Sound | Preserve current sound; add none by default | Requested SFX through sound-design |

For a cut at output frame C: white occupies [C−5, C−3), colour [C−3, C),
and the incoming scene begins at C. Use half-open integer-frame intervals so
rounding cannot introduce empty frames. At another output fps, quantize the total
lead-in near 0.167 s, then divide it at 40% white / 60% colour, with at least one
frame per phase. Require at least two total frames; report incompatible requests.
An optional effect-speed multiplier rescales all lead-ins together, not source
playback or shot holds. Fixed cut anchors remain fixed.

## Consecutive / compound sequence

1. Resolve the ordered shots and each handoff's incoming subject: A → B uses B's
   masks; B → C uses C's masks. The middle shot is both the previous destination
   and next outgoing scene. Do not reuse B's matte as C's subject by accident.
2. Record one sequence receipt in the project's analysis directory: ordered source
   identities/windows, cut frames, subject IDs, white/colour assets, shared settings,
   per-handoff overrides, and each derived lead-in interval. Link prepared-media
   receipts and source-clock mappings for moving mattes.
3. Derive every lead-in backward from its cut. Retain existing shot timing when
   available. A destination shot must be on screen before its next handoff begins.
   If intervals collide, report the conflict and shorten the lead-ins together or
   use requested new cut anchors; never silently overlap unrelated subject masks.
4. Place full source-backed shots and separate native white/colour mask elements.
   Each mask uses its destination shot's fit, crop, position and scale. For multiple
   selected subjects, keep subject instances separately editable and use the same
   phase schedule unless an explicit stagger was requested. Preserve unused source
   handles; derivatives retain their original source mapping.
5. At each scene switch end that handoff's subject overlays exactly as the incoming
   picture takes over. Avoid duplicate subject edges, residual white, or carrying
   the previous mask into the next handoff. Each handoff remains independently
   identifiable in the receipt and element titles.
6. Present the requested chain as one coordinated proposal, since neighboring
   handoffs share middle-shot placement and the user requested an integrated
   sequence. A recommendation or playback never applies it. Use the supported
   `create_visual` and patch operations, and run proposal spatial preflight.

“Compound” here describes the coordinated editorial recipe and review unit. There
is no claim of a dedicated Mask Glitch compound preset or automatic matte generator.
Native rows retain individual edit controls; the sequence receipt keeps their shared
schedule. When revising a shared parameter, rederive all affected handoffs together.

## Check the settled composite before expanding

For a new masked reveal treatment, first inspect a short representative section after
the flash/glow has faded, using frame-state and normal-speed preview. Check subject edges,
included hands/arms, background registration and whether earlier subjects should persist.
A flash can hide defects that become obvious in the settled image. Resolve that construction
before preparing the full chain; reuse evidence only when its inputs and question match.
If the settled frame needs a clean background plate or a wider source patch, make that
an explicit composition decision. Do not silently switch to a full frame that removes
previously accumulated subjects. Prepared masks come through [rotoscope](../rotoscope/SKILL.md).

## Verify and hand off

Before appearance claims, follow frame-state discipline. Inspect every frame from
one frame before each lead-in through the first incoming frame, plus the following
settled state. Check continuous coverage, shared white/colour alpha and geometry,
source-colour preservation, the exact switch frame and absence of residual masks.
Preview the complete chain at normal speed, including each middle shot.

Check all handoffs again when a shared schedule or middle shot changes. Keep other
effects and source clocks fixed. Report unresolved matte quality, unavailable
preparation or unsupported motion explicitly. Do not export a movie to demonstrate
a sequence when timeline preview is the requested output.

Example request:

> Use Mask Glitch across these three shots in order. Make consecutive handoffs with
> continuous white-to-colour masks, keep the subjects editable, and show the whole
> sequence on the timeline.

## Packaged templates

[Masking Hook](templates/masking-hook.md): three quick cut-out flashes on black (white, colour, head only), then the shot plays on from the same moment.

[Mask Glitch · Glow](templates/mask-glitch-glow.md): successive poses appear over the empty set as glowing white silhouettes, then show their colour.

## Effect recipe evidence

[Catalog-linked evidence](references/effect-evidence.json) includes the corrected
two-handoff example and the distinct legacy batched-pop example. Both
remain partial recipes; longer chains and moving tracked masks need fresh-input
verification. Existing examples do not establish an automatic compound UI feature.
