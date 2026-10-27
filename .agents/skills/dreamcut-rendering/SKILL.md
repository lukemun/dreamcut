---
name: dreamcut-rendering
aliases: [open-edit-remotion]
description: Safely change DreamCut's owned frame runtime, preview player and browser export while preserving timing, media routing and preview/export parity. Use for composition, Player, effect or encoded rendering changes.
---

# DreamCut preview and rendering

Treat `timeline.json` as the editorial authority. The owned frame runtime projects
saved timeline state into preview and export; never write editor state from a composition.
Read the [preview and export contract](../../../docs/standards/renderer-contract.md)
for mandatory behavior and executable effect coverage.

## Integration boundaries

- Keep source-window math in shared timeline helpers. Preview and export consume
  the same composition adapters and frame-derived animation.
- `src/lib/frame-runtime` owns player, sessions, media and effect readiness.
  `src/lib/render/browser-renderer.ts` captures settled frames and encodes with FFmpeg.
  The historical `src/lib/remotion` folder holds DreamCut composition code; its name
  does not imply an external Remotion runtime dependency.
- Chroma, LUT and 3D drawing must register readiness/draw work with the frame session.
  Preserve decoded alpha and export source authority. Preview proxies remain governed
  by their existing verification contract.
- Keep source trims distinct from duration and playback rate. A player smoke is not
  proof of encoded picture or audio correctness.

## Verification

Run focused timing/resource tests, `pnpm check:pr`, and `pnpm verify:renderer` against
an isolated running editor. Extend explicit effect cases before claiming support.
Run the affected family-specific pixel or playback instrument. For renderer changes,
compare real encoded outputs including frame count, boundaries, audio timing and gain.
Record actual coverage and unexplained differences; do not weaken a proof to pass it.

Existing-project editorial changes still use proposals. Rendering requires the user's
request. This engineering workflow does not bypass those contracts.
