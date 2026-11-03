# .matting — local SAM 2 tracking and cutout environment

Tracks an object (such as a hand) through a clip and emits source-mapped per-frame masks.
The masks are the default editor tracking evidence and may drive crop/contact geometry without
ever becoming a visible layer. Encode a cutout only when the layer contract requests one. Install the
environment with `pnpm setup:matting` (into `.matting`) or the
`cutout_setup` MCP tool (an installed DreamCut: its app data, `TIMELINE_MATTING_DIR`). It installs the
pinned packages in [`environment.mjs`](environment.mjs) (PyTorch, SAM 2, NumPy, Pillow, SciPy and
OpenCV, which surface tracking also uses) and the checksum-verified `sam2.1_hiera_small.pt`, about 1 GB
in all, and records them in `environment.json`. Rerunning it after the package list changes adds only
what is missing.

Usage (frames extracted with `ffmpeg -i clip.mp4 -q:v 2 frames/%05d.jpg`):

```sh
PYTORCH_ENABLE_MPS_FALLBACK=1 ./venv/bin/python hand_cutout.py \
  --frames <dir> --out <mask dir> \
  --prompt-frame 40 --points "950,1020;920,830" --negatives "508,1060"
```

By default, mask post-processing fills only small enclosed background holes up
to `0.001` of the tracking-frame area. This prevents hair and clothing pinholes
from becoming interior outline fragments while preserving large or edge-connected
openings. Override with `--max-hole-area-ratio`; use `0` to disable it.

For a connected object where only one part should remain in front (for example,
the hand but not the forearm), add a tight prompt box ending at the intended
occlusion boundary: `--box "700,780,1079,1320"`.

Pick prompt coordinates by rendering one frame with a grid
(`drawgrid=w=54:h=96` at half res) and reading the hand's position off it.
For tracking-only work, validate the masks and derive the required source-pixel edge, centroid,
or contact line directly from them. When the effect explicitly requires an overlay, composite
the masks to a VP9 alpha WebM:

```sh
ffmpeg -framerate 30 -i frames/%05d.jpg -framerate 30 -i masks/%05d.png \
  -filter_complex "[1:v]format=gray,boxblur=1[m];[0:v][m]alphamerge,format=yuva420p" \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 26 -row-mt 1 -an cutout.webm
```

When a bright source background leaves a pale fringe against a dark composite,
tighten the mask before the one-pixel feather. Each `erosion` contracts the
matte by roughly one pixel; use the smallest count that removes the fringe:

```sh
-filter_complex "[1:v]format=gray,erosion,erosion,boxblur=1[m];[0:v][m]alphamerge,format=yuva420p"
```

Verify alpha with the libvpx decoder (`ffmpeg -c:v libvpx-vp9 -i cutout.webm …`);
ffmpeg's native vp9 decoder silently drops the alpha plane. In the timeline,
the media-analysis pass records WebM's `alpha_mode=1` stream tag and placement
automatically sets `props.has_alpha: true`, so the render path uses Remotion's
transparent frame extraction (preview plays alpha webm natively). If analysis
has not run yet, set that prop manually.
