# dreamcut-rendering — evolution log

## Purpose
Repository-owned guidance for the Remotion preview/render integration: frame-derived animation only (useCurrentFrame and interpolate), with timeline.json as the timing authority. Scope: the integration contract only — broader Remotion API guidance lives in the publisher's own skill, installed separately and never redistributed here. Good looks like: preview and export share one derivation; no CSS transitions or wall-clock timers; animation state is a pure function of the current frame.

## 2026-09-28 — Owned renderer migration

The creator requested removal of Remotion and an enforced contract for future effects.
Updated integration guidance to the owned frame session/browser/FFmpeg implementation;
retained the skill identifier for existing routing links. The executable renderer
contract passed 25 controls, preview/export parity, resets, 3D repeated seeks and
75 encoded frames. Evidence: `testing/results/renderer-contract/latest.json`.
Full migration readiness additionally depends on the project comparisons and review
receipt; this skill update alone does not establish release readiness.

## 2026-10-25 — Renamed from open-edit-remotion

- **Observation:** The name carried both the product's old name (OpenEdit) and Remotion, which DreamCut no longer uses for preview or export; the description had to say the name was kept only for existing links.
- **Decision:** Updated. Renamed to `dreamcut-rendering` at the creator's request; earlier entries in this log were written under the old name. The frontmatter keeps `aliases: [open-edit-remotion]` so older prompts and links still resolve, and the description no longer apologises for the name. The `src/lib/remotion/` folder name is unchanged.
- **Verification:** A catalog test gets and searches the skill by its former name; skill-discovery tests and the agent-parity check pass.

## 2026-10-27 — HDR export profile (a long creator export, then a failed one)

- **Observation:** An HDR GPU export of an 8 min 13 s, 30 fps, 16:9 tutorial (14,786 frames, 247 chunks of 60 frames)
  ran 15 min 40 s and reached 65% before failing with `page.evaluate: Target page, context or browser has been closed`.
  Six minutes earlier the same cut exported in SDR at 1440p in 2 min 37 s. Measured from the chunk cache's commit times
  (`preprocess/export-chunks`): SDR drew 242 chunks in 2.1 min (~115 frames/s over 3 pages); HDR drew a steady
  11 chunks/min (~11 frames/s, ~270 ms per frame per page), so ~24 min projected for the picture alone. The audio pass
  reused all 247 saved sound chunks, and the render started drawing 8 s after the job was created: no wait on
  full-quality source preparation, encoding or audio. The resolution of the HDR run was not recorded anywhere
  (the job record and server log hold no settings or stage timings). 2160p is ruled out: conversion alone exceeds the
  measured per-frame time there.
- **Cause of the failure:** the stable editor (`scripts/editor-launch.ts`) switched to a new build at 23:09 and
  `retire()` sends SIGTERM to the old server once its HTTP requests are quiet for 5 s (10 min at most). An export runs
  inside that server but is not an in-flight request, so it was killed about 90 s after the switch. Any export longer
  than the gap between rebuilds dies the same way while other sessions edit `src/`.
- **Where HDR time goes (per frame, 1440p):** the in-page JS `compositeToI420P10` conversion measured ~195–210 ms
  (synthetic frame, Node/V8); a synchronous 16 bytes/pixel RGBA_F32 `readPixels` (~59 MB per frame) is the likely
  remainder (inferred, ~40 ms); VP9 profile 2 encode measured ~11 ms per frame in headless Chrome (synthetic, async,
  overlapped); drawing ~26 ms (from the SDR run). SDR avoids all of this by handing the canvas to the hardware H.264
  encoder.
- **Decision:** Fixed the conversion: `compositeToI420P10` inlines the transfer lookups with no per-pixel arrays.
  1440p 210 → ~130 ms, 1080p 118 → ~75 ms, 2160p 428 → ~300 ms, identical output on 5.5 M random samples; a parity
  test against `extendedToHlg` guards it. Expected: HDR export ~1.4× faster (~270 → ~190 ms per frame), not measured
  end to end. Since built: running exports survive editor rebuilds. Proposed, not built: record resolution, dynamic range
  and the renderer's `timings` on the job; move the HLG/BT.2020/YCbCr conversion into a GPU pass that reads back
  10-bit planes (removes the JS loop and most of the readback; HDR could approach SDR speed); failing that, run the
  conversion in a worker so it overlaps drawing.
- **Verification:** `src/lib/color/hdr-encode.test.ts` (5 pass), `pnpm typecheck`. The creator's project was not
  exported again.
