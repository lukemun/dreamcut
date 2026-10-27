# Screen replacement — evolution

## Purpose

Put pictures, videos and cut-out people onto a real screen in footage with true perspective,
the screen's own frame showing and the original content hidden, through a reviewable
proposal the creator can tune. Owns screen tracking choices, picture regions and the LED
look; leaves text on surfaces to surface-text-tracking and untracked overlays to
video-compositing. Success is a card whose pictures stay on the screen through the reviewed
motion, including camera moves.

## 2026-10-25 — initial procedure

- **Observation:** Placing three cut-out dancers on a Times Square billboard with flat
  positioned stills looked pasted on: no perspective, the screen's edge hidden, and black
  backgrounds covering neighbouring copies. The automatic tracker followed the changing ads
  and lost the screen after about 7 s.
- **Decision:** Pictures (`video_clip`, `still`) can now attach to a surface track with a
  `surface_region`. The procedure inset the panel to keep the bezel, uses cutouts, and
  corrects drifting tracks from measured corners.
- **Verification:** Surface-placement unit tests (6) cover corners, regions, camera follow
  and visibility. The card was previewed in the editor at 6.5, 8.2 and 10 s with the camera
  zoomed in: the screen frame stayed visible and the three copies sat on the screen in
  perspective. Continuous playback and export parity were not separately checked.
