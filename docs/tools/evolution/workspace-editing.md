# Edit only within an active assembly workspace — evolution

Capability: `workspace-editing`. Registry: [registry.json](../registry.json).

## Purpose and boundary

Edit only within an active assembly workspace. Direct changes require agent_workspace; never human approval/history restoration.

## 2026-09-30 — initial capability registration

- **Observation:** Repository script/catalog audit found this capability family. This
  is code/discovery evidence, not measured editing frequency or a new runtime trial.
- **Decision:** Register existing implementation; audit remaining authoring-contract gaps incrementally.
- **Version:** Initial registry record; existing tool/recipe versions are unchanged.
- **Verification:** Catalog membership and owner/evolution paths checked by `check:tools`.
  Runtime behavior was not re-certified by this inventory.
- **Acceptance for next change:** Preserve existing authority tests; migrate recovery and accounting contracts with representative success/failure cases.
- **Evidence:** [Script audit and priorities](../script-audit.md). Private session
  traces remain outside this public log.


## Native accent transitions and recorded samples

`transition_create` and `transition_patch` now accept `film_burn`, `camera_flash`
and `blackout`. Existing schemas, safe writes and workspace authority remain the
owners. `TRANSITION_CONTROLS` supplies bounded strength and peak-hold values;
proposal tuning and Properties consume the same fields. Direction does not apply
to these three types. Duration remains frame-quantized and clip-bounded.

Acceptance covers schema bounds, proposal derivation/reset, real encoded transition
frames and preview/export parity. Inspector samples are rendered through the same
production composition from an isolated vertical assembly; their recorder is an
internal read-only maintenance script, not an editing tool or an approval bypass.

## 2026-10-09 — Browser GPU admission for direct workspace writes

- **Observation:** Direct `agent_workspace` mutations could write props that only the
  Standard renderer draws, so an agent assembly could not play on Browser GPU.
- **Decision:** `writeTimeline` checks leased agent writes (live MCP write lease on an
  `agent_workspace` project, excluding approved `editor_agent_*` applies and compaction)
  with `assertGpuWriteAdmissible`. One safe-write owner covers element create/patch/batch,
  split, duplicate and transition tools. Human writes are not gated here.
- **Interface:** A write that introduces a CanvasKit issue fails with HTTP 422,
  naming each element and capability. Nothing is written. `source` issues are exempt.
  Pre-existing gaps, including those inherited by a split or duplicate, do not block.
- **Verification:** `src/lib/timeline/gpu-write-admission.test.ts` covers leased
  rejection with an unchanged timeline, and unleased human writes. No live MCP
  session trial was run.

2026-10-10 — Element validation errors (audit F6): the element create route's message
and the shared `zodIssuesToMessage` now include each issue's path, and the MCP wrapper folds
route `issues` into `path: message` text plus a typed INVALID_INPUT payload. An invalid
`lane_key` names `lane_key`. Open object inputs (`element`, `props`, `patch`) still have no
schema, so unknown keys there are caught only by the route.

## 2026-10-10 — Lane mute and hide are separate

- **Observation:** `muted_lanes_set` removed every element on a muted lane from preview
  and export, so a lane could not be silenced while its picture stayed visible, or
  hidden while its sound kept playing (Cardboard-style M and eye track controls).
- **Decision:** Extended the existing tool rather than adding an overlapping one.
  `muted_lane_keys` now silences sound only; the new optional `hidden_lane_keys`
  removes pictures and text. A hidden, unmuted video lane keeps its sound. Both may be
  replaced in one undoable write through the same `PATCH .../muted-lanes` route.
  Authority is unchanged (agent_workspace only; refused on human-edited timelines).
- **Compatibility:** Metadata without `hidden_lane_keys` is legacy: each muted lane that
  holds a visual element reads as hidden as well, so older projects look and export the
  same. Existing callers that send only `muted_lane_keys` stay valid.
- **Verification:** `src/lib/local-store/lane-visibility.test.ts` covers migration,
  route writes, undo restoration and composition semantics. No live MCP session trial was run.

## 2026-10-12 — Square 1:1 output shape

- **Observation:** The creator chose 9:16, 4:5, 1:1 and 16:9 as the supported output
  shapes (1:1 for square feed posts and carousels). `output_format_set`,
  `assembly_create`, `audition_create` and the `set_output_format` proposal operation
  accepted only 9:16, 4:5 and 16:9.
- **Decision:** Extended the existing enums instead of adding a tool. The shapes come
  from one list, `TIMELINE_ASPECT_RATIO_VALUES` in `src/lib/aspect-ratios.ts`, which
  the routes, proposal schema and metadata sanitizers share; `mcp/server.mjs` mirrors it
  as `OUTPUT_ASPECT_RATIOS`. A 1:1 canvas is 1080×1080 and exports at 480–2160 square.
  Authority is unchanged.
- **Verification:** `project-creation.test.ts`, `metadata.test.ts`,
  `export-resolution.test.ts` and `useTimelineViewport.test.ts` cover 1:1;
  `pnpm verify:export-resolution` now exports the size pattern on every supported canvas
  on both renderers. No live MCP session trial was run.
