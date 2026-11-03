# Floating Book / keyed still motion (draft)

Use `proposal_create` with a `keyed_still_motion@1` block to build an editable keyed
photograph floating over a continuous background. This uses native layers, masks,
chroma, colour and separate native cameras for the photograph and the scene. It does not spin filmed
book footage. Native CanvasKit rendering has been exercised on an instructor-supplied photograph and continuous room take; reference matching, editor interaction and real fresh-input certification remain pending; do not promote it
as a certified Templates card.

## Prepare inputs

- Inspect the live lesson Download menu when supplied sources are referenced; a captured page with a collapsed menu is not an attachment inventory. Import the actual untreated locked-camera take and separate photograph through
  `media_import`; verify readiness, source identity and hashes. A tutorial screen
  recording or finished demo is reference evidence, not either source layer.
- Photograph the book on green paper in matching light. The photographed object
  should be centred in the display-oriented image. If it is not, prepare a centred
  working canvas preserving source RGB; record its source mapping and hash. Camera
  rotation is around the photograph's canvas centre, not a detected object anchor.
- Inspect the photograph and measure its book bounds by inspecting the unchanged image in the
  required browser surface. This is manual measurement, not an automatic detector. Pick midtone paper green in display sRGB; embedded Display P3 JPEG values must be colour-managed before numeric sampling. Measure a rectangle just outside the book in the untransformed fitted canvas.
  Supply native `mask_inset` as [top,right,bottom,left], fractions of the full canvas.
  No auto key-color detector or protection matte is claimed.
- When hands cross the book, supply a source-matched prepared alpha foreground
  through the rotoscope workflow. Verify registration and source offsets. Without
  that matte, this recipe cannot put fingers in front of the book. The source lesson
  demo has no actor, so it cannot prove hand-contact behaviour.
- Measure the selected source window and trajectory using `source_evidence`
  for navigation and source-PTS frame inspection for exact timing, preserving source PTS. Supply project canvas dimensions and start/end
  centres in canvas percent, 0 left/top and 100 right/bottom. The block supports
  -20 to 120 for off-frame endpoints and aspect ratios between 9:16 and 16:9.

## Compile one review card

The portable shape below uses replaceable media IDs. Supply all existing lane keys
in top-first order, with foreground (if used) above camera above photograph above
background. `remove_element_ids` only names clips intentionally replaced in the
proposal; never mutate the user's timeline directly.

```json
{
  "block_id": "floating-photo",
  "kind": "keyed_still_motion",
  "version": 1,
  "inputs": {
    "background": {
      "source_url": "/api/projects/PROJECT/media/room.mp4",
      "source_duration_seconds": 10,
      "source_start_seconds": 1
    },
    "photograph": {
      "source_url": "/api/projects/PROJECT/media/book.png",
      "key_color": "#40a644",
      "mask_inset": [0.1, 0.15, 0.1, 0.15]
    },
    "canvas": { "width": 1080, "height": 1920 },
    "duration_seconds": 6.7,
    "from": { "x": 35, "y": 80 },
    "to": { "x": 65, "y": -15 },
    "lane_order_keys": ["visual_2", "visual_1", "visual_0"]
  },
  "settings": { "travel": 100, "turn": 12, "size": 30, "growth": 40 }
}
```

The four main dials are Movement (0–100%), Turn (-180–180°), Book size (20–100%) and
Size change (0–200%). Movement/Turn/Size change default to 0 and have off positions.
Set requested motion explicitly. Advanced adjustments expose start/end horizontal
and vertical centres (-20–120%), Green removal/Key softness/Green spill (0–100%),
Mask softness (0–5% of canvas height), Book tint/warmth (-100–100%), Book brightness
(-2–2 stops), and even versus gentle motion. Advanced also includes Starting angle (±180°), Background size (100–200%), horizontal/vertical framing (±25% canvas), Scene zoom (0–50%, off/default0) and Scene brightness (±1 stop). The scene exposure is added to the book-only exposure, retaining the native ±3-stop combined range. Green removal defaults to 18%, softness
8%, spill 25%, mask softness 0.2%; colour is neutral. Empty overrides retain authored
values; reset uses the authored block settings. All controls recompile the same
operations used for preview and approval. Source, key colour, garbage-mask rectangle,
canvas and selected duration are measured block inputs: revise them in the proposal
when replacement assets need a different setup.

The compiler snaps timing to the project frame grid. Source starts are also snapped
by native visual creation; record the resulting source mapping. Background audio
stays on, photograph/foreground are muted. The scene push-in and scene exposure default to off/neutral and must be explicitly requested; no sound or shadow is invented. Background footage remains one continuous clip; an explicitly supplied still plate uses a native silent hold.

Native masks remain fixed in viewport space before a camera. Keep the photograph and its garbage rectangle centred/static, then transform both with one outer camera. Never move and clamp a viewport mask before rotating it: that can clip the growing object early near the canvas edge. The compiler uses inverse focus compensation for the requested position and independent turn/scale, and composes the scene zoom into the book camera. The background follows a separate scene camera; the compiler reserves a free camera lane and retains existing lane order. Camera operations precede followers.

Keep the intermediate photograph as large as the native zoom/focus ranges permit. A tiny image graded before a large camera zoom loses cover detail despite retaining the original source. The compiler derives the largest safe base scale from the whole path and native focus bounds, while retaining zoom headroom; do not hard-code a tiny intermediate scale. Verify actual cover lettering and texture in the encoded result.

Book softness (0–100%, off/default0) wraps the existing native photograph blur.
It maps to 0–5 pixels at 1080 canvas width and compensates the outer camera zoom
with the same sampled key times, keeping apparent photographic softness steady
through growth and scene push-in. It is not velocity-based motion blur. Book
contrast and Book saturation are separate Advanced controls (0–200%, neutral100).
Their native colour grade affects only the photograph. Existing drafts with these
settings omitted keep softness off and neutral contrast/saturation. Do not use
softening to hide a clipped silhouette, failed key or lost lettering: compare the
outline and cover material together through the full motion, especially enlargement
and top-boundary crossing. Per-photo blur of two pixels was too soft in the supplied
case; settings are measured on the selected source/reference, not universal defaults.

Rotation uses the existing camera primitive, with inverse position compensation so turning the book does not bend the intended path. Up to 120 native keys retain exact
sampled frame states; longer clips interpolate between evenly spaced output-frame
samples. Between-sample positions are approximations. This is a two-endpoint 2D path,
not perspective rotation, arbitrary flight splines or moving-camera tracking.

## Review and fresh rebuild

Stage the block with `proposal_create` in an isolated input-only project, read its
warnings/dial sweep and check the combined preview. Use the required browser surface
and `pnpm frame-state` before appearance claims. Follow template-authoring’s complete tutorial operation ledger and measured-match budget before choosing settings. Reconcile the final demonstrated revisions, including independently keyed object growth, background framing, local/scene colour and scene camera movement. Inspect all short-motion frames, matched normal-speed playback, size/rotation extrema and the highest point; first/middle/last samples alone are insufficient. Review mask boundaries and contact frames. Check the key against light
and dark backgrounds: stop raising tolerance before reflective blue/green book areas
become holes. Spill/tint/brightness do not restore lost alpha. A bad key needs a better
photograph or an explicitly prepared source-preserving protection matte; this block
has no alpha-restoration control. Check book scale, path, edge halos, initial contact,
shadow continuity and hand layer order. Changing a prepared foreground requires
re-preparation; timing and colour tuning do not.

A different URL in a unit fixture is only contract coverage. For fresh-input
certification, a fresh agent must start with this procedure, a new untreated take and
new photograph, create one proposal, sweep dials and inspect actual playback. Do not
provide the first proposal's solution coordinates as fresh inputs. Missing raw
photograph/background or browser access leaves that certification pending.
