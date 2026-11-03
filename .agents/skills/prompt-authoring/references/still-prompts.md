# Still prompt craft

Use for generated reference frames, artwork, or edits to an existing image. Read
[generation direction](generation-direction.md) for input and execution boundaries.

## Establish the image contract

Record the requested visible result, actual attached inputs, each input's role,
and what must remain unchanged. Separate a new scene from a bounded edit: in a
bounded edit, the base image owns unnamed properties. A new style reference does
not authorize replacing identity, framing, lighting, or content.

For each reference, identify what it supplies: identity, rendering treatment,
composition, lighting, or a particular object. Describe both the borrowed attributes
and any likely unwanted borrowing. A style reference does not automatically own
identity. A filename or character name does not bind an identity to visible pixels.
Use descriptions grounded in inspected images or supported explicit input bindings.

## Describe a visible target

- Ground the complete frame first: principal subject or ensemble, exact count, and
  arrangement. Then state the decisive visible action or relationship before details.
- Keep secondary details proportionate. Give relative size and placement when a
  small prop might otherwise become the whole subject. For full figures or isolated
  objects, specify the complete visible extent and surrounding clearance.
- Separate position, body direction, head direction, gaze, and camera angle when
  they matter. Translate an offscreen relationship into a visible eyeline rather
  than accidentally inviting another person into the image.
- Cover scene, lighting, background, composition, and camera when relevant. These
  are a mental checklist; DreamCut does not require five separate prompt fields.
- Resolve alternatives and conditions before submission. Give one chosen target
  per property. Keep internal labels, application field names, and editorial rationale
  in the brief; the provider prompt describes the actual image.
- State the requested positive result. Add a narrow prohibition when it addresses
  an observed failure; do not accumulate an unrelated negative checklist.

## Text and compositing

Decide whether text belongs in the generated pixels or on a later editable layer.
For image-baked lettering, quote the exact words and describe placement, relative
size, weight, color, and visible type treatment. Check spelling in the result.
For later text, describe the required empty area without suggesting that the model
should draw the future lettering. Keep independently adjustable objects separate.

A black background is not transparency. Cutout lettering or a removable background
needs an explicit compositing/matte plan and subsequent verification. For animation
endpoints, keep the full object and its maximum intended extent inside the frame;
matching camera position and margins help avoid unintended scale changes.

## Review the assembled request

Check the actual attached-image order and complete provider prompt, including any
automatic reference instructions. Every name/index must resolve; every property must
have a clear owner. Remove conflicting or duplicate instructions introduced by
assembly. Do not assume MakeTrailer's preset injection exists in DreamCut.

Before staging, record unresolved issues in identity/count, framing, preservation,
reference ownership, or exact text. After execution, inspect those same properties
in the output using the [generated asset workflow](../../generated-asset-workflow/SKILL.md).
Prompt review does not establish that generated pixels meet the contract.

Example bounded edit: “Keep the aircraft's shape, side view, altitude, cloud layer,
and lighting. Place the supplied airline emblem on the tail. Keep the passenger
windows unobstructed.” This example assumes those properties and emblem have been
inspected and supplied; it does not identify an aircraft from an unverified filename.
