# Masked flash + crisp click

An explicit compound variant of Mask Glitch: a brief white flash restricted to a prepared subject or region, paired with one short click. This is a recurring treatment from one source edit. It does **not** automatically insert the continuous white → colour → scene handoff or the legacy batched pop sequence.

[Structured recipe](masked-flash-click.recipe.json) · [Compound recipe architecture](../../../../docs/architecture/compound-effect-recipes.md)

## Contract and maturity

Owner: `mask-glitch`; supporting procedure: `sound-design`. Recipe ID: `masked-flash-click`, version 1. This ID identifies this skill-owned recipe, not an entry in `docs/effects/catalog.json`.

This is an agent-executable recipe using existing proposal operations. It is not a new one-click preset, a runtime-loaded graph, or a flattened media asset. Its schedule is extracted from 14 existing flash/click pairs in that source edit. Two representative flash boundaries were inspected with frame-state; no new-input recreation or full audio/visual acceptance trial is claimed. Keep its maturity partial.

## Inputs and ownership

- **Target:** the actor or region being accented, and the desired first flash frame.
- **Registered white matte:** prepared alpha media aligned to that target, preserving the required hole/subject boundaries and any intended outline. A background/surround flash needs the appropriate inverse region matte. A full rectangle is not a substitute. Moving imagery needs source-time-matched masks.
- **Click:** a cleared short sound plus full source duration, source window, and measured audible anchor. The source edit uses catalog ID `celfstudies_mouse_click_01_crisp`; the recipe references that identity and hash rather than redistributing the licensed WAV.
- **Context:** output frame rate, target geometry/layer relationships, current cut and audio lanes, and applicable preferences.

Missing matte preparation or unavailable sound is an explicit input gap. Do not redraw the subject, silently choose a different sound, or modify the underlying shot just to apply this accent. The source project's preference for this repeated pairing overrides the general preference to vary sounds within this bounded treatment; it does not change the global preference.

## Schedule

Let `F` be the first flash frame, `fps` the output frame rate, and `N` the chosen flash length. Intervals are half-open.

| Component | Source-edit settings | Derivation |
| --- | --- | --- |
| White region flash | 4 frames by default at 30 fps; 2-frame short variant | Active on `[F, F + N)` |
| Flash appearance | White, full opacity, registered to the target | Use prepared white alpha, or supported full white recolor on the original alpha |
| Click | Full 0.227437 s source, 1× playback | Start at `(F − 1) / 30` in the 30 fps example |
| Click gain | Linear 0.254172, approximately −11.897 dB | Observed starting value; audition against the new mix |
| Click fades | 0 s in; 0.005 s out | Preserve the attack and short decay |

Nine observed pairs use four flash frames; five use two. Four is the reusable working default chosen from the modal observed value, not a claim that every accent should be lengthened. Preserve per-instance two-frame choices when extracting or reusing an existing arrangement.

At another frame rate, preserve durations before quantizing: `N = max(1, round(reference_flash_frames * fps / 30))`; click lead frames `L = round(fps / 30)` and start frame `F − L`. Do not change source playback rate to make the sound fit the white interval. Its short tail may outlast the flash.

For the source edit's click, the catalog peak is 0.040 s after source start. Starting the file one 30 fps frame early places that peak approximately 6.7 ms after the first white frame. The one-frame lead is therefore a **source-specific measured setting**, not a universal audio rule.

For an explicitly chosen replacement sound, derive the source start from its audible anchor:

`start = flash_time + desired_peak_offset − (source_peak − source_in) / playback_rate`

Then quantize once to the output frame grid and report residual alignment error. Do not carry the source edit's file offset to a different sound without measuring it. If the lead would start before frame zero, resolve that conflict explicitly; do not silently clamp and claim alignment was preserved.

## Apply through one coordinated proposal

1. Read the target timeline and scoped preferences. Bind inputs by source identity and target role, not copied source-edit element IDs or absolute project times.
2. Resolve flash frame and mask registration from the existing target. Use semantic placement by default; measured numeric fallback follows the spatial-authoring standard. Preserve the original picture, captions, source clock, and surrounding edit.
3. Prepare one separate native white-mask actor for the flash interval, and one `create_audio` actor with the declared full source duration and source window. Use existing visuals when revising an instance rather than stacking duplicate flashes or clicks.
4. Put the flash above the intended target but below any layers that should remain unaffected. Keep the original lane order elsewhere. Allocate adjacent SFX lanes when click tails overlap; do not shorten the tail merely to avoid a lane conflict.
5. Bundle picture and sound in one option for this one audiovisual decision. Individual components remain editable. Several independent accents can be separate cards; a deliberately coordinated chain can be one integrated sequence. Do not split the click from its flash into independently approvable results that misrepresent the requested bundle.
6. Derive the draft inventory, choose supported review controls, and run scoped spatial preflight on the exact candidate before `proposal_create`. Human approval remains distinct from preview and tuning.

## Controls

Expose **Flash duration**, **Flash amount/opacity**, and **Click level** when supported by the configured operations. Preserve source identity by default; offer a replacement through an explicit sound choice, not a fabricated source slider. Start/offset adjustment is useful when timing is under review, but only expose it through a supported field.

The recipe owns the shared schedule. Changing its anchor in an agent revision moves both components together; changing flash length leaves the click's anchor unchanged. The current review UI does not promise a single compound-anchor dial or automatic sibling synchronization. Do not label independent component controls as linked. If that interaction is needed, extend the proposal/override contract before advertising it.

## Verify

Check picture immediately before the flash, every flash frame, and the first restored frame. Check the correct region is white, protected holes/layers remain visible, and the original appearance returns without residual masks. For the working cut use frame-state; for an unapproved candidate use proposal preview, not a claim that working-cut instruments checked the candidate.

Listen to the paired result at normal speed with the existing mix. Confirm audible-event alignment, intelligibility, tail behavior, and absence of duplicate clicks. A catalog peak and a timeline audit establish scheduling, not subjective sonic fit. Recheck affected instances after changing a shared parameter. Do not export merely to package or inspect the recipe.

## Reuse and personal style

Example request:

> Use Masked flash + crisp click on these accents, like the source edit. Keep four-frame flashes unless I mark a short one, preserve the click pairing, and show the proposed picture and sound together.

The shared recipe owns construction and adjustable parameters. A saved personal style can later select `skill: "mask-glitch"` and scalar parameters such as `variant: "masked-flash-click"`, `recipe_version: 1`, `reference_fps: 30`, `flash_frames: 4`, `click_gain: 0.254172`, and `click_lead_frames: 1`. Sound catalog ID/hash identify the desired asset, whose availability is checked on reuse.

Do not put this skill-local recipe ID in the current personal-style `recipe_id` field: that field validates against catalog entries with recreation evidence. Use the scalar variant selector until a matching catalog entry is properly packaged. A style save requires an explicit save request; this extraction prepares the recipe but does not create a style or silently apply it elsewhere.
