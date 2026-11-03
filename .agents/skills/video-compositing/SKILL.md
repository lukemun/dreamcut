---
name: video-compositing
description: Compose layered video, images, overlays, masks, keys, crops, and effects in a DreamCut timeline.
---

# Video compositing

Before constructing an effect, follow the [continuous-source effect gate](../../../docs/standards/effect-capabilities.md#continuous-source-effect-gate). Keep a continuous performance on one source clip with timed effects; document and justify any derivative or extra cut before preparing the proposal. Missing native controls are capability gaps, not permission to silently split or bake the treatment.

Read `../dreamcut-proposals/SKILL.md` before timeline work.
Read `../spatial-composition/SKILL.md` for multi-actor layout and evidence requirements.

Reason explicitly about canvas geometry, source aspect ratio, layer order, overlap, masks, and safe areas. Keep effects editable and use allowlisted effect controls. Validate representative frames at the start, middle, and end of an overlap.

Keep independently adjustable visual actors as separate elements, but place actors belonging to one scene in the same proposal option so the combined preview can be assessed.

For **Mask Glitch**, consecutive mask handoffs, or the legacy **Pop-in white flash** variant, use [mask-glitch](../mask-glitch/SKILL.md) as the named entry point; it owns sequence timing and uses this skill for construction.

For moving person or object masks, use [rotoscope](../rotoscope/SKILL.md) for source-matched tracking, correction, and matte verification before composition.

## Extract objects from a still

Follow [object cutouts and scene transitions](references/object-cutouts.md) when a
photo supplies independently animated objects. It defines required inputs, mask
options, source-pixel extraction, cleanup, registration, and acceptance. Generated
masks are optional; supplied alpha, manual masks, and compatible segmentation tools
can supply the same mask contract. Check actual tool availability and input support.

For reference recreations, consume the measured timing map from
`skill:template-authoring` (its reference-timing section).
Keep entrances, the background handoff, and object flashes in one coordinated recipe.

## Packaged templates

- [Black-backed light overlays](references/screen-light-overlay.md): draft native Screen route for a supplied portal, sparks or glow, with separate source clocks and lead-in/ending controls; first-prototype fidelity and fresh-input acceptance remain pending.

- [Contact object swap / frozen clean patch](references/contact-object-swap.md): draft three-layer native route for a practical landing replacement; complete incoming-object motion, cloth cleanup and original sound stay independently verifiable.

- [Time Warp / separate source clocks](references/time-warp.md): native accelerated environment with synchronized normal-speed foreground masks; prototype and control validation in progress, fresh-input transfer unverified.

- [Jump Cuts / pose sequence](references/pose-cut-sequence.md): native short source windows into one complete line, with supplied source-linked clicks; editing helper, not a promoted template.

- [Person Appear / clean-plate cut](references/clean-plate-cut.md): native adjacent empty-scene and normal landing clips; archive prototype and fresh-input acceptance pending.

- [Object Reveal / actor wake](references/actor-wake-reveal.md): native editable text revealed by a synchronized footage cover and a traced foreground cut-out (preferred over a green-screen key); rightward-crossing contract, approved once (Object Reveal, 2 Nov 2026); fresh-input acceptance pending.

- [Object-led line wipe](references/object-led-line-wipe.md): draft source-bound moving mask position and angle, protected release hand and native tail hold; combined visual and fresh-input acceptance pending.

- [Magic Pole / static scene split](references/static-scene-split.md): draft native split between matched locked-camera takes with bounded timing and feather; visual/fresh-input acceptance pending.

- [Static split-screen performances](references/split-screen-clones.md): draft `split_screen@1` route for two continuous locked-camera takes, plus a native multi-split/scene-patch procedure; control and fresh-input acceptance pending.

- [Hyperspeed](references/hyperspeed.md): native bounded accelerated middle with normal-speed handles, explicit audio policy and editable spatial blur; real-footage and fresh-session validation pending.
- [Floating Book / keyed still motion](references/keyed-still-motion.md): draft native keyed photograph with editable path, turn, size, colour and optional foreground matte; visual and real fresh-input acceptance pending.

- [See-through copy](references/see-through-copy.md): `see_through_copy@1` plays a translucent whole-person cut-out from later in the same take over its first performance, offset on the take's clock, with the copy's line on its clock and one timing dial. Proven once (Ghost); listening and a frame-by-frame check of the rise pending.
- [Matched-take region](references/matched-take-region.md): `matched_take_region@1` swaps one box of a continuous main take for the same box of a second matched take, keeps the main take's subject in front through its cut-out, and brings that take's sound on its own clock with one timing dial. Proven once (Liquid from Object); fresh-input rebuild and listening pending.
- [Behind-object vanish](references/behind-object-vanish.md): `behind_object_vanish@1` plays a matched take of the performer moving behind an object as back-to-back pieces with their own speeds, in a band of the frame and held back by the object take's cut-out, so they vanish and the object take plays on; a sound effect follows the vanish. Proven once (Cup Jump); listening and fresh footage pending.
- [Skyline cover](references/skyline-cover.md): `skyline_cover@1` covers everything below an object's skyline with the empty end of the same take (a rectangle plus a cut-out of the jagged edge), exposure matched, so the person seems to run behind it, then fades the cover as they clear the top. Proven once (Building Jump); listening and fresh footage pending.
- [Surface swap](references/surface-swap.md): `surface_swap@1` shows another clip only inside a traced surface of the main take (a floor becoming a pond), placed by size and position, with everything outside the surface as filmed and an optional sound linked to it. Proven once (House Pond); listening and fresh footage pending.
- [Wall screen](references/wall-screen.md): `wall_screen@1` pops a screen recording open on a wall of a locked take as a see-through, angled, cropped panel where the creator taps, plays it on its own clock with its sound, and redraws the creator from the take inside a person cut-out so they stay in front; a tap whoosh moves with the pop-open. Proven once (Wall Hologram); listening and fresh footage pending.
- [Freeze and fly out](references/freeze-fly-out.md): `freeze_fly_out@1` plays a locked take to a frozen moment and holds it, flies a person cut-out out of the frame from that frame on an ease-in with a directional blur streak, and cleans the spot with an empty frame of the same take shown only inside the subject's outline (plus a shadow rectangle); sounds are timed from the freeze. Proven once (Fly Like Superman); listening and fresh footage pending.
- [Launch a copy away](references/copy-launch.md): `copy_launch@1` plays one locked take where the person acts toward an empty spot and walks onto it; their later self waits on the spot (the later take in a feathered box, shadow included) until the contact, then a cut-out of their reaction climbs, drifts and shrinks into the distance with a short streak, and an optional cut-out of the action is drawn on top so it crosses in front. The take ends where the waiting copy starts, so it loops. Proven once (Kick Away, on a rebuilt low-resolution take); sound and fresh footage pending.
- [Clean-plate object reveal](references/clean-plate-object-reveal.md): hide a stationary object with a matching empty-scene patch, then end the patch at a marked gesture. Native masks remain editable; placement and reveal timing currently require agent inspection, with no dedicated one-click compiler.
- [Clone Converge](templates/clone-converge.md): live copies flash into their original positions, rush into one foreground copy together, then leave a beat before speech; agent-built candidate.
- [Clone Flash](templates/clone-flash.md): cut-out copies of the subject from later in the take arrive beside them with a white flash.
- [Silhouette Window](templates/silhouette-window.md): short fill clips play only inside the subject's moving silhouette.
- [Cross into Negative](templates/cross-negative.md): a cross opens onto the next shot as a black-and-white negative and widens to fill the frame.
- Speed Entrance & Exit: its own [speed-entrance-exit skill](../speed-entrance-exit/SKILL.md) (a cut-out keyframed out of frame, into frame or between marked stops with blur over a still, empty set).
- [Moving Grid Matte](templates/moving-grid-matte.md): the original footage shows only through square cells that follow the subject's silhouette.

## Effect recipe evidence

[Catalog-linked input/output evidence](references/effect-evidence.json) records reference, recreation, hashes, and limitations. Candidate and partial records do not establish a verified reusable effect.

## Learned refinements

### Check cutout color before handoff

For every RGB-bearing cutout, including reused or imported transparent video, record
its original source and mapped frame, preparation receipt, `source_color_space`, and
whether a grade is already baked into its pixels. Compare these with the plate's
decode interpretation and intended treatment. Prepared HDR authorities may be tagged
BT.709 for browser transport while their receipt says HLG/PQ: copying that file alone
into another project loses its interpretation. Use `media_import` on the archival
source and `media_readiness` for a complete new package; do not import a naked prepared
authority or guess its encoding from its filename or container tags.

Render the exact proposed composite with `run_instrument` frame-state with `--proposal <proposal id> --option <option id> --at <times>` at an
entrance, a settled frame after the flash/blur, and an exit. Compare skin, clothing,
neutral tones and contrast against the mapped source under the intended grade. Inspect
each distinct cutout source; whole-frame histograms and identical grade numbers cannot
prove a subject match. Keep a private color-check receipt with the proposal hash,
source mappings, inspected frame paths, observations and pass/fail/pending result.
An unexplained color difference fails this check; repair the source interpretation
before compensating with a creative grade. Report unverified color separately from
mask geometry and motion. `pnpm verify` samples transparent-video boundaries and a
midpoint, but does not automatically measure color equality or certify a proposal.

- Scope colour and brightness effects to the intended actors and beats, then verify at representative frames that embedded and reveal layers retain their independently intended colour.
- Use the current approved graded source as color authority for its derivatives, and verify every plate, cutout, mask-context layer, and replacement shot matches it at representative reveal and settled frames.
