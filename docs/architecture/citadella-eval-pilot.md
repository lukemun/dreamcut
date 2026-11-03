# Linked-spacing evaluation pilot

See the [eval registry](../evals/README.md) for case purposes, readiness and parked candidates.

Status: a bounded tool-only runner is implemented. It prepares copied project/profile
state, invokes a chosen Codex model and leaves a pending proposal for review. Private
inputs and trial results live under ignored `private/`; this is not automatic retro
promotion or a general benchmark runner.

## Run

```bash
pnpm eval:citadella /absolute/path/to/private-case.json prepare
DREAMCUT_CODEX_EXECUTABLE=/path/to/compatible/codex pnpm eval:citadella /absolute/path/to/private-case.json run
pnpm eval:citadella:check
pnpm exec tsx scripts/grade-citadella.ts /absolute/path/to/private-run-dir new-grading.json
```

The private case supplies `project_id`, historical `snapshot`, its `expected_revision`,
`model`, `request`, `range`, `element_ids`, three `groups` with `white`, `color`,
`background_white`, `background_color`, `full`, `click` IDs, and `background_click`.
This deliberately implements one case shape, not a generalized case-authoring format.
Use the project-local curation record to verify starting-state provenance first.

`prepare` verifies the historical revision, copies the full timeline/metadata and
current preference file into a new private run directory, and copies/hash-checks
media referenced by the task actors. The model sees only the scoped actors and
applicable preferences. Other timeline actors are retained to test preservation;
their media is not copied, so this is not a full-project playback environment.
No old history, proposal outcomes or evaluator rubric is supplied to the model.

`run` adds a tool-only Codex app-server turn with the requested model, without model
fallback. A clean temporary Codex configuration uses the existing local sign-in;
the temporary credential copy is removed at closeout. Shell, browser, apps and
plugin capabilities are disabled, and environment/workspace roots are empty.
This is application isolation and a restricted tool boundary, not a VM or a claim
that the trusted host process lacks filesystem access.

The five tools read task state, provide the timing contract, record the request,
preflight the exact proposal and create it. The two proposal calls invoke production
route handlers directly on isolated storage. The wrapper rejects other projects,
non-target actors, non-timing operations, rendering, stale state and creation without
matching preflight. There is no approval tool. The loop is bounded by ten minutes
and thirty tool calls. Errors and failed model attempts remain part of the record.
The reduced tool signatures and instruction packet differ from a full production
Codex session; comparisons must pin this harness as well as the model.

## Grading and evidence

The grader uses production override/derivation logic at minimum, default and maximum
spacing. It checks actual movement, mask/background continuity, fixed anchor/end,
click offsets, unchanged phase lengths, sources, appearance, other actors and
transitions. A narrow but effective range is allowed; no undisclosed numerical
minimum is imposed. These checks do not prove visual quality, sound or UI usability.
Do not label the result human-approved or a full editing pass without that evidence.

Run artifacts include frozen inputs, model context/tools, media hashes, code
fingerprints, events, tool arguments/results, pending proposal, usage and grading.
Token counters come from the runtime; dollar cost remains unknown unless separately
verified. Cached input and reasoning tokens are subsets, not additive totals.
Keep previous grades when fixing a grader and record why; do not rewrite an attempt
into a cleaner history or silently replace a rejected model with another one.

The next step for this pilot is a reviewable isolated preview of the candidate and
its dial. Do not expand to more cases before that basic loop is useful.

## Reusable isolated review project

`pnpm exec tsx scripts/citadella-review.ts <private-case.json> <new-project-id> [recorded-trial-directory]`
creates a fresh assembly via the existing MCP tools, imports managed media copies,
and rebuilds only the nineteen case actors. It refuses existing project IDs.
The first reveal is at 0.10 seconds and the sequence ends at 4.20 seconds;
the click preroll is retained. Surrounding footage and music are omitted, leaving
a neutral background. This is an isolated control test, not a reproduction of the
full composition in context.

The optional recorded trial is remapped to the new actor IDs and time origin,
checked at minimum/default/maximum spacing, preflighted, and saved as a pending
proposal. No model runs during this step and nothing is approved. Rebased timing
expressions normalize frame offsets and use a tiny rounding tolerance at half-frame
ties; this review adaptation is separate from the original model-run evidence.

Keep a frozen snapshot, case configuration and source hashes privately. To reset,
create another fresh project from that frozen case; never restore over a reviewed
copy. The visible setup project is a convenience, not the immutable authority.
Each review copy retains its own proposals, tuning and feedback. The runner accepts
the shortened case as its next model input; full-project and isolated-case scores
must remain separate because their context differs.
