
# Batched pop and white flash variant

Turn two photos into an editable object-led transition. This preserves the former Pop-in white flash behavior under Mask Glitch. Select
this variant only when pops/batches and post-switch white flashes are requested.

## Inputs and choices

Required: starting photo, destination photo containing the objects, and which objects
to use. Inspect both photos and resolve ambiguous roles or object selection before
preparing assets. Read applicable project/style context and follow
[dreamcut-proposals](../../dreamcut-proposals/SKILL.md) for the execution stage.
For a new project use the bounded assembly route; an existing edit requires a proposal.
Ask where the effect belongs if the project context does not establish placement.

Use these restrained working defaults when unspecified; current user direction wins.
These are authored defaults, not measurements of a catalog video.

| Choice | Default | Creator can change |
| --- | --- | --- |
| Objects | All clearly separable visible objects of the requested kind | Named subset or count |
| Entrance | Quick scale pop from 85% to 100% with opacity 0 to 1; no slide | Pop strength, entrance duration, or a requested slide variant |
| Batches | Up to 3 balanced groups, ordered left to right by source position | One at a time, simultaneous, group size or explicit order |
| Pace | Fast: 0.15s entrance, 0.10s between batch starts | Fast/slow direction, duration, or exact timing |
| Scene switch | When the last batch finishes its entrance | Earlier/later handoff |
| White flash | Each batch flashes pure white for 0.067s, starting at the switch and 0.067s apart | Flash length, spacing, simultaneous flashes, or off |
| Final hold | 0.5s after the last flash | Hold duration |
| Framing | Preserve the project's output format; fit destination and cutouts identically | Explicit output format and fit/crop |
| Sound | None | Requested music or SFX via sound-design |

Quantize all times to project frames (at least one frame for a nonzero flash).
Batch count is min(3, object count); distribute counts as evenly as possible.
Derive total length from entrance, stagger, switch, flashes, and hold; do not invent
extra groups to fit an arbitrary duration. An explicit total duration rescales this
schedule uniformly, excluding any explicitly fixed hold. Report incompatible timing.
If a reference is actually supplied, use its measured timing instead of these defaults;
never ask the agent to match an unseen example or silently assume the catalog is attached.

## Prepare and compose

1. Use [media-intake](../../media-intake/SKILL.md) for supplied files, then follow
   [object cutouts and scene transitions](../../video-compositing/references/object-cutouts.md)
   for mask choice, source-pixel extraction, registration, and white silhouettes.
   Reuse verified masks when present. Otherwise establish an available mask method;
   do not imply this skill installs segmentation tools or authorizes external uploads.
   Missing or poor masks are a preparation blocker, not a reason to redraw the objects.
2. Record resolved choices and the frame-quantized batch/flash schedule in the project
   preparation receipt. Keep sources unchanged and each object separately editable.
3. Compose through [video-compositing](../../video-compositing/SKILL.md) using current native
   motion and opacity controls. Keep settled cutouts registered to the destination.
   At the switch remove cutout duplicates; white silhouettes overlay their matching
   destination positions. Check native capability before promising motion fidelity;
   unsupported motion routes to [recreate-effect](../../recreate-effect/SKILL.md).
4. Prepare one coordinated proposal for the transition on an existing edit. Present
   the playable preview, actual settings, and any remaining mask or motion limitations.
   Rendering/export is a separate request, not a prerequisite for invoking this skill.

## Verify

Inspect cutout edges, every batch entrance, the handoff, every flash, and final hold.
Verify no duplicated edges at the switch and no missing selected objects after fitting.
Use the compositing procedure's instruments and normal-speed preview for timing;
inspect a pending proposal through its preview, not as if it were the working timeline.
Report unavailable tools or unsupported treatments before claiming completion.

## Example request

> Use Mask Glitch with the batched-pop-white-flash variant with these two photos. Start on the dinosaur photo,
> pop the birds from the second photo in batches, then reveal that photo and briefly
> flash the birds white. Use a fast pace and keep each bird editable.

The photo names are illustrative; invocation requires the creator's actual inputs.
Only overrides need to appear in the request. Defaults and configuration belong here,
not in a long checklist the creator must paste on every use.
