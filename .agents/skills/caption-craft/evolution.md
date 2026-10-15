# caption-craft — evolution log

## Purpose
Create or refine accurate, readable, source-bound timed captions. Scope: caption text, deterministic pause-first grouping, and timing authority — every cue bound to its speech element id, alignment hash, and absolute source-word interval — plus semantic placement via named presets, never raw coordinates. It does not re-time speech or fix a lagging decoder with caption offsets. Good looks like: captions match spoken words exactly, survive trims and rate changes through their bindings, and sit inside safe areas with legible contrast.

## Preserved prior evolution records

# caption-craft evolution
2026-09-15: Approved Memory improvement `3a96e07c6cc25f6f6ef454994a5c3148277c920c0de4febc4a8acac96bfb7ffb` from retro `460704df-3798-4daa-a76f-b04382292574`. Map captions to each audible clip’s source clock and, after trims, splits, or rate changes, realign the entire affected caption region rather than correcting isolated captions.

## 2026-09-19 — Updated: caption safe-area guidance now cites the measured Reels box

**Observation:** the "keep captions inside safe areas" line gave no numbers, so agents had no concrete box to compose against.

**Change:** SKILL.md now gives the 1080x1920 Reels box (x 65..1015, y 270..1248, x <= 887 below 44.8% frame height for the action rail) and points to `docs/standards/vertical-video-safe-zones.md`. The underlying geometry fix (organic resolving to the measured template) is logged under platform-video-delivery.

**Verification:** doc-level change; no tests affected.
