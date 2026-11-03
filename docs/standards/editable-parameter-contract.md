# Editable parameter contract

New effects, effect extensions and composition builders must be designed from their
meaningful editable parameters outward. A parameter is complete when the creator
and editing agent can tune it through the existing control, preview and approval
paths. Renderer-only support or a field in a schema is not completion; a field whose
dial is pending (see Enforced acceptance) is usable but not yet complete.

No hidden motion. Any movement a creator can see (a flip between words, a spin, an
overshoot, a rise) is a creator decision. It needs a dial in the inspector and on the
proposal card, including a way to turn it off. A built-in constant that animates
text or pictures is a defect, not a default. Example: one-word captions flipped every
word for 0.12 s with no setting; that is now `singleWordFlipSeconds` (Word flip,
0 = cut).

## Declare once, bind many

For every creator-facing parameter, identify:

- Meaning, stable field/role, value type, native units and neutral/default value.
- Safe bounds and display conversion; source-dependent limits come from actual handles.
- Static versus animated behavior, source/local clock and dependencies.
- The shared UI control, reset/cancel/undo behavior and deterministic derivation owner.
- Whether changing it needs only recomputation or invalidates a prepared asset, and why.

Numbers normally become sliders with exact values; colors, choices and switches use
their appropriate controls. Asset IDs, hashes, measured source durations and internal
node indices are not sliders. A structured relationship needs a typed adapter rather
than a scalar pretending to control its children.

Register scalar media effects in `EFFECT_CONTROLS` in
`src/lib/timeline/effect-controls.ts`. Its native range, identity, renderer/resolver,
animation and UI declarations remain authoritative. Every numeric definition also
requires `proposal` display metadata (`step`, `suffix`, optional `scale`, `offset`,
and creator label). Proposal support is generated from that definition; do not add
a second copy of the effect field to `PROPOSAL_TUNABLE_FIELDS`.

For example, a native 0–1 amount can declare
`proposal: { step: 1, suffix: "%", scale: 100 }`. Both display directions derive
from that declaration. This does not implement the effect: schema, native resolver,
shared inspector integration and rendering must still satisfy the effect contract.
For non-effect domains such as source timing or text layout, use the existing owning
registry/adapter and satisfy the scalar schema coverage gate below.

Native boundary transitions use `TRANSITION_CONTROLS` in
`src/lib/timeline/transition-controls.ts`. That registry owns numeric paths, native
bounds, defaults and display conversion. Transition schemas, selected proposal
controls and bounded `params.*` overrides consume it. Controls tune authored values and applicable registry defaults; linked controls retain
atomic dependencies. The 15-slider limit applies to first-class controls; Advanced
keeps every remaining supported dial reachable. Transition duration has its own frame-quantized range, separate
from text/audio duration. Smear zoom and travel use percentages; 0% removes that
movement. Absent smear fields retain the historical 35% zoom and 12% travel defaults.
Ordinary directional blur has an independent `whip_zoom_percent` control (Zoom
pulse, 0–100%, default/reset 0%). It uses a symmetric pulse through the
transition; zero keeps scale fixed. The former hard-coded 50% pulse is removed
for existing transitions with no explicit zoom value.

## Composition and dependencies

Compound effects preserve named actors and source roles. Expose meaningful values
such as shared spacing, presence or group scale; deterministic code resolves their
dependencies into existing operations. The agent selects actors, treatment, parameter
values and useful controls. It should not repeatedly write per-instance index arithmetic,
processing scripts, custom sliders or a new mutation path.

Use or extend a bounded compiler such as `proposal_reveal_sequence` where its semantics
fit. A compiler returns normal operations/control bindings, validates all advertised
ranges and uses the same derivation for preview and approval. Define ordering, shared
versus independent adjustment, source bounds, quantization and reset. Never promise a
generic dependency graph or recipe format that the runtime does not implement.

Changes to existing values or control exposure reuse prepared media when its source,
recipe and preparation inputs are unchanged. Track invalidation explicitly; a timing
dial is not a reason to rerun segmentation. Required visual validation remains scoped
to changed dependencies and the review question.

The [15-slider rule](inspector-information-architecture.md#first-proposal-control-coverage)
limits the first-class controls of a review option, not its full tuning inventory or the capability registry. Choose relevant main controls. Split
larger requested work into meaningful reviewable pieces while retaining dependencies;
never delete requested controls simply to meet the budget.

## Enforced acceptance

Run `pnpm check:parameter-contract`, included in `pnpm check:editor-ui` and the test
suite used by PR CI. The gate checks:

1. Every numeric effect has valid invertible display metadata and appears in the
   proposal inventory without separate slider implementation.
2. Boundary values and neutral values survive overrides and timeline derivation;
   empty overrides restore the authored draft. Invalid values fail validation.
3. New top-level numeric fields in agent props, visual/text/audio creation or patches
   are registered, explicitly classified as structural/compound values, or pending a dial.
4. Non-numeric registered effects have a working proposal adapter, a named existing
   migration gap or a pending-dial entry. Newly enabled fields do not silently add controls to old proposals.
5. Transition create/patch schemas are walked recursively, including nested params.
   Every numeric path must be registered; tuple/array values require a named typed
   owner. Synthetic unbound fields test that rejection. Each transition number is
   exercised through selection, display conversion, bounded overrides, reset and
   shared derivation without changing source windows.

The finite legacy list in `proposal-parameter-contract.ts` records older text/compound
and structured-control gaps; it is not a completion claim or an invitation to add new
exceptions. Repair the relevant gap when extending that capability. A new field may ship
before its dial when building the dial would hold back a working capability: list it in
`PENDING_CONTROL_PARAMETERS` with the reason. Proposals that change it stage normally and
record it in `control_gaps`; the creator can preview, approve, reject and undo it but not yet
tune it. Tests require the reason, reject entries that are not agent-writable fields and
fail once the dial exists, so the entry is removed when the dial lands. Internal exclusions
must name their actual owner and why scalar tuning is inappropriate. Tests reject
unclassified scalar additions and stale repaired exceptions. Recursive coverage currently
includes boundary transitions, not all nested agent schemas. Enum/choice integration,
other structured domains and semantic correctness still require review. The gate does
not discover arbitrary renderer constants or prove all possible effects.

`pnpm verify:renderer` includes the native smear fixture: independent zoom/travel/blur,
zero movement, historical defaults, exact reset, boundary and repeated seeks,
preview/export agreement and encoded frames. Changes to another transition family
must add its own representative pixel cases; smear coverage does not prove that family.

Add behavior tests for compound dependencies, retained source windows, reset and
preview/approval parity. Verify shared control interactions in the real editor and
renderer behavior under the existing UI and renderer contracts. Static registration
does not prove appearance, responsiveness or usefulness. A feature handoff reports
remaining legacy gaps and unverified checks explicitly.
