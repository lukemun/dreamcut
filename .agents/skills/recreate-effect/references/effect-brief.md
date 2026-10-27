# Effect brief

Use this as a compact record; omit fields that genuinely do not apply and explain
unsupported inputs. Store a filled brief beside its evidence, using portable paths.

## Identity and evidence

- Stable effect name, version, requested scope, and intended creator outcome.
- Reference URL/file and hash; relevant tutorial steps and source intervals.
- Frame/time convention, inspected ranges, evidence paths, and coverage gaps.
- Observed appearance/movement, claimed tutorial method, proposed mechanism,
  confidence, and unresolved alternatives.

## Capability decision

| Required operation | Existing code/UI/tool evidence | Gap | Chosen route |
| --- | --- | --- | --- |

Record why existing composition is sufficient or why a new operation is necessary.
List prerequisites separately from product gaps.

## Reusable input and output contract

| Input role or setting | Required? | Accepted form / units | Default | Validation / failure |
| --- | --- | --- | --- | --- |

Record supplied/derivable/missing status for each input and the preparation needed.
During intake, use the [input and ranking worksheet](input-ranking.md) to compare
all catalog entries before implementation.

Include relevant subjects, masks, background plate, footage handles, text, target
still, canvas, duration, timing anchors, and asset replacement rules. Define how an
input is fitted and which subject features or source intervals must be preserved.
State which controls update immediately and which require preparation.

Include a source-frame timing map (entrance/settle, stagger, switch, pulse on/off,
final settle), output-frame mapping, default 1× reference speed, and the policy for
changing object count. Record motion/easing differences and timing deviations.

Describe outputs: editable scene/layers, reusable background, media derivatives,
provenance, and preparation receipt as applicable. Record dependencies and supported
environments without embedding credentials or a creator's private paths.

## Creator flow

- Discovery and launch location; target selection and visible affected scope.
- Inputs → preview → tuning → explicit application; specify what persists at each step.
- Primary controls and their home; exact units, reset, animation support, and help.
- Missing input, preparing, failed, retry, cancel, replace, and remove behavior.
- Meaning of replacement/regeneration for existing tuning and timeline timing.

## Acceptance and handoff

- Reference comparison states and moving intervals, with allowed adaptations.
- Second input set and the reuse behavior it tests.
- UI evidence in both relevant layouts; edit, reset, undo/redo, reload, and export parity.
- Appropriate automated/visual checks and any unavailable check.
- Execution skill/recipe and runnable entry point; implementation status and limits.
