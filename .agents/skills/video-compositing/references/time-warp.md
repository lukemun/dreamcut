# Time Warp: one scene, separate source clocks

Use this method for a locked-camera performance that stays at natural speed while
its environment accelerates after a gesture. This is an agent-built native method,
not a one-click compiler or a verified transfer recipe. Use editorial-assembly for
a fresh workspace and dreamcut-proposals for an existing cut.

## Inputs and measurement

Require the actual continuous performance and enough later environment footage,
with stable camera, exposure and framing. Inspect source metadata, preparation
receipts, the complete reference and its final variant. Preserve original source
identity and watermarks. A tutorial preview is reference evidence, not source media.

Measure the source entrance, triggering gesture and desired payoff. Keep source
PTS, source frame rate and output-frame indices distinct. Honor supplied marks;
when the gesture is ambiguous, disclose uncertainty rather than invent exactness.
Choose output length and acceleration from the requested reference and available
source tail. Check the entire retimed source interval remains in bounds.

## Editable construction

1. Prepare the source through media-intake and media_readiness. Use the prepared
   preview for editing and original full-quality source for export.
2. Put the continuous environment on the bottom lane. Preserve a normal-speed
   lead, then add a native hold speed step at the measured cue. The step carries
   local timeline time, rate and source anchor. Use the speed-step source-clock
   helpers/contracts; never replace acceleration with a frozen frame or split/bake
   workaround. Inspect the stored trim after frame quantization before anchoring.
3. Keep the performance on a synchronized normal-speed layer. For a horizon with
   separable foreground, use a feathered native mask. When a tree or actor region
   crosses that boundary, add a synchronized recovery layer with a native ellipse
   or the supported source-matched matte route. Measure bounds from this input;
   static masks are unsuitable if essential motion leaves their coverage.
4. Ellipse masks use mask_shape=ellipse, normalized top/right/bottom/left
   mask_inset, mask_feather and mask_line_rotation in degrees. Ellipse rotation is
   around its own centre. Feather is canvas-height-relative, converted against
   the ellipse radii. Keep rotation and shape separate from picture transforms.
   Ellipse insets support -1 through 0.95: negative values extend that edge
   outside the canvas, up to one canvas dimension. Rectangle insets remain
   nonnegative. Use the native Ellipse edges controls; proposal ranges also keep
   a nonempty opening. Shape changes to Rectangle bound static and animated
   insets to its supported range, so recheck coverage after a shape reset.
   Extend only the edge needed to protect the measured region. Compare the
   entire resulting boundary against the final reference: covering a tree seam
   can also retain a patch of normal-speed sky. A successful negative inset or
   clean still does not prove that patch is unobtrusive during playback.
5. Give only the intended normal-speed source audio authority; mute accelerated
   environment and recovery duplicates. Preserve silence if the source/reference
   is silent. Audible high-rate preview is not established by silent-picture
   support. Do not clamp a requested high rate and claim equivalent timing.
6. Source-window placement derives duration from its scalar rate. When assembling
   a speed-step clip, use the supported workspace placement followed by an atomic
   elements_batch updating the step and resulting duration, with revision guard.
   On an existing cut keep these dependent changes in one proposal.

Expose useful native controls for cue time, accelerated rate, foreground boundary,
recovery shape/bounds, angle and feather. Preserve source handles when they change.

## Acceptance and recovery

Read canonical frame-state evidence before appearance review. Inspect the lead,
frames around the gesture, the full accelerated interval and ending; compare the
actor and environment clocks independently. Require intact subject, stable
foreground, moving environment, no distracting matte boundary, preserved framing
and intentional audio. Distinguish component completeness from fine alignment.

Verify GPU admission, editor seek/play/pause/replay and native control changes,
then reload to check persistence. In particular, test seeking onto a high-rate step:
silent audio channels must remain paused rather than assigning unsupported browser
playbackRate values. A successful encoded export cannot establish this UI behavior.
For an authorized export use platform-video-delivery and inspect the actual file.

Save reference observations, selected source clocks and deviations privately.
A copied timeline tests controls only; a fresh builder using this method and the
initial brief tests repeatability. New supplied inputs are required for transfer.
Keep unobserved motion/audio and unsupported input cases explicitly unverified.
