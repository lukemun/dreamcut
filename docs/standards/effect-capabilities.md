# Reusable effect capabilities

The [effects architecture](../architecture/effects.md) explains capability, recipe, and catalog ownership.

This standard governs new or extended effects, scene builders, and prepared visual
treatments contributed to DreamCut. The execution workflow is
[recreate-effect](../../.agents/skills/recreate-effect/SKILL.md). It complements the
[inspector standard](inspector-information-architecture.md) and repository operating
guide; it does not replace their editing, rendering, or approval contracts.

Every effect change must satisfy the executable [preview and export contract](renderer-contract.md).
Entrances, exits, and motion presets must also satisfy the
[visible-motion and offscreen-endpoint standard](spatial-authoring.md#visible-motion-and-offscreen-endpoints).

## Parameter integration is part of the capability

Follow the [editable parameter contract](editable-parameter-contract.md) before adding
fields or renderer behavior. Numeric effects declare proposal display metadata in
the shared effect registry; ordinary dials derive from it. Compound dependencies
use a tested adapter. New unbound parameters are incomplete capabilities. Run
`pnpm check:parameter-contract` as well as applicable UI/render checks.

## Inputs and reusable output

An effect exposes an explicit contract for required assets, optional assets, canvas,
timing, and adjustable parameters. Name asset roles in creator language, such as
Subject, Background, or Foreground object. Validate format, duration/handles, alpha,
and geometry where they matter. Explain a missing requirement at the point of use.
A target still is an appearance input; require additional direction or declare
assumptions for motion and unseen content.

Presets resolve to editable operations or a documented prepared-media recipe.
Preserve independent actors, native text, original sources, and source windows.
If an output must be baked, keep its inputs, recipe version, hashes, and regeneration
path. Replacement of an input has defined fit, timing, and tuning behavior; do not
silently discard unrelated adjustments.

## Continuous-source effect gate

For a continuous performance, keep one source-backed clip and apply visual treatments
through timed effect parameters on that clip. Turning a negative, grade, flash, or
other treatment on/off is not an editorial source cut. Preserve the source clock,
framing, masks, handles, and audio while the treatment changes. Backgrounds, lens
inserts, and independently meaningful actors can remain separate layers.

Before preparing an effect proposal or bounded assembly, document in its rationale:

- The continuous source/actor and its source-time mapping.
- The effect's active interval and the native controls/keyframes that implement it.
- Any extra source cut or derivative: its specific technical necessity, the missing
  native capability, and the controls that would become baked.

Do not introduce cuts or swap baked copies solely to toggle an effect. When the
required native control is missing, report the capability gap and implement it
through the shared preview/export and proposal paths before calling the effect
reusable. A deliberately requested baked demonstration may be prepared as a clearly
labelled partial example; it does not establish the default implementation.

Review must reject unexplained effect-only cuts. Verify the frame before, at, and
after each effect boundary, plus real-time playback across it. Matching alpha at
matching source frames proves mask identity only; it does not prove uninterrupted
browser playback or eliminate the intended brightness change.

Enforcement status: this is a required authoring and review gate. Current proposal
validation does not infer actor identity across arbitrary derived files and cannot
mechanically reject every violation. A future runtime gate needs explicit derivative
source lineage and effect intent; filename heuristics are not sufficient.

## Creator experience

- Give the capability a descriptive, searchable name and one natural entry point
  in the existing workflow. A new effect normally adds a section or action within
  the existing domains; it does not justify a new permanent tab by itself.
- Show the selected target and affected scope. For multiple layers, present the
  complete composition and a coherent named group while keeping its parts editable.
- Let the user supply inputs, see the combined result, tune it, and apply it through
  the normal editing path. Distinguish preview drafts, source preparation, and saved
  edits. Buttons name their actual consequence; generation does not imply application.
- Start with the controls needed to produce and tune the intended result. Match the
  inspector's row layout, units, domain order, and animation affordances. Expose exact
  values as well as suitable direct manipulation. Avoid internal node names, paths,
  shader terms, and IDs in the ordinary creator flow.
- Each control has a defined default, range, unit, and reset behavior. Reset, disable,
  remove, and regenerate mean different things and must perform their advertised
  operation. Do not offer an editable property that only affects preview or silently
  does nothing in the delivered output.
- Gestures preview responsively and commit one meaningful undo action. Cancel discards
  the unfinished gesture. Coordinated multi-layer application and reset are atomic.
  Undo/redo and reload restore the same visible state and review state.
- Preparation exposes useful progress, cancellation where supported, actionable
  errors, and retry without duplicate imports or lost tuning. Missing dependencies
  are an explicit unavailable state, never a success message or inert control.
- Controls must be self-explanatory (no help icons or explanatory text; see the
  inspector standard): clear labels and units. Keyboard operation, focus, accessible labels, and layout overflow
  are part of the feature. Both relevant workspace layouts have equivalent behavior.

## Integration and portability

Supported means the operation works through its intended UI and safe agent path,
persists correctly, and shares semantics between preview and export. Inspect the
actual implementation before claiming support. New stored formats require the
normal migration and compatibility path; unknown future formats fail closed.

Register new effect controls with the current capability registry, including spatial
behavior and real animation support. Extend validation, safe writes, reset semantics,
and the proposal/assembly surface as needed. Agent recipes use those surfaces, with
no direct timeline-file or private HTTP mutation shortcut.

Use existing modules and registries before introducing new extension infrastructure.
Keep community examples portable: relative resource paths, documented dependencies,
explicit optional services, and redistributable test assets. No private harness,
embedded credential, creator-specific project ID, or hidden local model installation
may be necessary for a claimed open-source workflow. Clearly state unsupported
platforms or optional setup requirements.

## Verification and delivery

Prove the reusable construction with different input assets. Exercise relevant short
and long durations, supported aspect ratios, and missing/invalid input behavior.
Tests should verify transformations and persistence rather than mirror implementation
wording. Use the repository's effect, spatial, audio, and playback instruments only
where the changed behavior requires them.

Inspect the actual UI in both relevant layouts, including tuning, help, reset,
replacement, undo/redo, and reload. Compare reference and recreated motion as well as
representative frames. Follow `frame-state` for appearance review; effect primitive
changes require `pnpm verify:effect-primitives`, and geometry changes require the
spatial conformance check specified in `AGENTS.md`. Preview/export pixel checks are
distinct from typechecks and renderer unit tests. Technical verification does not
authorize delivery rendering or publication of a user's edit.

A handoff identifies the supported inputs, creator flow, reusable skill/recipe,
verification evidence, and remaining limits. Mark prototypes, proposed UX, and
unverified behavior explicitly. A skill file alone is not proof that a feature ships.
