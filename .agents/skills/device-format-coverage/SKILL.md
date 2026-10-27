---
name: device-format-coverage
description: Check a media change against the footage phones and cameras record (iPhone and Pixel HLG, Samsung HDR10/HDR10+ PQ, SDR H.264/HEVC, 601, full range, variable frame rate, rotation, stills) and record the result in the source-format coverage registry. Use after changing media import, probing, preparation, preview or export decoding, colour handling or export, and when adding a feature that touches source media. Windows runs belong to windows-compatibility; this skill records their outcome.
---

# Check device-format coverage

The outcome is an honest, evidenced entry for every format class and platform the change touches, in
[source-format-coverage.ts](../../../src/lib/media-analysis/source-format-coverage.ts). The rules (statuses,
evidence, Windows receipts) are in the [coverage standard](../../../docs/standards/source-format-coverage.md).
Never commit creator footage; fixtures are synthetic.

## Inputs

- The change under test and the stages it touches (`import-probe`, `preparation`, `preview-decode`,
  `color-grading`, `export`, or a new stage you add to the registry).
- FFmpeg 7+ with libx264, libx265 and zscale on PATH (`ffmpeg -hide_banner -filters | grep zscale`).
- Optional real-device clips for classes without a synthetic fixture (HDR10+, Dolby Vision iPhone, Display
  P3 and HEIC stills). Use local files the creator points to; report a class as unchecked when none exist.

## Run it

1. Generate fixtures: `pnpm fixtures:source-formats --out <scratch dir>`. Read `manifest.json`: a
   `skip` row means this machine's FFmpeg cannot make that class; report it rather than working around it.
2. Exercise each touched stage per fixture through the product path, on a disposable project:
   - import with `media_import` (managed copy), then `media_readiness` until ready or failed;
   - for preview and grading, place the clip in a disposable assembly and inspect frames with
     `pnpm frame-state <project-id>`;
   - for export, render the disposable fixture project only (renderer verification, never a creator's
     project without an explicit request).
   Record per class: ready or the exact failure, probed output tags (transfer, primaries, pixel format,
   range, rotation, cadence), and visible problems (wrong colours, squashed or unrotated frames, dropped
   or duplicated frames).
3. Turn what passed into evidence: add or extend a unit or verification test that runs the fixture class
   by its id (see `prepare-browse-preview.test.ts` for a fixture-driven preparation test). A manual pass
   is reported as observed, not recorded as `supported`.
4. Update the registry: status per class and platform, a one-line note for anything short of `supported`,
   and evidence paths. Prefer `visible-reject` or `fallback` to leaving a class `unsupported`.
5. Run `pnpm check:source-coverage`.

## Windows

Windows entries change only from a [windows-compatibility](../windows-compatibility/SKILL.md) run, recorded
as `windows_receipt`. Its editor check imports two generated SDR clips today; importing the fixture matrix
there is not built yet, so HDR and other classes stay `unverified` (or `unsupported` where code is known to
refuse, such as the macOS-only `avconvert` HDR path).

## Report

List each touched stage with its class-by-platform result, what changed in the registry, fixture classes
skipped on this machine, and what remains unverified. A class that regressed is reported first.
