# Timeline editor reusable smoke fixtures

## Everyday core check

Run `pnpm check:core` after everyday editor changes. It typechecks the app and runs
a deliberately small set of existing regression suites:

- Save/reload and undo/redo preserve edits and review marks.
- Clip patches, splitting, frame boundaries, and transitions remain valid.
- Caption timing and audio gain/envelopes remain consistent.
- Proposals cannot bypass review or overwrite a newer edit.
- Mark controls, keyboard playback contracts, and interrupted export recovery work.

`pnpm test:core` runs just those tests; `pnpm test:core --list` lists the groups.
The runner uses temporary project/profile directories. It needs installed Node
dependencies, but no running editor, FFmpeg, model downloads, provider credentials,
or actual renders. A failure returns a nonzero exit status. Keep `pnpm test` as the
broader regression suite; this smaller gate is not a replacement.

### Five-minute browser check after UI changes

Use the disposable `ui-smoke` project below, never a user's real edit:

1. Open it; confirm picture, clips, captions, and audio controls appear.
2. Play, pause, and seek across a clip boundary; listen for continued audio.
3. Move or split a clip; undo, redo, and reload; verify the saved edit remains.
4. Add a mark, open its menus, seek to it, and check notes persist. Check menus
   are readable over the timeline in both Tall and Wide layouts.
5. When proposal UI changes, preview/reject a disposable proposal without changing
   the edit; approve a fresh one and verify it is one undoable change.

Before releasing changes to preview/render code, additionally perform an explicitly
approved short fixture export and play the MP4. The fast tests do **not** prove
browser rendering, audible cleanup quality, encoded output, or a fresh Windows install.
This browser checklist is manual, not an automated end-to-end suite.

## Reusable media fixture

`pnpm seed-ui-smoke` rebuilds the ignored `projects/ui-smoke/` project from deterministic ffmpeg sources.
Use it for Inspector, playback, alpha, keyframe, API, and Timeline Editor Agent regression checks instead of borrowing
production media.

Generated media:

- `color-motion.mp4` — moving full-frame color/test detail for grading and playback checks.
- `neutral-card.png` — neutral still for identity and exposure checks.
- `alpha-motion.webm` — VP9 alpha clip with a moving warm shape for cutout/review-mode checks.
- `tone.wav` — short reference audio for playback smoke.
- `media/luts/*.cube` — content-addressed identity and warm-look 3D LUTs for ingestion, WebGL, intensity, and deletion-reference checks.

The timeline itself includes an exposure-keyframed ordinary video and an advanced/LUT alpha video. This keeps
clip diamonds, shared Player rendering, and headless LUT export in the default smoke path; the neutral still
remains ungraded for identity checks.

The seed is intentionally disposable and repeatable. It removes only `projects/ui-smoke/`, recreates the
project, and prints the local review URL. Local project media remains ignored; the generator and contract are
tracked.

Recommended order:

1. `pnpm seed-ui-smoke`
2. `pnpm test && pnpm typecheck && pnpm build`
3. `pnpm verify:color-grade`
4. Run `pnpm exec tsx scripts/timeline-editor-agent.ts inspect --project ui-smoke` and
   `node mcp/server.mjs --catalog`. Validate a fixture proposal with the CLI's `validate`
   command, passing `--project ui-smoke`, its `--proposal-base64` payload and the intended
   `--max-mutations` cap. The former private-harness `context` command is not included.
5. Open `/p/ui-smoke` in a browser and smoke both workspace layouts at desktop and narrow widths.

`pnpm verify:color-grade` writes the versioned 30-second 1080p encoded parity,
alpha, advanced-grade, and JPEG-vs-PNG measurements to
`testing/results/color-grade/latest.json`.
