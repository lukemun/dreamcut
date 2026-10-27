# Prepare, reuse and correct moving subject cutouts — evolution

Capability: `cutout-preparation`. Registry: [registry.json](../registry.json).

## Purpose and boundary

Prepare, reuse and correct moving subject cutouts. Immutable derivatives/jobs; no timeline writes.

## 2026-09-30 — initial capability registration

- **Observation:** Repository script/catalog audit found this capability family. This
  is code/discovery evidence, not measured editing frequency or a new runtime trial.
- **Decision:** Register existing implementation; audit remaining authoring-contract gaps incrementally.
- **Version:** Initial registry record; existing tool/recipe versions are unchanged.
- **Verification:** Catalog membership and owner/evolution paths checked by `check:tools`.
  Runtime behavior was not re-certified by this inventory.
- **Acceptance for next change:** Preserve existing authority tests; migrate recovery and accounting contracts with representative success/failure cases.
- **Evidence:** [Script audit and priorities](../script-audit.md). Private session
  traces remain outside this public log.

## 2026-10-03 — Source-clock grid matte binding

Cutout status now publishes hash-verified grayscale masks as a reusable media binding.
The original remains the picture authority; cell geometry and grid lines remain native
controls. Preparation neither places footage nor approves edits. The binding rejects
missing/changed masks and records source start, cadence and coverage. The runtime
rejects source times outside those handles. Pixel, UI and clock coverage is recorded
in the local grid-matte implementation receipt; catalog status is not implied.

2026-10-10 — "Cutout queue busy; retry shortly" now reaches agents as code BUSY with
`retryable:true` (audit F10). Classification happens in the MCP wrapper from message text;
the route still returns a plain 400, so a route-owned typed error remains the durable fix.

### 2026-10-13: long windows track in chunks; limit 180 seconds

Blurring the background of a 116-second talking-head take failed: two 58-second
`cutout_prepare` windows died inside SAM 2 with `MPSGraph does not support tensor dims
larger than INT_MAX`, although the route accepted 75 seconds. SAM 2 puts every frame of a
session on the device; about 1,700 frames at its 1024-pixel input overflow MPS. A 20-second
window (600 frames) tracked cleanly in about nine and a half minutes, so the agent had to
hand-split the take into seven windows, and a full 75-second window would also have hit the
flat 30-minute subprocess timeout.

`hand_cutout.py` now tracks sequences over `--chunk-frames` (400) in seeded sessions that
share one frame at each seam; shorter sequences keep the single-session path. The SAM 2
subprocess limit scales with frame count, the route allows 180 seconds, and the recipe is
`sam2-custom-cutout/v4`. The chunk layout is unit-tested (`scripts/matting/test_chunk_plan.py`);
the interval and timeout rules are tested in `custom-cutout.test.ts`.
Real-footage check: the 600-frame window above, re-tracked with `--chunk-frames 200` (five
sessions), matched the single-session masks at mean IoU 0.998 (minimum 0.9955, frame 436) with
no drop at the seams (0.996–0.9999), and ran in 5.3 minutes against about 9.5 single-session.

## 2026-10-14: rotated phone cutouts were rotated twice

A two-input encode graph copied the phone source's display matrix (−90°) onto the already
upright cutout, so preparation turned the cutout sideways and it played as a small rotated
duplicate of the subject over the footage (cat datamosh demo). The encoder now deletes the
frame display matrix (`sidedata=mode=delete:type=DISPLAYMATRIX`); the recipe is
`sam2-custom-cutout/v5` and the job key moved to `cutout-preparation/v2` so affected cutouts
are re-made instead of reused. Tested in `custom-cutout.test.ts`.

## 2026-10-21: cutouts encoded lossless used 25 times their source

Local projects held 42 GB of cutouts against 15 GB of original footage. The encoder used lossless
VP9: a 6.6 s 2160×3840 cutout was 482 MB (about 615 Mb/s) beside a 25 Mb/s HEVC source. Two
`-upright` files in one project were a hand repair from before the 2026-10-14 display-matrix fix,
not output of any current code path; nothing needs to remove them from the encoder.

The full-resolution cutout authority now uses VP9 CRF 18 (`-b:v 0 -deadline good -cpu-used 4`,
`CUTOUT_AUTHORITY_VP9_ARGS`), shared by `custom-cutout.ts`, corrections and the scratchpad outline;
the recipe is `sam2-custom-cutout/v6`. Measured on a 3 s, 90-frame excerpt of that cutout against its
lossless encode (every third frame compared):

| Setting | Size (3 s) | Mb/s | RGB PSNR, premultiplied | Edge alpha mean / max error | Halo / hole pixels |
| --- | --- | --- | --- | --- | --- |
| lossless | 225 MB | ~600 | reference | reference | reference |
| CRF 16 | 13.1 MB | 35 | 42.1 dB | 0.65 / 26 | 0 / 0 |
| CRF 18 | 11.5 MB | 31 | 41.7 dB | 0.70 / 17 | 0 / 0 |
| CRF 22 | 8.9 MB | 24 | 41.1 dB | 0.79 / 19 | 0 / 0 |
| CRF 28 | 5.7 MB | 15 | 39.7 dB | 1.04 / 40 | 0 / 0 |

Edge alpha is measured over partially transparent pixels and anything within 2 px of an alpha
transition. A 1.7× crop of the cat's whiskers and fur over a flat colour showed no visible difference
from lossless. Fully transparent borders stay exactly 0, which the scratchpad perimeter check requires.
The SAM 2 masks remain lossless PNG evidence, so corrections and re-encodes start from source and
masks, not from this lossy file. The outline treatment's mask extraction does read the encoded alpha.
Cached jobs under `cutout-preparation/v2` still reuse their existing lossless outputs. Not measured:
playback decode cost in the editor, or a talking-head subject with fine hair.

2026-10-16 — New `cutout_setup` (contract version 1). A fresh install had no subject-tracing
environment (it was a manual step in scripts/matting/README.md), so every cutout template failed
with a missing-file error. `scripts/setup-matting.mjs` (`pnpm setup:matting`, `dreamcut
setup-matting`) installs a pinned Python environment and the checksum-verified SAM 2.1
checkpoint; an installed runtime keeps it in app data (TIMELINE_MATTING_DIR) so updates keep
it. `cutout_setup` reports status and starts the install in the background after the creator
agrees; `cutout_prepare` without it fails with MATTING_NOT_INSTALLED pointing there. Verified in
a clean-environment Claude Code run on the 0.2.1 build: the agent asked before the download,
installed it and proposed Moving Grid Matte, which previews in the editor.

2026-10-16 — The subject-tracing environment includes OpenCV (`opencv-python-headless==5.0.0.93`),
because surface tracking now runs on the same Python and an npx install otherwise stopped with
"requires OpenCV (cv2)". The package list moved to `scripts/matting/environment.mjs`; setup writes an
`environment.json` marker, `cutout_setup` reports `needs_update` when an environment predates the
current list (and `failed`, with the log tail, when the last run failed), and rerunning setup adds
only the missing packages. Verified: a fresh install and an in-place update both import cv2.
