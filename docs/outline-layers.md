# Editable cutout outline layers

A subject and its outline are separate timeline rows. The outline's `outline_parent_id`
references an original alpha video. It owns its lane, title, removal state, `outline_width`
(0–64, before the subject transform), and `outline_color` (hex RGB). The subject owns source
timing, speed steps, fades, transforms, crop and motion. The shared `resolveOutlineLayers`
projection is used by storage and the preview/export composition adapter. Timeline edits
to the outline's clock or geometry are rejected; edit the subject instead. Hide the outline
with its lane mute or remove it independently. Removing the subject suppresses its outline.

`prepare-outline-mask.ts <project> <cutout-id>` decodes the **original cutout's actual alpha**
with libvpx-vp9 into white transparent PNG frames. These are reusable mask data, not a
styled border. A content-addressed manifest stores the source SHA-256, frame dimensions,
count and presentation timestamps. The mask is selected using the same source clock as
the subject, including trim and speed segments. Width and color do not regenerate media.
Proposal creation verifies the source fingerprint and prepared manifest. A source replacement
requires a new prepared mask; an old mask is suppressed rather than rendered on a new subject.

The renderer dilates each mask's alpha, floods it with the selected color, and composites
it beneath the subject on the adjacent lane. Both Player and export use this same path.
Standard applies an SVG `feMorphology` filter to the PNG; Browser GPU (CanvasKit) loads
the same mask frame as an image actor and applies an outline-only Skia dilate and color
flood in composition pixels (`outline_width` × media scale), skipping the subject's keyer
as Standard does. Wrapper animation, opacity and grade apply to the outline in both.
Filtering a decoded PNG avoids the headless accelerated-video filtering failure that could
erase lower layers. Keeping the subject's original alpha video also avoids FFmpeg's native
VP9 decoder dropping its alpha plane. The exported border follows the original matte;
this treatment cannot repair missing hair or improve segmentation quality.

The bounded proposal contract is `create_visual` with `outline_parent_id`, `outline_width`,
and `outline_color`, followed by `set_lane_order` placing the new row immediately below its
subject. The server derives its geometry and clock; numeric layout guesses are unnecessary.
Appearance changes use the normal safe props path, history and Undo. No background image
generation or composite-video baking is involved.

Current scope: prepared local SAM cutouts. Splitting a subject does not yet create a second
outline for the new right-hand element; create a linked outline for that new element.
Mask frames add disk space and per-frame image loading; long clips should get a bounded
frame cache before expanding this beyond short cutouts. Browser seeks and encoded motion
must be checked when changing the decoder or mask-clock contract.
