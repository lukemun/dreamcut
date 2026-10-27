# device-format-coverage — evolution log

## Purpose
Keep DreamCut's media features working on the footage creators actually bring (iPhone and Android HDR,
SDR phone video, older cameras, phone stills) on macOS and Windows, and make any gap visible. Scope: checking
a media change against synthetic fixtures and real-device files, and recording the result in the coverage
registry. It does not run Windows itself (windows-compatibility does) or decide colour science. Good looks
like: every touched stage has an evidenced status per class and platform, regressions are reported first,
and nothing is claimed `supported` from a manual look alone.

## 2026-10-23 — created

- **Observation:** iPhone HDR (HEVC Main10 HLG) is the most common phone source; HDR preparation calls
  macOS-only `/usr/bin/avconvert`, so the same footage fails on Windows, and no record said so. Android HDR
  (Pixel HLG, Samsung PQ/HDR10+) had never been checked.
- **Decision:** Add a coverage standard, a registry with a ratchet test, a synthetic fixture generator, and
  this procedure, modelled on windows-compatibility. Record today's state honestly: SDR H.264 on macOS is the
  only fully evidenced class; HDR is a macOS-only fallback.
- **Verification:** `pnpm check:source-coverage` passes; `pnpm fixtures:source-formats` produced and
  classified SDR H.264/HEVC, 601, full range, HLG, PQ, VFR, rotation and sRGB still fixtures with FFmpeg 7.1
  on macOS. HDR10+ has no synthetic fixture (x265 needs dynamic-metadata input). The run-it procedure itself
  has not yet been exercised end to end.
