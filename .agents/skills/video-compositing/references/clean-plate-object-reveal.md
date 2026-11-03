# Clean-plate object reveal

Make a stationary object appear at a gesture by covering it with a matching patch
from an empty-scene take, then ending that patch. This is a native composition
procedure. A draft `clean_plate_reveal@1` proposal block packages this construction
and its controls; visual acceptance and fresh-input transfer remain unverified.
The agent measures the patch and chooses the gesture frame from inspected evidence.

## Inputs and inspection

Require the unchanged action take with the object already in place, plus an
empty-object take with the same locked camera, framing, focus, exposure and light.
The empty take may contain people outside the required patch. Keep useful source
handles, and ask for a reveal mark only when the intended gesture is ambiguous.
Missing background pixels cannot be recovered by adjusting a mask.

Before choosing the reveal frame, test whether the gesture evidence supports the
required timing tolerance. Inspect consecutive source frames around the hand action
and use audio only when a real cue exists. A blurred silent gesture may not have
an independently identifiable completion frame. When it does not, ask the creator
for the intended reveal mark (with source identity and time/frame mapping), or keep
causal timing explicitly unverified. Do not promote a plausible builder-selected
frame, a prior demo's timing or the first visible object frame to gesture ground
truth. Record the ambiguity and stop repeating unchanged timing trials until the
mark or clearer evidence arrives. New guidance versions the acceptance input; it
does not retrospectively certify the previous timing.

Use `media_import` with managed copies and `media_readiness` for both video
packages. Use `media_describe` plan, `source_evidence`, then record for source-linked
observations. Inspect the object, its shadow/reflection and nearby moving limbs
before, during and after the gesture. Requested source seek times are approximate;
verify the chosen output frame with frame-state rather than claiming source PTS
precision. Read the proposals, spatial composition and preprocessing skills.

## Native construction

Keep the complete continuous action on one source-backed element. Use a second
source-backed element for the empty-scene patch, immediately above it in the lane
order. Both clocks run normally; the action is never cut just to toggle the effect.
Mute the patch so it cannot duplicate recorded sound. Preserve the action's audio.

Place the patch from `open_space_find` and inspected geometry. This overlay
intentionally covers the object, so document its counter/surface region and the
foreground parts it must avoid. Use native `mask_inset` in top/right/bottom/left
fractions and `mask_feather` to include the object and any unwanted shadow or
reflection without covering the performer. Keep both source transforms identical
when the takes align. A mismatch in camera or lighting is a missing-input or
matching problem; do not conceal it with an oversized mask.

Align the patch to the action's start and trim its tail to the chosen reveal frame.
Use `element_create_from_source_window`, props and lane tools only while a fresh
assembly grant is live; use one integrated `proposal_create` option for a working
or handed-off timeline. Never mutate project files to build the effect.

## Controls and acceptance

For the draft compiled route, use one `proposal_create` option containing a
`clean_plate_reveal` block, version 1. Supply the hero and clean-plate source URLs,
source durations and starts, the selected hero duration, measured patch edges as
0–1 canvas fractions, and `reveal_seconds` relative to the selected hero window.
Supply distinct hero/patch lanes and the complete top-first `lane_order_keys`,
with patch above hero. Video plates need handles for the full hero duration so
timing adjustments remain source-backed; still plates are also accepted.

The block keeps hero audio and mutes the patch. Its main dials are Reveal shift
(−30 to +30 output frames, bounded to the hero window), Edge softness, Patch width
and Patch height. Advanced adjustments expose patch position, plate alignment and
plate scale. Reset restores authored settings. Geometry remains a static rectangle;
the block does not detect gestures, track subjects or match exposure. Inspect
the actual compiled card and its dial sweep before treating this draft as usable.

Offer reveal time through the patch's tail trim, mask edges, feather and patch
position/size when those adjustments are relevant. Keep the source windows intact.
For proposals, select supported controls from the actual control inventory, and
read the dial sweep. A rectangle tuple or timing field without a numeric proposal
dial remains reachable through the normal clip/mask inspector; do not invent dials
or claim linked group controls.

Inspect the combined frame immediately before, at and after the reveal, plus
opening, representative hidden hold, pickup and final states. Check background
edge/texture matching, complete object concealment, performer clearance and source
continuity. Run normal-speed playback with seeking/replay; stills alone cannot
prove a clean gesture or uninterrupted playback. An advancing playhead and an
endpoint screenshot establish playback progression, not continuous visual inspection
of concealment. Record which frames or moving intervals were actually visually
observed; keep an uncovered hidden interval unverified. Check sound separately if present.
Run timeline QC. Call `assembly_handoff` before presenting a new layout; later
corrections use proposals.

For a personal catalog candidate, use effect-authoring: pair the actual untreated
action and empty-scene inputs with an explicitly authorized rendered result.
Keep example media and measurements private. State the draft route's pending visual
acceptance, agent-measured geometry/timing, reference coverage and untested fresh-input reuse
on the card. Saving a candidate is not one-click certification or publication.
