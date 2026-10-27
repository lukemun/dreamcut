---
name: screen-replacement
description: Put a picture, video or cut-out person onto a real screen in footage (billboard, TV, phone, monitor) so it sits on the screen in perspective with the screen's own edge showing. Use for screen replacement or "put me on the billboard"; use surface-text-tracking for editable text on a surface and video-compositing for flat, untracked overlays.
---

# Put pictures on a real screen

Deliver pictures that read as shown *on* a physical screen in the footage: same
perspective, same motion, the screen's frame or bezel still visible around them, and the
original screen content gone. Read [dreamcut-proposals](../dreamcut-proposals/SKILL.md)
before timeline work. Tracking detail (corner order, source clock, visibility, gaps) is
owned by [surface-text-tracking](../surface-text-tracking/SKILL.md); this skill reuses it.

## Track the screen

Find the footage clip and the source interval where the screen is used. Inspect a clear
source frame and measure the four corners of the *lit screen area* (top-left, top-right,
bottom-right, bottom-left, normalized to the source), not the outer cabinet. Run
`surface_track_prepare` then `surface_track_status`.

Changing screen content (ads, video walls) can pull an automatic tracker onto the content
instead of the screen. Overlay the returned quad on frames across the whole interval. When
corners slide, warp or the track is lost while the screen is still in view, build a
corrected track from measured corners: dense samples (every 0.1 s; gaps over 0.15 s are
not interpolated) with the measured drift, keeping the original track's source identity,
and give it a distinct `id`. Report the correction and its residual error as an assumption.

## Prepare the pictures

- **People or objects** go on as cutouts with alpha: `cutout_prepare` on the clip (and a
  still of its first frame when a pose holds before motion). Composite a frame over a
  bright colour to check edges; never leave a generated black background covering the
  screen or other copies.
- **Screen surface:** to hide the original content, place a panel picture (a dark LED-like
  gradient still, or any supplied picture) covering the screen first. Use an existing
  project still when one fits.

## Attach through a proposal

Each picture is a `video_clip` or `still` created with `create_visual` carrying the
prepared `surface_track` and a `surface_region` `[left, top, right, bottom]` in fractions
of the tracked screen:

- The panel uses a small inset (about 0.02–0.03 on each side) so the screen's own frame
  stays visible. That inset is what makes it read as a real screen.
- Several pictures share one screen with side-by-side regions. Keep each region's shape at
  the picture's aspect after the screen's aspect, so people are not squashed; regions may
  extend beyond 0–1 (range -1..2) when transparent margins of a cutout overlap the edge.
- Give the pictures a light glow (`film_bloom`) for an emissive LED feel when the creator
  wants it.

Attached pictures follow the footage's source clock and whatever camera the footage
follows (`camera_id` on the footage, not on the attached picture), and hide when the
screen is out of view. Attached pictures refuse `camera_id`, spiral, transitions and
subject windows. Changes to the footage's timing or camera carry the pictures along; keep
picture, panel and footage changes in one card when they depend on one another.

The creator tunes each picture under **On a screen** in its inspector: the track
attachment and the Left/Right/Top/Bottom inset dials.

## Verify

Run `pnpm frame-state <project-id>` (in the editor: `run_instrument` frame-state, then `timeline_evidence`) and read it. Inspect frames at the first visible frame,
during any camera move, at the closest framing and at the end. Check that the screen frame
shows evenly, nothing of the original screen content leaks, cutout edges are clean, and
pictures do not slide against the screen. Then play through the camera move: a still
cannot prove the pictures stay attached in motion. Report tracking correction, sampled
inspection and playback separately; corner drift on content-changing screens is a common
residual.
