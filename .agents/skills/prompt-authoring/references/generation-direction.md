# Image and video generation direction

Read [still prompt craft](still-prompts.md) or [video prompt craft](video-prompts.md)
for the selected task before drafting. This page owns common integration boundaries.

Inspect the current asset model catalog and prompt contract before authoring:
[asset-models.ts](../../../../src/lib/generation/asset-models.ts) and
[prompt-authoring.ts](../../../../src/lib/generation/prompt-authoring.ts).
Read only the task-relevant branches; these are implementation authorities that may
change. Provider controls belong in structured settings when the integration supports
them. Prose must not pretend to set unsupported duration, resolution, references,
camera controls, or audio behavior.

- **Text to image:** describe the supplied subject/action, composition, environment,
  and treatment. Identify required text exactly. For separately adjustable actors,
  plan separate assets using the compositing workflow rather than baking them together.
- **Image editing:** name the change and the source details to preserve. Assign each
  reference a role such as subject, style, or composition. Do not claim all references
  are used if the selected route accepts only some roles.
- **Image to video:** the frame establishes appearance and framing. Prioritize the
  requested motion and camera behavior; avoid accidentally redesigning the subject.
  An end frame constrains the destination, but does not supply unspecified choreography.
- **Motion reference:** let the supplied motion own choreography. Avoid conflicting
  directions; preserve any requested subject identity and distinguish subject motion
  from camera movement.
- **Text to video:** describe a feasible sequence within the actual duration and
  shot contract. Do not silently convert a single-shot request into an edit montage.
- **Audio:** include sound or dialogue only when requested and supported. Preserve
  exact supplied dialogue and speaker ownership; do not invent speech or sound.

For any route, explain material assumptions and identify which references were actually
inspected. The current local prompt authoring worker receives intent and role metadata,
not media pixels; it must not invent visual observations. Keep creator intent and the
authored prompt inspectable, and let the user modify the draft through the normal flow.
Changing inputs may invalidate a previous suggestion; use the integration's stale-draft
handling and validation. Writing or applying a suggested prompt alone does not authorize
paid generation, import, timeline placement, or export.

## Camera and subject orientation

Describe the camera's path and viewing direction separately from subject orientation.
Anchor directions to the scene (aircraft nose, opposite window) and describe the expected
visible result (passenger profiles). Check that screen-relative directions stay valid
throughout a turn. Keep temporal claims feasible within the supplied endpoints.

On revision, preserve the successful baseline and change the smallest instruction
responsible for the observed defect. Simplify conflicting or repeated clauses before
adding emphasis. These are authoring heuristics, not guarantees of model compliance.
The generated-asset workflow owns execution and result verification.
