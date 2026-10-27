# Agent knowledge architecture

Status: current repository convention

DreamCut separates operational authority, shared policy, task procedures, optional aesthetics, personal taste, and design reasoning. These layers exist so that a useful lesson can be reused without accidentally turning one creator's preference, one agent's implementation detail, or an unreviewed proposal into a universal rule.

## The layers

| Layer | Canonical location | Owns | Must not own |
| --- | --- | --- | --- |
| Repository operating guide | [`AGENTS.md`](../AGENTS.md) | Source-of-truth boundaries, authorization, required entry points, and rules every agent needs before selecting a task procedure | Detailed instructions for every craft |
| Standards and contracts | [`docs/standards/`](standards/README.md) | Cross-task invariants, shared policy, acceptance contracts, and durable interface expectations | A step-by-step workflow that belongs to one task, or one creator's taste |
| Skills | [`.agents/skills/`](../.agents/skills/README.md) | Discoverable, task-triggered procedures for building, reviewing, and verifying an outcome | Personal defaults, optional house looks, or duplicated standards |
| Effect recipes | [`docs/effects/catalog.json`](effects/catalog.json), with evidence in the owning skill | Shared recreation methods, inputs, criteria and reference/output evidence | Private personal defaults or unverified completeness claims |
| Personal styles | Local profile `personal-styles/`; [store contract](personal-styles.md) | Explicitly saved named parameter bundles referencing skills or effect recipes, with source edit and revision receipts | Shared contribution, silent activation or automatic timeline application |
| My Style | Authoritative local `STYLE.md`; private settings/evidence sidecar | Scoped creator preferences about when and why to choose a treatment | Shared product policy or rules that should apply to every creator |
| Project direction | Project brief, proposal rationale, and editing memory | Deliberate decisions and exceptions for one edit | Unstated global defaults |
| Project status | Private: `dreamcut-cloud/docs/editor-project-status.md` ([pointer](project-status.md)) | Dated product decisions, initiatives in flight and deferred to-dos, shared by every agent | Procedures, standards or creator taste |
| Research and design knowledge | [`docs/research/`](research/README.md), [`docs/wiki/`](wiki/README.md), and named architecture documents | Evidence, interpretation, alternatives, proposed designs, and implementation status | Runtime authority merely because a proposal is persuasive |
| Enforcement | Schemas, safe-write paths, validation, and tests in source | Invariants that can and should fail closed mechanically | The complete human explanation of why the invariant exists |

`.agents/skills` is a shared discovery location, not an agent-specific fork. Codex, Claude, and agents without automatic discovery all resolve the same repository-owned procedures. Agent integrations point to these files rather than maintaining divergent copies.

## Contributor file layout

```text
AGENTS.md                           repository operating rules
.agents/skills/
  README.md                         skill discovery index
  recreate-effect/
    SKILL.md                        when to use it and how to do the work
    evolution.md                    Purpose, observations, decisions, verification
    references/                     optional detail and templates
    scripts/                        optional reusable helpers
docs/standards/
  README.md                         shared policy index
  effect-capabilities.md            requirements shared by effect implementations
```

Each skill is a portable folder with one canonical `SKILL.md` and one `evolution.md`.
The folder supplies the name, so companion files do not repeat it. Keep substantial
conditional material in linked resources. Add an evaluation reference only when a
maintained suite needs it. Evolution logs are read during skill changes;
the current procedure stays in `SKILL.md`.

A standard defines requirements shared across procedures and implementations. Standards
do not require individual evolution logs: Git history and reviewed changes record edits;
substantial policy decisions should link their rationale, evidence, and verification
from the standard. Review findings go to the owning skill, standard, or code. A
standard fix must update its contract and relevant checks rather than accumulating a
second instruction source in a log. A skill may reference several standards, and a
standard may govern several skills.

## Why standards are separate from skills

A standard answers **what must remain true across workflows**. A skill answers **how to accomplish a particular class of work**.

For example, the preview-proxy contract says that interactive video must fail closed when its declared proxy is missing, unverified, or unsuitable. Media preprocessing explains the procedure for preparing that proxy. Caption craft and platform delivery both depend on safe-zone policy, but neither should redefine the safe zones. Keeping the invariant in one standard prevents procedures from drifting apart and allows code, tests, UI, and multiple skills to cite the same contract.

Create or extend a standard when a rule:

- crosses more than one skill or product surface;
- defines authority, safety, data integrity, or an interface contract;
- must remain stable even when a workflow or tool changes; or
- needs one canonical statement that code and human review can both cite.

Create or extend a skill when the knowledge:

- has a clear request-routing trigger;
- describes a reusable sequence of actions and judgments;
- names task-specific inputs, tools, failure modes, and verification; and
- can evolve without redefining repository-wide authority.

Use a style recipe when the construction method is stable but the preferred visual expression is optional. Put a preference in My Style only when it describes this creator's choice and scope. A single attractive project result is evidence for a recipe or observation, not permission to create a global preference.

## Authority and precedence

Safety, source preservation, proposal approval, schema validity, and other enforced contracts cannot be overridden by aesthetic preference.

Within those boundaries, editorial selection follows:

```text
current user direction
  > project-specific decision
  > applicable active My Style preference
  > selected optional style recipe
  > skill's restrained working choice
  > product default
```

Execution follows the relevant skill, subject to `AGENTS.md` and every applicable standard. When prose disagrees with enforced code or a current schema, stop and reconcile the documentation; do not silently choose whichever source is convenient.

Architecture and wiki pages must label proposed behavior. A proposal does not override a shipped standard, open a mutation path, or prove that an implementation exists.

## How knowledge moves

```text
session observation or review evidence
                |
                +--> one-project decision -----------------> project context
                |
                +--> creator-specific recurring choice ----> My Style
                |
                +--> reusable subjective treatment --------> style recipe
                |
                +--> reusable task procedure --------------> skill + evolution log
                |
                +--> cross-task invariant -----------------> standard/contract
                                                            |
                                                            +--> schema, code, and tests
```

Promotion is deliberate. Preserve the evidence and decide scope before changing a higher-authority layer. A personal preference does not graduate into a skill merely through repetition, and a skill instruction does not become a standard simply because it is useful. Wide-blast-radius behavior changes require human review under the [skill evolution standard](standards/skill-evolution.md).

When an invariant can be enforced mechanically, add or retain the code-level guard and tests. The standard remains useful as the readable contract, rationale, and coordination point; documentation is not a substitute for enforcement, and enforcement is not a substitute for explaining the contract.

Agent execution findings (repeated discovery, redundant checks, retries, avoidable
delay before a proposal is ready) belong in the owning skill, shared standard, or
tooling, rather than the creator's My Style. The editor does not run retrospectives;
the DreamCut team reviews evidence outside this repository.

## Maintenance rules

- Link to a canonical rule instead of copying it into several skills.
- Keep standards independent of today’s particular tool names where the invariant is broader than the implementation.
- Keep skills concise enough to load for a task; move cross-cutting rationale to a standard or architecture page.
- Keep recipes optional and parameter-oriented. They may reference an execution skill but never weaken it.
- Keep personal data outside the repository. `STYLE.md` is the active personal authority. Runtime preference entries are derived from it; the JSON sidecar stores settings, evidence, project exceptions and pending/retired entries.
- Preserve research, interpretation, proposed architecture, and shipped behavior as distinct claims.
- When a document changes authority or ownership, update the indexes and incoming links in the same change.

## Entry points

- [Software architecture](architecture/README.md)

- [Repository operating guide](../AGENTS.md)
- [Project status](project-status.md)
- [Standards index](standards/README.md)
- [Skill index](../.agents/skills/README.md)
- [Style recipe catalog](../.agents/style-recipes/README.md)
- [Personal editing style](wiki/personal-editing-style.md)
- [Research and design wiki](wiki/README.md)

## Contributed effects and private styles

Effect recipes are the contribution unit: a shared method, reference, recreation and hashed evidence linked in both directions between the skill and `docs/effects/catalog.json`. Reference-only entries are candidates. See the [effects format](effects/README.md).

Personal styles are named parameter bundles referencing those methods. They live under `profileDir()/personal-styles/`, with immutable revision receipts, and are visible in User → My style. They require an explicit save instruction and are never silently learned or added to the effects catalog. See [personal styles](personal-styles.md). Older references to optional style recipes describe historical documentation; they do not establish a shared personal-style contribution lane.




## Tool capability evolution

Tool contracts live in [tool authoring](standards/tool-authoring.md); model runner
contracts live in [agent/harness authoring](standards/agent-harness-authoring.md).
The [tool registry](tools/registry.json) maps related MCP tools to capability owners
and `docs/tools/evolution/` decision records. These record material behavior changes
and validation, while private activity/OTEL records retain individual executions.
Existing registrations are not retroactive conformance certification.
