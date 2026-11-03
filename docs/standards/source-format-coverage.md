# Source-format and platform coverage

Creators bring footage from iPhones, Android phones and cameras, and run DreamCut on macOS
and Windows. A media feature is only as useful as the footage and machines it handles. This
standard makes that coverage explicit, so a new feature widens support instead of quietly
working only on the developer's own clips and laptop.

## Scope

Every change to media import, probing, preparation (proxies, render authorities, alpha
authorities, thumbnails), decoding for preview or export, colour handling or export
declares its coverage. That applies to new features and to changes in existing ones.

## Format classes

The classes are what phones and common cameras actually record. The registry
([source-format-coverage.ts](../../src/lib/media-analysis/source-format-coverage.ts))
is the authoritative list; this table is a summary.

| Class | Typical source |
| --- | --- |
| SDR H.264 Rec.709 | Most Android phones, screen recordings, older iPhones, web downloads |
| SDR HEVC Rec.709 | iPhone "Most Compatible" off, many Android phones with HDR off |
| SDR 601 / SD | Older cameras and DV transfers |
| Full-range SDR | Some Android and action cameras (`yuvj420p` or `color_range=pc`) |
| HLG HEVC 10-bit | iPhone HDR (with Dolby Vision 8.4 metadata), Pixel 10-bit HDR |
| PQ HEVC 10-bit (HDR10) | Samsung Galaxy HDR10 and many cameras |
| PQ HEVC 10-bit with HDR10+ | Samsung Galaxy "HDR10+ video" |
| Variable frame rate | Nearly every phone |
| Rotation metadata | Portrait phone video |
| Stills: sRGB, Display P3, HEIC | Screenshots, iPhone and Android photos |

## Platforms

macOS (Apple Silicon), Windows 11 x64, Windows 11 on Arm. Linux is not a target.

## Statuses

| Status | Meaning |
| --- | --- |
| `supported` | Works, with evidence: a test, verification script or recorded receipt named in the registry |
| `fallback` | Works in a reduced form the creator can see (for example HDR graded from an SDR conversion) |
| `visible-reject` | Refused with a message telling the creator what to do |
| `unsupported` | Known not to work and not yet refused cleanly. This is a gap to close, never a final state |
| `unverified` | Built, but not yet proven on that class or platform |

Rules:

- Claim `supported` only with evidence that exists in the repository. Windows stays
  `unverified` until a [windows-compatibility](../../.agents/skills/windows-compatibility/SKILL.md)
  run records a receipt for that class.
- A change that turns an entry into `unsupported` must say so in its report. Prefer
  `visible-reject` or `fallback` over a silent failure.
- Fixtures are synthetic and generated locally
  (`pnpm fixtures:source-formats`). Never commit creator footage. Real-device checks (for
  example Dolby Vision iPhone clips) run on local files and record only the result.
- Platform-only tools (such as macOS `avconvert`) are acceptable only behind a recorded
  status for the other platforms.

## Enforcement

`pnpm check:source-coverage` fails when the following hold. Its test also runs in `pnpm test`, so `check:pr` enforces it:

- a preparation recipe exported from `src/lib` is not covered by a registry stage;
- a stage lacks a status for any format class on any platform;
- a `supported` or `fallback` entry names evidence that does not exist;
- a Windows entry claims `supported` without a recorded Windows receipt.

The procedure for producing evidence is the
[device-format-coverage](../../.agents/skills/device-format-coverage/SKILL.md) skill.
