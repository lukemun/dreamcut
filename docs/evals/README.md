# Editing eval registry

This is the index of our editing-agent evals and recorded candidates. It covers
models operating existing editor tools, not coding new effects. Reviewed 2026-10-01.
The current real-project focus remains linked reveal spacing. Audio and reveal-control
cases are synthetic development checks; the real-footage reveal candidate needs an isolated fixture.

## Runnable cases

Readiness describes available infrastructure, not a model pass. Component cases
accept a saved proposal for offline grading; the linked-spacing pilot and local harness qualification have
model/tool loops. No case here is a held-out benchmark.

| Stable case ID | Display name / purpose | What a pass demonstrates | Scope and readiness |
| --- | --- | --- | --- |
| `local-harness-qualification-v1` | **Local operator transport and visual qualification** | Exact downloaded model can discover tools and answer a pixel-only question, with an image-omitted control | Runnable synthetic development probes; individual model results and limits in the [case contract](local-harness-qualification.md). No editorial-quality claim. |
| `progressive-tool-discovery-v1` | **Find and invoke tools through progressive discovery** | Model selects a family; the owned harness refreshes and registers schemas before dispatch | Sol and inherited/default subagent trials passed through the owned adapter; separate from native Codex refresh. [Case contract](progressive-tool-discovery.md) |
| `client-tool-refresh-v1` | **Discover and call a newly exposed tool** | Client refreshes schemas after an MCP list-change notification and invokes the previously hidden tool | Isolated probe and grader ready; automated fixture passed, actual Codex/Claude run pending. [Case contract](client-tool-refresh.md) |
| `citadella-linked-spacing-v1` | **Linked reveal spacing — Citadella**: provide one useful control for a coordinated effect | A shared dial moves later flashes, mask holds, background reveals and clicks together; fixed anchors, phase lengths, sources and appearance are preserved; human review checks motion, sound and usefulness | Private footage; bounded tool trial and isolated 4.2 s setup available. Structural grading available; human quality remains separate. [Pilot](../architecture/citadella-eval-pilot.md) |
| `shared-gap-first` | **Shared reveal spacing on the first proposal** | One shared gap dial, six independent presence controls, preserved sources/audio and a 15-slider cap | Synthetic component grader ready; [case contract](reveal-controls.md) |
| `independent-gaps-followup` | **Independent gaps when requested** | Five adjacent gap controls with cumulative downstream movement and preserved earlier timing | Synthetic component grader ready; [case contract](reveal-controls.md) |
| `sequence-dials-by-beat` | **Sequence dials by beat**: lay out a sequence card's dials in time order | One section per beat in time order after a shared first section; each beat's dials (the move into it, then its hold) together; named by place, not mark numbers; at most 15 sliders | Synthetic component grader and known-good/known-bad layouts ready; no model trial. [Case contract](sequence-sections.md) |
| `sound-sync-v1` | **Sound follows the picture**: sound effects follow on-screen activity | Proposed sounds follow handwriting (pen speed, a different sound at sharp turns, silence on lifts), a drawn sketch, a camera push and footage motion beats (correlation, onset error in ms, turn response, no sound without a visual cause) | Synthetic fixtures, independent-truth scorer and scripted baseline ready; no model trial yet. [Case contract](sound-sync.md) |
| `mute-speech` | **Mute speech without changing music**: target the correct actor and gain authority | Speech is muted through the native gain/envelope state; music and timing remain unchanged | Synthetic component case; offline grader ready |
| `lower-music` | **Set music level without changing speech**: follow a numeric instruction | Music is at 0.2 linear gain; speech and timing remain unchanged; relevant control is exposed | Synthetic component case; offline grader ready |
| `music-fades` | **Adjust both music fades**: complete a two-part request | 0.5 s fade in and 1 s fade out; gain, speech and timing preserved | Synthetic component case; offline grader ready |
| `music-level-and-fades` | **Coordinate music level and fades**: keep dependent changes together | All three requested values appear in one reviewable option with relevant controls; unrelated state preserved | Synthetic component case; offline grader ready |
| `already-muted` | **Avoid an unnecessary edit**: recognize an already-satisfied request | Returns `no_change` without options or mutations | Synthetic component case; offline grader ready |

The five audio IDs belong to suite `audio-proposals-v1`. Their executable definitions
live in [editing-eval.ts](../../src/lib/agent/editing-eval.ts); commands and grading
limits live in the [starter guide](../architecture/editing-eval-starter.md).
Passing grader tests does not mean a model passed those cases.

The linked-spacing candidate record predates the runnable pilot and still says
`needs-evidence`. Retain that historical record; the pilot and frozen private setup
supply subsequent preparation evidence. Its original full-timeline trial and the
short isolated fixture are different input variants. A time/ID-remapped review copy
is not another model trial and must not be counted as one.

`pnpm eval:local-models` runs `audio-proposals-v1` (repeated trials) and the Citadella
linked-spacing case against each installed local model under one harness; the measured
2026-10-10 comparison and the chosen chat default are in the [operator runbook](../architecture/editing-operator-runbook.md#measured-bake-off--2026-10-10).

## Private prepared editing cases

| Case ID | Capability | Readiness |
| --- | --- | --- |
| `apex-ramp-independent-bars-ball-v1` | Brief apex slowdown with independent bar timing and useful controls | Private frozen fixture ready for the local operator; human grading rubric; no model trial yet |
| `surface-text-turn-visibility-v1` | Editable text attached through a surface turn and descent | Historical pre-attachment state recovered; private fixture ready for the local operator; human motion grading; no model trial yet |
| `steady-height-after-rejection-v1` | Keep a cutout performer at a steady height after a rejected attempt, preserving the existing slide | Private frozen fixture and structural grader; runs with `pnpm eval:case` against the app's Claude Code and Codex sessions; human motion review |
| `speed-hops-sectioned-dials-v1` | Speed entrance and exit across six stops, built and laid out the way the creator approved: live holds, streaks that start mid-step and keep full blur to the landing, blur sized to the body along the travel, a bow around an obstacle, dials one section per stop in time order, named by place | Private frozen fixture (state before the hop card was approved, prepared cut-outs included) and structural grader with a self-check: passes the reference card, fails the earlier approved card, flat grouping and mark-number names; runs with `pnpm eval:case`; no model trial yet; human motion review |

These are development cases, not held out. Current scoped preferences and tools are
pinned alongside historical timelines; requests have explicitly labeled benchmark
adaptations. Earlier candidate records remain unchanged. Input copies contain no
accepted proposals or hidden rubric. Preparation uses the internal
`scripts/prepare-editing-fixture.mjs` with a frozen private manifest and a fresh
private destination. `pnpm eval:case <package> --provider claude|codex` prepares a fresh attempt,
serves it from the running editor, sends the frozen request through the app's signed-in
session and grades the staged proposal with the package's `evaluator/grade.mjs` when present.
It never approves; it uses the editor's current style profile rather than the frozen one. The local operator accepts `--editor-url` for a separate
instance serving only that attempt. No setup command performs inference or approval.
Model selection, actual trial playback and human grading remain execution steps.

## Recorded candidates — parked

Visual delivery and discovery are runnable in the local harness case above. Crash recovery, stale-state handling and compaction have deterministic component tests; full model-driven acceptance scenarios remain in the [harness design](../architecture/editing-operator-harness.md#implementation-sequence-and-acceptance-gates). These are separate from editorial candidates.

These have private source evidence but are not runnable benchmark cases. No work
on them is implied by listing them here.

| Candidate ID | Intended capability | Status |
| --- | --- | --- |
| `route-arrow-control-coverage-v1` | Expose useful controls when recreating a route-arrow effect | Parked; needs evidence |
| `mask-continuity-correction-v1` | Correct mask continuity while preserving surrounding choices | Parked; needs evidence |
| `flight-whip-motion-refinement-v1` | Refine transition motion from feedback | Parked; needs evidence |


Private evidence stays in project-local `memory/eval-candidates/` records. Footage,
personal feedback, full prompts, run transcripts and local project links do not
belong in this shared index.

## Naming and case records

Name the **behavior being tested**, with a scene label only to distinguish fixtures:
“Linked reveal spacing — Citadella,” rather than “Sol test” or “Budapest eval.”
Keep existing IDs stable. For new cases, use `<capability>-<fixture>-vN`; record
model, runtime, prompt/tool versions and date on the trial, not in the case ID.
Record fixture and grader versions separately, and create a new case version when
the task, input or acceptance meaning changes. Preserve previous results.

Each case record answers:

- **Purpose:** which capability or failure mode does this test, and why?
- **Input and request:** which frozen starting state, media, context and user task?
- **Allowed actions and constraints:** what may change, what must remain fixed?
- **Success:** which deterministic checks and human-review questions establish it?
- **Limits:** what does passing not demonstrate?
- **Readiness and evidence:** version, status, fixture/runner/grader references,
  private evidence location, and last compatibility review.

The [evaluation contract](../standards/editing-evaluation.md) owns detailed evidence
and refresh requirements. This registry is a manually maintained index, not a
runtime discovery API. Update it when a case is added, promoted, versioned, parked
or retired; refresh affected entries after tool/schema changes and before comparisons.

Keep trial results separate from case definitions. A trial records its run ID,
case/input/grader versions, exact model and harness configuration, pass/fail by
dimension, review state, latency, token usage and known cost. Missing quality or
cost evidence remains unknown. Do not combine component checks and editorial tool
trials into a single success percentage.

This task/trial/grader separation and capability-versus-regression distinction
follow [Anthropic's agent evaluation guidance](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents).
Our current collection is a development set; a regression claim requires repeated
model evidence, and a held-out claim requires actual separation from tuning.

## Tool exposure comparison

`pnpm eval:reveals compare-catalogs shared-gap-first` (or
`independent-gaps-followup`) emits matched full/editing tool-profile packets for the
existing synthetic reveal cases. See [execution boundaries and metrics](../architecture/tool-discovery-recipes.md).
This is ready for a controlled model trial, not a completed model benchmark or footage review.
