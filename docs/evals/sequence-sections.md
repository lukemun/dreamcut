# Sequence dials by beat — v1

Suite `sequence-sections-v1` checks how an agent lays out the dials of a card that runs
through a sequence (stops, hops, sections, beats), the rule in
[proposal presentation](../standards/proposal-presentation.md): dials in time order, one
section per beat, shared dials first, named by what the viewer sees there. It applies to any
effect, not only speed hops. Public inputs are synthetic and do not include creator footage,
feedback transcripts or local project paths.

| Case | Intent | Acceptance |
| --- | --- | --- |
| `sequence-dials-by-beat` | A finished four-beat sequence (stand at the door, move to the window, the stairs, the camera) arrives without review controls; lay out its Move length, three move blurs and three holds | Every dial has a `section`; each section's dials sit together; dials that tune every beat come first under their own section; then one section per beat in time order, each holding only that beat's dials (the move into it, then its hold); no mark numbers; operations and timing bindings unchanged; schema and 15-slider budget pass |

A dial belongs to the beats whose clips it tunes. A hold also ripples every later clip's
start; that ripple does not make it a dial of the later beats.

Run the grader tests with `node --import tsx --test src/lib/agent/sequence-sections-eval.test.ts`
(also part of `pnpm test`). Grade the option itself, not a full proposal envelope. The packet,
grader, known-good layout and one known-bad layout per failure (flat "Time on screen",
mark numbers, a hold under the next beat, sections by kind, shared dials last, hold before the
move, a missing blur) live in [sequence-sections-eval.ts](../../src/lib/agent/sequence-sections-eval.ts).

Readiness: **offline component grader ready**. No model trial was run. Synthetic media paths
are identities, not playable assets; passing does not show that the dials are useful, that the
motion looks right or that an agent builds the sequence itself. The private
`speed-hops-sectioned-dials-v1` case covers the full card on real footage. This is a
development case, not a held-out benchmark; grow it from real episodes before tuning against it.
