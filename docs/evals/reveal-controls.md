# Reveal control coverage — v1

Suite `reveal-controls-v1` tests editing agents configuring existing prepared actors
and tools, with no coding or media preparation. Public inputs are synthetic and do
not include creator footage, feedback transcripts or local project paths.

| Case | Intent | Acceptance |
| --- | --- | --- |
| `shared-gap-first` | Initial ordered reveal: equal spacing with one useful shared interval control and individual presence durations | One gap dial moves all later actors and linked clicks cumulatively; source windows and appearance remain fixed; six presence dials preserve independent motion windows; at most 15 visible sliders |
| `independent-gaps-followup` | Explicit follow-up requesting separate adjacent delays | Five independent gaps replace shared spacing; earlier entrances and other gaps remain unchanged; all durations, sources and appearance preserved; at most 15 sliders |

The follow-up is supplied only for its case. It must not leak into initial-case
instructions. Both cases use the same source family and must remain in the same
tuning/held-out split. They are development cases, not a held-out benchmark.

Run `pnpm eval:reveals list`, `pnpm eval:reveals packet shared-gap-first`, or
`pnpm eval:reveals grade shared-gap-first <option.json>`. Grade the option itself,
not a full proposal envelope. Definitions and deterministic grading live in
[reveal-sequence-eval.ts](../../src/lib/agent/reveal-sequence-eval.ts).

Readiness: **offline component grader ready**. Synthetic media paths are identities,
not playable assets; this does not establish mask quality, visual fidelity, first-pass
human acceptance or agent/tool-loop performance. No model trial was run. Grader tests
exercise known-good and wrong-control-plan outputs, not a model's editing ability.

The real-footage candidate remains **needs-evidence**. The creator clarified shared
spacing as the desired initial control during curation; this is a newly specified
eval requirement, not proof the original request explicitly contained it. Private
outcome evidence includes pending proposals and unresolved naturalness. Preserve
those limits when constructing the separate isolated media fixture.

For future trials, record model/harness/schema versions, fixture hash, request arrival
when available, capture start, proposal saved, verification/handoff, preparation jobs,
repository code changes, reused assets and failures. Desired supported-control behavior
is zero code changes and zero segmentation jobs. Report latency and quality separately;
no speed target or measured speedup is claimed by this version.
