# Project model and persistence

[Architecture overview](README.md) · Status: current structural model, reviewed 2026-09-28.

## Responsibility and design decision

The project store owns the durable edit. A project is a folder containing `timeline.json`, `metadata.json`, source/provenance records, media, history, proposals, and renders. The timeline carries editable actors and transitions; metadata supplies lane order, muted lanes, delivery canvas, and other project settings. Together with media bindings they define the working composition.

Keeping this model local and inspectable makes an edit portable and recoverable. It also creates responsibilities a database might otherwise centralize: validation, locking, atomic file replacement, migration, and history capture. The folder is not permission for agents to bypass those mechanisms with file writes.

## State ownership

| State | Authority | Lifetime |
| --- | --- | --- |
| Elements, source windows, effects, transitions | `timeline.json` | Durable working edit |
| Lane order/muting and delivered aspect ratio (9:16, 4:5, 1:1 or 16:9) | `metadata.json` | Durable project configuration |
| Source identity and managed/external binding | Source manifest and unchanged media | Provenance and media authority |
| Proposed operations and review resolution | `proposals/` | Durable review history; pending proposals are not applied edits |
| Before/after states | `history/` | Recovery and undo/redo |
| Proxies, peaks, analysis artifacts | Derived data with input identity | Rebuildable; never a substitute for the edit |
| Selection, workspace layout, unfinished gestures | Editor state or user view preference | Not delivery truth |

## Write and recovery flow

```text
human edit / approved proposal / bounded agent assembly
  → validated operation and project lock
  → before snapshot → safe state write → after snapshot
  → mounted editor reconciles the new state
```

The agent entry path for an existing working cut is the [proposal system](proposals.md). A separate `agent_workspace` grant permits bounded direct first assembly; the first layout handoff or human edit revokes it. It is not a second general-purpose mutation API.

History must restore a coherent project state. For proposal approval, that includes affected proposal resolutions and rebases, not just timeline rows. The store also distinguishes externally changed files for reconciliation, while schema migration supplies compatible read representations. A newer unsupported schema fails closed rather than being guessed at.

## Media and time boundaries

An element references a source and an editable source window. A tail trim is removed source duration, not an absolute endpoint. Preserving handles lets the creator reveal material again without rebuilding a file. A signal- or pixel-changing derivative can be a render authority with provenance and source mapping; an ordinary trim should remain an edit decision.

Independent actors remain independently editable. Continuous speech, linked captions, and speech-bound visual derivatives must agree on their source clock. Disposable transport media may improve decoding but cannot silently replace the visible edit graph. [Playback and rendering](playback-rendering.md) explains how consumers use these bindings.

## Implementation map and contracts

- [store.ts](../../src/lib/local-store/store.ts): project reads/writes, locks, snapshots, restoration, and assembly-grant lifecycle.
- [atomic-json.ts](../../src/lib/local-store/atomic-json.ts): atomic JSON file operations.
- [timeline-migrations.ts](../../src/lib/local-store/timeline-migrations.ts): versioned timeline read compatibility.
- [proposals.ts](../../src/lib/local-store/proposals.ts): persistent proposal records and resolution history.
- [proposal-gate.mjs](../../mcp/proposal-gate.mjs): agent transport authority boundary.
- [Timeline living spec](../timeline-living-spec.md): exact timing and source/derivative semantics.
- [Repository operating guide](../../AGENTS.md): supported mutation paths and approval rules.

This document describes ownership, not a universal multi-file transaction guarantee. Follow the specific operation's lock and recovery implementation; do not infer that every arbitrary filesystem change is atomic.

## First layout handoff

Agents must call `assembly_handoff` before presenting the first assembled layout,
including auditions. This is a review boundary, not approval or export. The store
serializes handoff with writes, refuses an empty layout and records an idempotent
`.assembly-handoff.json` receipt before clearing the grant. This marker lives outside
undoable state: metadata round trips and history restoration cannot reopen authority.
The MCP gate checks it before dispatch; the store also rejects a leased direct write
that arrives after handoff. Human edits and approved proposals remain available.
`assembly_get` reports effective authority, including for legacy briefs.

The runtime cannot infer handoff from arbitrary chat text. The explicit handoff call
is required by the agent contract; once called, closure is mechanically enforced.
Existing workspaces are not automatically marked handed off by opening or reading them.
