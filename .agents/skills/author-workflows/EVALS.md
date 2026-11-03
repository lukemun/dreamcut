# author-workflows evaluations

## Cases

| Input | Expected outcome | Failure criterion |
| --- | --- | --- |
| Author a multi-step workflow | Define stage inputs, outputs and failure handling | Output misses the stated expected outcome or contradicts the owning skill. |
| A stage lacks a required capability | Expose the blocker without claiming completion | Output treats the near miss as complete, verified work. |
| Required tool or evidence is unavailable | State the specific limitation and preserve partial-work status. | Claims unseen evidence or successful execution. |

## Run and verification

Use a fresh execution context with fixed supplied inputs; read the owning SKILL.md and linked requirements. Compare the output and resulting state to each expectation. Record input, output, reviewer findings and pass/fail in the run evidence; summarize lessons in evolution.md. Structural validation checks packaging only.

Status: cases authored 2026-10-11; fresh-context behavioral trials have not run. Existing domain rubrics/resources remain authoritative where linked by the skill.
