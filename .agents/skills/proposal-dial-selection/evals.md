# proposal-dial-selection — evals

A small regression suite in [`src/lib/agent/dial-selection-eval.ts`](../../../src/lib/agent/dial-selection-eval.ts).
Each case freezes a creator request, what the card's operations change, and the dials the
card could offer. An answer is the ordered list of main dial ids. Grading checks:

- every **required** dial is main (the creator could not reach the result without it);
- no **excluded** dial is main (unrelated, fixed, or duplicating another control);
- the main list stays within the case's size limit.

Anything not named either way is free for judgment. Each case carries a readiness label:
`ready` when the creator's own choice or tuning backs it, `needs-evidence` when it encodes the
agent's judgment that the creator has not yet confirmed on an approved card. Do not tune the
skill against a `needs-evidence` case. Both current cases come from one session and the
reference answers were written by the agent that wrote the skill; no model has been run
against the suite, so it guards regressions rather than measuring quality. Cases come from real sessions; add one
when a creator had to hunt for a dial or questioned one that was shown, and say which episode
it came from. Do not tune the skill to the suite's wording.

```bash
pnpm eval:dial-selection list               # cases
pnpm eval:dial-selection packet <case-id>   # what the agent sees
pnpm eval:dial-selection grade <case-id> <answer.json>   # {"main": ["entrance"]}
pnpm eval:dial-selection:check              # reference answers pass, known-bad fail
```
