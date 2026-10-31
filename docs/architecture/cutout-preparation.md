# Reusable cutout preparation

Cutout preparation is an optional media transformation, requested when an edit needs
subject separation. Ordinary intake still prepares playback media independently.
Person-location annotations can guide a prompt; segmentation and visual verification
remain separate responsibilities. No cutout tool places media or approves a proposal.

## Agent surface

| Tool | Result |
| --- | --- |
| `source_evidence` | Up to 12 source-time samples as a contact-sheet MCP image, with per-cell hashes and a local manifest. |
| `cutout_prepare` | Reusable local SAM2 job for a source interval up to 180 seconds, normalized positive/negative points and a subject-inclusion description. |
| `cutout_status` | Job state, immutable cutout receipt, separate preview-preparation state and explicit unperformed visual verification. |
| `cutout_correct` | New union/intersection derivative for an explicit half-open frame range and normalized rectangular ROI. |

To re-prompt, call `cutout_prepare` with a parent receipt ID and the same source window.
This recomputes the selected interval; union/intersection corrections reuse the stored
masks without running SAM. Parents remain unchanged. Untouched mask frames are copied
byte-for-byte; corrected frames preserve pixels outside the ROI. The encoded derivative
is rebuilt from the original RGB source, so those byte guarantees apply to masks, not
compressed WebM bytes. Correction inputs must share source hash, interval, cadence,
output dimensions and tracking geometry. Apply Scratchpad after correcting its raw mask.

## Ownership and reuse

`cutout-preparation.ts` owns queue admission, verified reuse, correction and receipts.
`scripts/prepare-cutouts.ts` runs a detached, single-worker queue per project, following
the existing media-preparation worker pattern. JSON jobs live in project instruments;
worker logs are local. Identical queued/running requests reuse one job. Failed attempts
require explicit `retry: true`. Dead worker jobs become failed when queried; queued jobs
resume on another prepare request. Subprocesses have a 30-minute timeout, except SAM 2
tracking, whose limit grows with the frame count (three seconds per frame plus ten minutes;
it runs at about one second per 1080p frame on Apple silicon).

SAM 2 loads a whole tracking session onto the device, and Apple MPS rejects tensors over
INT_MAX elements (about 1,700 frames at its 1024-pixel input, so a 58-second 30 fps window
failed). `hand_cutout.py` therefore tracks sequences longer than `--chunk-frames` (400) in
sessions: the one holding the prompt frame takes the clicks; each later or earlier session
overlaps its neighbour by one frame, is seeded with that frame's mask and keeps it. An empty
seam (subject out of frame) falls back to the original clicks. Shorter sequences keep the
single-session path. Seams can show a small mask change where tracking memory restarts.
There is no cancellation endpoint or service-manager restart guarantee yet.

Cache identity includes source bytes, normalized request, subject description, recipe,
SAM checkpoint/script hashes and installed runtime package versions. Corrections include
both parent manifests and the bounded operation. Reuse verifies source, output and every
mask hash; changed or missing artifacts cannot silently count as a hit. This still incurs
hashing time; it avoids segmentation and encoding. Update the recipe version whenever
tracking or encoding semantics change. Existing UI-generated legacy receipts lack this
manifest and are not automatically adopted into the verified cache. The older synchronous
UI endpoint remains compatible; the new agent tools use the queue.

Completed alpha media is decoded with libvpx and sent to the existing preview preparation
queue. `completed` means the derivative exists, **not** that its preview is ready or that
its edges are good. Wait for preview `ready`, inspect relevant frames and motion, then use
the proposal flow. Original and working timelines are untouched. Model installation is
explicit; the tools never download a model or call a remote segmentation service.

## Evidence boundary

`source_evidence` uses source hashes and requested sample times to reuse its image sheet.
Cells are in row-major order. Seek times are not certified frame-exact presentation times.
The MCP transport returns actual image content as well as metadata; this proves delivery,
not that the agent understood the pixels. It does not replace frame-state for proposal
or timeline composites, or playback for motion and sound. Existing frame-state reports
remain the manifest authority for building timeline contact sheets.

The [rotoscope skill](../../.agents/skills/rotoscope/SKILL.md) owns mask inspection;
[mask-glitch](../../.agents/skills/mask-glitch/SKILL.md) checks the settled composite early.
No new editor UI, preferences, human approvals, or video exports are introduced here.

The v7 encoder gives picture and mask frames the same integer frame clock before
alpha merging. Independent floating-point timestamp division at fractional phone
rates could advance the mask by one frame, producing background-shaped fringes on
moving hands despite correct tracking masks. The preparation cache version changes
with this fix; existing adopted assets remain unchanged. Re-encoding verified masks
through a correction creates a new source for a proposal. Synthetic SDR and HLG
clock regressions live in `custom-cutout-clock.test.ts`; Windows remains unverified.

## Verification and current limits

Synthetic tests cover bounded corrections, parent preservation, invalid clocks and ROIs,
running-job deduplication, cache invalidation and source-image delivery. A local SAM2
30 fps synthetic clip completed with a ready preview; repeated preparation reused its job.
A separate 3 fps fixture failed the existing preview duration validator. Such failures
remain visible in preview status and block adoption; low-frame-rate preview parity is
not fixed by this queue. These trials do not establish real-footage mask quality.

## Internal frame storage versus Library assets

Published grid-matte mask sequences live under `instruments/grid-mattes/`, outside
browsable `media/`. `internalGridMatteDirectory` moves the legacy directory without
rewriting frame bytes and leaves a relative directory symlink at `media/grid-mattes`
so existing timeline, proposal, history and renderer URLs keep working. Conflicting
internal and legacy directories fail rather than overwrite evidence. New publications
use the internal owner. The media scanner also excludes the legacy directory before
migration. Finished cutout videos remain usable assets; individual working masks do
not become Library cards. Source footage and mask receipts remain unchanged.
