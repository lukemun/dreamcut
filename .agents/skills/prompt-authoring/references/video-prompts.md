# Video prompt craft

Use for motion generation, first/last-frame transitions, and revisions of failed
clips. Read [generation direction](generation-direction.md) for common boundaries.

## Choose the shot structure first

Distinguish one continuous shot, a continuous first/last-frame transition, a sequence
with cuts, and independently replaceable clips. A supplied last frame is a destination
for interpolation; it is not a guaranteed mid-clip cut or instruction for the route.
Do not turn an explicit cut into continuous travel by simply adding “cut to” to prose.

Check the selected DreamCut adapter. The current prompt composer authors a single
prompt, not a structured shot array. Provider support elsewhere does not establish
local support. When the request needs unsupported shot controls, explain the limitation
and suggest a supported plan. Respect a user's decision to continue testing one clip;
do not silently add references, split the sequence, or change models.

## Freeze the shot contract

Before writing, record:

- actual model/route, duration, aspect, quality, audio, and expansion settings;
- ordered references and what each actually constrains;
- starting view, required intermediate visible events, destination, and any hold;
- subject identities/counts and properties that remain continuous;
- camera position/path, camera viewing direction, and subject orientation separately.

Use scene anchors that remain meaningful during motion. A camera moving sideways
across an aircraft row is different from a camera looking down its aisle. “Passengers
face the nose, viewed in profile” describes subject orientation independently from
camera travel. Screen-left/right needs rechecking whenever the camera turns.

## Write the directing plan

For image-to-video, the input frame supplies the static scene. Lead with the requested
change: primary action, ordered progression, camera movement, supporting motion, and
requested sound. Re-describe static details only to identify actors or preserve a
critical feature. Text-to-video must also establish the scene and appearance.

Give each beat a feasible portion of the actual duration, including approach and
settling time. Timestamp prose is direction, not a guaranteed keyframe. A short clip
cannot conceal an overloaded route by using stronger adjectives. Keep necessary
ordered beats; remove unrelated embellishment before weakening the user's intent.

State exact visible counts and identify the actor for each action. Keep one coherent
camera path and explicitly ordered changes where the user needs more than one move.
Separate camera translation from rotation: a fixed-position turn, an orbit, a dolly,
and an optical zoom produce different visible results. Tie sound only to requested
events supported by the model.

When framing must stay fixed, give “locked camera” observable meaning: a stationary
tripod, fixed focal length and camera-to-subject distance, no zoom, dolly, pan, tilt
or reframing, and the same subject size and frame margins from start to finish.
Specify the permitted subject motion separately. Use only the relevant constraints;
an intentional approach toward the lens may change apparent size even with a locked
camera. This wording is direction, not an enforced camera control or guarantee.

Compile the plan into natural prose and the actual supported settings. Keep notes,
rubrics, and planning labels outside the submitted prompt. Check adapter-added text,
reference tokens, and expansion controls in the assembled request. Never copy camera
syntax from another model family or imply that an expansion setting guarantees motion.

## Review before spending

Review the complete request on five dimensions:

1. Intent: every required subject, event, count, and payoff survives.
2. Shot structure: motion, cuts, and endpoints agree with the selected route.
3. Timing: ordered actions fit the requested seconds.
4. Continuity: input roles, identity, geometry, and end state are unambiguous.
5. Economy: concise direction without conflicting clauses or unnecessary scene redesign.

Surface concrete blockers before submission: an unbound reference, impossible timing,
contradictory endpoints, incompatible simultaneous actions, or an unsupported control.
Repair within authorized scope; unresolved conflicts need a user decision. DreamCut
does not have MakeTrailer's automated semantic grading harness; this is an explicit
author review, not a model score or proof of generation quality.

## Revise from observed motion

Preserve the previous prompt, references, settings, and the user's accepted details.
Locate the failed event in the result and form one bounded revision hypothesis. For
example, distinguish wrong camera direction from passengers facing the wrong way;
changing both blindly makes comparison harder. Shorter wording is a tool for removing
conflict, not a universal quality rule.

Use [generated-asset-workflow](../../generated-asset-workflow/SKILL.md) for full playback,
frame inspection, draft iteration, and authorized quality promotion. Review the new
render again: higher resolution is another generation and can change choreography.
