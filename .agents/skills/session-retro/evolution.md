# session-retro — evolution log

## Purpose

When the owner says "retro this" about a coding-agent session, any agent can produce a
grounded review without a longer brief. It finds the transcript, reconstructs what was
asked and how long each result took, and reads the session through every lens that
matters: skills, mistakes, MCP tools, editor bugs, dials, performance and agent overhead.
It ends in a ranked fix list. Success: every finding cites a time or transcript line;
fixes are typed, sized and ranked by time saved; the fixes the feature freeze allows are made
and tested in their owning homes (uncommitted), new capabilities go to project status as
later work, and nothing touches My Style or the reviewed project.

## 2026-10-27 — Created from the Speed Entrance & Exit retro

- **Observation:** The retro of a long Speed Entrance & Exit session worked only because the
  starting session wrote a detailed brief: the transcript path, the files to read, the questions
  and where the report goes. Nothing routed a bare "let's retro this". `skill-evolution` names a
  retro ritual for skills only, `performance-review` measures the editor rather than agent
  sessions, and AGENTS.md's "never … start a retrospective" (meant for My Style) could make an
  agent decline. That retro also needed a one-off Python extractor to see queued messages,
  compactions and how long each pasted payload took to write.
- **Decision:** Updated. Added this routing skill with fixed lenses, each pointing to its
  owner, and a tested extractor, `pnpm session-timeline`, built on the activity capture's
  call normaliser so redaction stays shared. AGENTS.md routes "retro" here and its My Style
  line now says what it forbids.
- **Verification:** `src/lib/observability/session-timeline.test.ts` covers Claude and Codex
  records, queued messages, compactions, redaction, compose time and a missing start message.
  On the real session (`--from "apply the speed effect"`) it reproduced the hand count:
  `proposal_create` 13 failures, the two queued corrections and one compaction. A run of the
  whole procedure from a bare "retro this" has not been tried yet.

## 2026-10-27 — First run, on the speed session

- **Observation:** Run on the same speed session from the skill alone, up to 04:10 while that
  session was still working. Extraction took one call instead of about six hand-written
  scripts. The tally gave the `proposal_create` counts directly. The Tools lens surfaced a
  finding from after the hand-run retro: the agent hand-built motion-onset measurement
  with numpy while `visual_activity_prepare` already returns `frames` onsets, because that
  tool is described only for sound. Three gaps showed up in the procedure. It did not say to
  extend an earlier retro of the same session. It did not say how to treat a session that is
  still running. And it did not say that compose seconds include thinking.
- **Decision:** Updated. Inputs now name earlier retros in `docs/audits/` and the cutoff for
  a session still running. Step 1 says what compose seconds measure. The Tools lens asks for
  existing tools the agent did not find.
- **Verification:** Report `docs/audits/2026-10-27-speed-effect-session-retro.md` (ignored).
  All its figures come from `pnpm session-timeline` output or cited transcript lines. The
  run followed the written steps; it was not a fresh agent given only "retro this".

## 2026-10-27 — A retro makes its fixes

- **Observation:** The retro of `guy-8c2c9d24` (a Proof look selected and ignored, see
  `docs/audits/2026-10-27-proof-look-walking-man-retro.md`) followed the read-only rule. It
  found three shipped bugs and ranked them, then changed nothing. The owner: "Why didn't we fix
  it? This is supposed to be like a session retro. It should fix them. That's part of the
  retro."
- **Decision:** Updated. Added step 5, "Make the fixes": work down the ranked table, fix what
  the freeze allows in its owning home with a test, record skill and tool changes in their
  evolution logs, write new capabilities to project status, and run the required checks. The
  report gains **Fixes made** and **Deferred** in place of **Suggested entries**. The limits
  stay: no My Style, no edits to the reviewed project, no approving, rejecting or re-running
  its edits, nothing committed unless asked. "Report only" still stops after the report.
- **Verification:** Applied on the same retro. The catalog's Look brief, Look `works_with`,
  the shape entrance/exit guard, the motion-script stack trace, the draw-on probe and the
  face-clearance noise were fixed with tests. The generation-vs-selection routing, the
  slider-cap message and the Look-on-a-new-scene recipe were written in their homes. Checks
  are listed in the report.
