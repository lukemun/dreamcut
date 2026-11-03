# Paper cutout

Template `FX-PAPER-CUTOUT` (Properties → Templates). A person or object is cut out of
moving footage along its tracked mask and sits over the original shot with a thick
paper outline, like a scrapbook sticker. The outline is white by default; its width,
colour, the cutout's size and its position stay tunable on the proposal card.

## Inputs

| Role | Required | Notes |
| --- | --- | --- |
| Shot with the subject | Yes | A clip already on the working timeline. The subject should be clearly separable from the background. |
| Where and who | Yes | A review mark (for example M2), a time or a clip, and which subject when more than one is visible. |
| Outline colour | Optional | Default white `#ffffff`. |

The agent prepares the moving cutout. The creator never supplies a mask.

## Build

1. Read the timeline and the mark or time the creator names. Find the clip under it: its
   start `T`, end `E`, in-point and source file. Default to the whole visible clip
   from the mark to the end of the clip, or the span the creator names.
2. Look at the source frame at the mark (`source_evidence`) and pick points on the
   subject: head, torso, raised hands and anything carried. Add negative points on
   nearby background.
3. `cutout_prepare` the same source over the matching source window, prompted at the
   mark's source second. Poll `cutout_status`; check frames at the start, middle and
   end for missing hands, head or feet, and re-prompt with `parent_cutout_id` if needed.
4. Propose one `create_visual` video clip of the cutout on its own lane above the shot,
   aligned to the same source moment so it sits exactly on the subject:
   - `has_alpha: true`, `sticker_outline: true`;
   - `sticker_outline_width` (default `14`, range 0–32) and
     `sticker_outline_color` (default `#ffffff`);
   - `media_scale` `1` and `media_offset_x` / `media_offset_y` `0`, set explicitly so
     the card offers Size, Horizontal and Vertical;
   - `set_lane_order` with the cutout lane above the shot.
5. Review controls: Paper outline, Size, Horizontal and Vertical as main dials;
   Outline color stays in Advanced adjustments.
6. Replay the card. Check the outline on every edge, at the start, middle and end of
   the span, and that the cutout does not slide off the subject.

## Variations

- A pop: key `sticker_outline_width` with hold keys so the outline appears on a beat.
- A sticker that lifts off: raise `media_scale` to 1.1–1.25 so the cutout grows
  out of the shot, with the original subject still visible behind it.
- Several colours: recolour with Outline color; one cutout per colour change.

## Limits

- The outline follows the cutout: a missed hand or hat brim has no outline.
- Fine hair and motion blur give a slightly soft outline edge.
- The outline width is in canvas pixels and does not grow with Size.

## Evidence

Demo project `tpl-paper-cutout-bobblehead-demo` (16:9, 24 fps), proposal
`20261027T080414-05091666`: the bobblehead running and cartwheeling (8 s), SAM 2 cutout
69c81b09 prompted at 6.0 s; a white cut-out from 1.0 s and a red one from 3.6 s, each on
its own lane. Teaching media in `public/recipe-previews/paper-cutout/`.

The earlier Pexels demo is `tpl-paper-cutout-demo`: hiker in a bucket hat in a canyon
(Pexels 8970054, Pexels License), SAM 2 cutout of source 0–6 s.
