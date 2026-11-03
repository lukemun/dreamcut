# Object cutouts and scene transitions

Use this procedure to isolate visible objects from a still while retaining the
original photograph's appearance. Moving people belong to
[talking-head-cutout](../../talking-head-cutout/SKILL.md); moving objects additionally
need temporal mask tracking and verification. A still mask does not prove that path.

## Inputs and outputs

Required: unchanged source image, selected object inventory, one mask per object
(or a labeled instance mask), and intended canvas/fit. Inspect the image in display
orientation. Record each object's visible bounds, overlap, and edge clipping.
Missing masks trigger the method choice below; missing source pixels remain missing.

For an object-led scene transition, also require the outgoing scene, incoming scene
containing those objects, and a measured reference timing map or explicit timing
direction. A flattened example supplies evidence, not editable source objects.

Outputs: separate RGBA cutouts, optional white silhouette layers, fitted destination
image, source-to-canvas mapping, source/mask/output hashes, preparation receipt, and
editable timeline recipe. Keep original files unchanged.

## Choose a mask method

| Option | Use and limits |
| --- | --- |
| Supplied transparent assets or masks | Reuse verified alpha when available. Establish registration to the destination; an isolated PNG alone may have lost its original position. |
| Manual selection or tracing | A compatible image editor can export a grayscale mask for each object. This requires no generative model. Retain the editable selection/path and document the tool used; DreamCut does not gain a mask-painting UI from this procedure. |
| Segmentation model | A compatible point/box-guided segmentation tool predicts masks without generating replacement subject imagery. Check installation and still/multiple-instance support first. DreamCut's existing local SAM 2 path is video-oriented; it is not a verified multi-object still entry point. |
| Generated segmentation mask | Optional fallback when an available image-editing tool can preserve the reference geometry. Ask for masks only, then extract original RGB. Generated masks can distort boundaries, omit details, or invent hidden anatomy; require visual review. |

Respect user method preferences and the active tool instructions. Do not silently
switch a local workflow to an external service. The existing SAM 2 implementation
is [custom-cutout.ts](../../../../src/lib/media-analysis/custom-cutout.ts), launched
through [run-sam2-cutout.mjs](../../../../scripts/run-sam2-cutout.mjs); the runner
reports missing local dependencies explicitly. Its existence is code evidence, not
proof that a particular photo or this multi-object workflow has been tested with it.

For generated masks, describe the inspected object inventory, exact framing and
positions, and visible-only silhouettes. Specify black background and white subject
for a single mask, or a distinct flat color per instance. Exclude supports, labels,
shadows, and other objects unless intentionally selected. Preserve original edge
cutoffs and occlusion. Do not ask the model to redraw the source image.

## Prepare and check the cutouts

1. Normalize source display orientation into a separate working image. Record its
   dimensions and every resampling step. Bring the mask into that same coordinate
   system; matching dimensions alone does not establish matching silhouettes.
2. Decode instance labels to independent grayscale masks with an explicit palette
   and recorded threshold/classification method. Inspect ambiguous colors, interior
   shading, touching instances, and disconnected parts rather than trusting labels.
3. Correct demonstrated defects. Fill only bounded, confirmed accidental holes;
   preserve legitimate openings and edge-connected background. Remove stray islands
   only after checking that they are not real separated subject parts. Do not blindly
   retain only the largest component. Erode only for an observed outer fringe;
   automatic erosion can remove feathers, feet, hair, and other essential detail.
4. Use source RGB plus mask alpha. Do not use generated RGB as the extracted object.
   With FFmpeg installed and matching oriented dimensions, the basic operation is:

   ```sh
   ffmpeg -i source-oriented.png -i object-mask.png \
     -filter_complex '[1:v]format=gray[mask];[0:v][mask]alphamerge' \
     -frames:v 1 object-rgba.png
   ```

   Use a fresh output path for revisions. This is pixel preparation only.
5. Apply the identical fit/crop/padding transform to the incoming scene and every
   cutout. Full-canvas transparent assets preserve source registration; alternatively
   retain tight alpha bounds plus an explicit deterministic placement mapping.
   When all objects are requested, avoid a crop that silently removes selected ones.
6. Derive optional white flashes from the accepted alpha, replacing RGB with white
   while retaining alpha. Verify the flash itself: it exposes holes and stray pixels.
7. Inspect each cutout on light and dark backgrounds, against the source, and in the
   combined composition. Check object count, missing anatomy, halos, internal holes,
   overlapping objects, and exact settled alignment with the destination image.
   Record uncertainty and rejected masks; successful encoding is not acceptance.

## Compose the complete sequence

Use existing native still layers and supported motion controls where sufficient:
outgoing scene → staggered independent objects → incoming scene at the measured
handoff → individual white blips → settled incoming scene. Preserve separate actors.
At the handoff, remove the cutout copies or otherwise avoid doubling their edges.

Carry entrance duration, stagger, settle, switch, flash on/off, and final hold from
the reference timing map. Keep the default at 1× reference speed. For more objects,
record how entrances overlap to retain total duration, or explicitly state that the
sequence length grows. A shorter duration alone does not prove matching motion:
check distance, easing, opacity and scale as well as normal-speed playback.

Required recipe parameters: object selection/order, mask method, canvas fit, native
entrance treatment, timing map, overall speed, flash timing and final hold. Asset
or mask changes require preparation; supported timing and motion remain editable.
If native presets cannot meet the target, record the capability gap before claiming
an exact recreation. Do not bake the whole scene to avoid native editing.

Import prepared assets through `media-intake`, with readable names, descriptions,
and source-linked annotations. Record source/mask hashes, tool/model or manual method,
prompt or selection settings, palette mapping, cleanup, geometry, output paths,
inspection evidence and remaining defects in `analysis/media-intake/` and the recipe.
Apply the normal proposal/assembly contract; preparation never approves an edit.

Verify combined entrances, the frame before/at the switch, every flash, and final
settle with the appropriate preview/frame-state instrument. Review moving timing
separately. A second input set is required before claiming a validated reusable
capability. This procedure documents a method; it does not install a segmentation
model, add a new editor control, or prove the untested mask alternatives.
