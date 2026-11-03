# Static split-screen performances

Draft compiled route for two locked-camera live takes, including Clone Technique 01.
Use `split_screen@1` in one `proposal_create` option; originals remain unchanged.

Inspect both sources with `media_describe`/`source_evidence`. Supply measured `left`
and `right` source URLs, durations and starts, common `duration_seconds`, an optional
`timeline_start` and measured `seam_percent`. Declare distinct `left_lane` and
`right_lane` and the complete top-first `lane_order_keys`, right above left. The
right layer exposes the right side of its picture; the left layer below stays full.
Both performances run continuously at 1x. Do not retime a reaction to simulate live
interaction. Use independently measured windows, including from the same recording.

Main controls: Split position (5–95%), Edge softness (0–10%), Right take timing
(±30 output frames, clamped to actual source handles), Recorded sound (Left take,
Right take, Muted). Source timing is relative to the declared original source;
changing it preserves duration and playback rate. Reset restores authored mapping.
Only one take's recorded audio plays, avoiding accidental doubled ambience.

This route requires static framing/exposure and actors, shadows and reflections
staying on their own sides throughout the selected interval. A seam at a stationary
architectural edge may hide the join. Matching takes and a safe seam are inspected
inputs, not inferred by this compiler. Crossings require prepared moving mattes and
a separately verified construction. Mismatched backgrounds require better inputs.

On a disposable copy stage one proposal and inspect its warnings/dial sweep; inspect
every overlap frame with handles, play at normal speed, listen, seek/replay, tune and
reset, and verify persistence and human undo. Rebuild from new performers/settings
and independently grade before calling this reusable. Current compiler tests are
structural evidence only; actual-footage visible UI and fresh-input acceptance are
pending. No certified Templates card is supplied.


## An exhausted take after the performer exits (draft adaptation)

The two-input compiler requires both source windows to cover the common duration.
If one supplied take ends earlier, inspect its final frames and the reference ending
before choosing an adaptation. Preserve the other performer's continuing action.
An empty scene after a complete exit can support a short, explicitly disclosed
background hold; a visible performer cannot be frozen to manufacture missing action.
Moving foliage or shadows in that empty scene can still expose the hold at normal speed.

For this case use one ordinary native proposal option with two continuous 1×
`create_visual` clips and the same static split construction. Keep the exhausted
clip's complete source window inside the original and use its existing
`trailing_hold_seconds` field for the measured shortfall. Preserve the other clip's
live source through the common ending. This is an agent-built adaptation, not an
additional input supported by `split_screen@1`; do not send the hold to that block
or extend `source_end_seconds` beyond the file. Keep seam and feather adjustable and
verify the hold, source-window and shared ending controls actually offered by the card.
An independent per-clip end hold is not a coordinated whole-scene duration control.

Audit the derived source clock and the actual rendered ending separately. Check
every held frame for an empty exhausted side, continued action on the live side,
background continuity and silence or the declared audio authority. Compare source
phase only where the performer supplies a distinguishable pose: nearest-frame
matches in empty or nearly static regions can be ambiguous. Report those intervals
and uncertainty separately from a visible reaction or entrance timing error; an
exact authored source clock alone does not prove exact reference correspondence.

## Three or more performances with local scene repair (draft)

The two-input block above does not compile a multi-split scene or a repair patch.
Use one ordinary native proposal option for the coordinated actors. Read the current
create-visual and numeric-control schemas through capability_catalog before authoring.
Keep one continuous 1× original clip per performance and independently measured source
starts and timeline starts. A late arrival in the reference does not imply that all
sources start together. Compare interaction poses at early, middle and late beats;
a nearest-frame image search helps navigation but cannot determine the final clock.
Record any explicit hold as an adaptation rather than silently extending a take.

Place a full-frame base below each additional performance. For each upper take,
measure a static half-plane boundary that clears the entire performer, including
hands, feet, shadows and motion blur. Use native mask_inset with the supported
mask_line_rotation and feather, rather than rotating the picture or a rectangular
crop. Rotation changes the boundary normal as well as its apparent intercept;
re-measure against the actual canvas dimensions and inspect both top and bottom.
A safe middle-height seam alone can still remove a raised arm or foot. Preserve
all active visual lanes in the complete top-first order.

When a seat or other flexible surface differs between takes, a separate localized
patch may hide the mismatch. Use native ellipse or supported rectangle mask_shape,
measured mask_inset and feather on a synchronized duplicate of the appropriate
original; place it above the splits. Keep that patch independently editable and
muted, with the same source clock as the surface it restores. Check its complete
motion envelope: a soft patch can hide bench flex yet overwrite a moving leg.
Moving camera, crossing performers or nonlocal background changes need a different
measured or tracked construction; this static method does not repair them.

Expose each seam position/angle/softness, patch bounds/softness and only the source
slip ranges that actual handles permit. Couple source-start and source-end changes
so duration and timeline placement remain fixed. Retain one recorded-audio authority
or a separately supplied soundtrack; mute duplicated ambience. Native renderer support
does not establish that editor sliders reach the authored values. Verify controls,
reset, reload/persistence, seeks and output before claiming full native usability.

Inspect all overlap frames coarsely, then enlarge performer extrema and patch crossings
at output resolution. Play the complete combined result and reference at 1×, listen,
and separately grade reaction phase, all body parts, surface continuity and endings.
Record coarse coverage separately from fine-edge inspection. Rebuild from inputs in a
fresh session and test another supported input set before reuse certification. Current
multi-split evidence is a supplied-footage prototype; no dedicated multi-split compiler,
full control certification, fresh rebuild or new-input transfer is established.
