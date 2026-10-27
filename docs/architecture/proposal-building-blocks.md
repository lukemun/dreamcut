# Proposal building blocks

[Architecture overview](README.md) · [Proposals](proposals.md) · [Editable parameter contract](../standards/editable-parameter-contract.md)

Status: proposed 2026-10-27; **phase 1 built 2026-10-27** on the owner's word (an exception to
the 2026-10-24 feature freeze). What exists:

- Registry and kit: `src/lib/agent/proposal-blocks.ts` (registry, settings contract, compile,
  range validation, card dials) and `proposal-block-kit.ts` (setting types, frame snapping,
  derived element ids). Blocks: `live_hold@1`, `keyframed_move@1`, `hop_sequence@1` in
  `proposal-blocks-hops.ts`.
- Schema: `option.blocks[] = {block_id, kind, version, inputs, settings}`; the server sets `seed`
  (from `expected_revision`) and `frame_rate`. Raw operations stay in `option.operations`; an
  explicit `operations@1` block is hoisted into it. Compiled operations carry `block_ref` and
  are appended after the authored ones; created clips record `props.block_ref`.
- One path: the option schema compiles blocks on every parse, so
  `applyProposalReviewOverrides` (`target: "block"`, block index, `field` = setting or
  `setting.N`) → parse → `deriveProposalTimeline` serves preview, review rows, tuning and
  Apply. Settings are the card's dials from the registry (`control_tier`, `control_display`,
  `control_choices` on the review row); compiled clips expose no dials of their own.
- `proposal_create` compiles each block as authored and at every setting's minimum and
  maximum (every choice), refusing by block, setting and value.

Blocks may declare `sections` (time-ordered beats, named by place) and `hop_sequence` does:
streak length, blur and direction are per hop beside the hold that follows. Not yet: a per-hop
travel dial, phases 2–3 and live blocks. The hop blocks' limits are recorded in
[the capability's evolution record](../tools/evolution/proposal-authoring.md).

**Scope: every proposal**, not one effect. Cuts, captions, grades, sound, transitions, motion
graphics, generated media and effects all become blocks with settings, compiled again at
every preview, dial move and approval. The speed hops are the first worked example because
they show the problem most clearly.

## Why

A proposal today is a list of low-level operations: clip times, source windows, raw
keyframes. The card's dials can only reach fields those operations contain. Whatever an agent
proposes, the settings that matter to the creator are gone by the time the card exists:
- a pacing pass: "how tight", "keep breaths";
- captions: "words per line", "how far from the face";
- a grade: "warmth", "how strong";
- an effect: "how long each hop takes", "blur relative to the subject".

Each new dial then needs an adapter that works backwards from the low-level fields.

The Speed Entrance & Exit work on 2026-10-27 shows the cost.

- **Adapters, one per missing dial:**
  - **Hop length:** rescales keyframe times (`keyframe_span_seconds`).
  - **Comes in from:** mirrors a position keyframe (`motion_from_side`).
  - **Shared blur:** a linked dial that only works when every hop has the same value. The
    card ended up with five Blur dials instead of one.
  - **Speed at stops:** has no field to attach to, so it still does not exist.
- **Hand-built payloads:** the agent generated each card with a throwaway script and pasted
  23–31 KB of JSON per version. 13 of 22 attempts were refused: overlaps, lane order, frame
  rounding, timing-binding rules. These are all things a compiler would get right by
  construction.
- **Rounding:** times the agent computed in floating point failed exact-match checks. Even a
  frames dial failed at its own minimum.

The [parameter contract](../standards/editable-parameter-contract.md#composition-and-dependencies)
already says to "declare once, bind many" and to resolve dependencies in a bounded
compiler. What is missing is *when* compiling happens. The existing compilers run once,
when the card is drafted, and hand back fixed operations. This design keeps the settings
and compiles them again on every preview, dial move and approval.

## Today

| Layer | What it holds | When it compiles |
| --- | --- | --- |
| Operations (`create_visual`, `patch`, …) | Low-level values | — |
| Review controls, derived fields | Dials on operation fields; a few adapters (`motion_from_side`, keyframe envelopes) | On every override |
| Timing controls | Linear bindings: `offset + multiplier × value`, frame-quantised, integer multipliers for holds | On every override |
| Compile tools (`caption_proposal_compile`, `proposal_reveal_sequence`, `framing_compile`) | Settings in, operations out, stored through `operations_from` | **Once**, at `proposal_create` |
| Subject entrance envelope (`subject_*_seconds` in `proposal-subject-entrance.ts`) | Three settings that compile into native keyframes | **On every override and derivation**: the one existing example of this design |

## Proposal

### A block

A block is a registered, versioned unit with:

- **Kind and version**, for example `keyframed_move@1`. A proposal pins the version it was
  drafted with.
- **Inputs:** references the agent prepares beforehand: source paths, cut-out receipts,
  marks or timing anchors, measured subject boxes, settle and takeoff frames. Inputs are
  data, never detectors. Compiling never runs a model, a segmentation or a measurement.
- **Settings:** typed values declared once in the block's registry entry. Each has a unit,
  range, step, default, an **off position** for any visible motion, a creator label, and
  whether it is shared across instances or set per instance. This is the same shape as
  `EFFECT_CONTROLS` entries.
- **A compiler:** `compile(inputs, settings, context) → operations` (plus lane order). It is
  pure and deterministic, and fast enough to run on every dial move. It snaps every time it
  produces to the project frame grid. Element ids are derived from the block id, the role
  and the index, so the same clip keeps its id while the creator tunes.

### In a proposal

An option is made of `blocks: [{ block_id, kind, version, inputs, settings }]`. Today's
operations become the lowest block, `operations@1`: its settings are the operation fields
themselves, and its compiler passes them through. Existing cards and exact dictates ("cut at
12.4 s") keep working unchanged, and every other block compiles down to the same operations.

```text
proposal option
  └─ blocks[]      (settings + inputs, as authored; raw operations are the operations@1 block)

preview / dial move / approve:
  overrides ──► block settings ──► compile each block ──► operations
                                                          ──► existing validation
                                                          ──► deriveProposalTimeline
```

- **One derivation path.** Overrides address block settings (`target: "block"`,
  `block_id`, `field`). Preview, review rows, Apply and Undo all go through
  `applyProposalReviewOverrides` → compile → `deriveProposalTimeline`. That keeps the
  AGENTS.md rule that preview and approval derive the same result.
- **Dials are settings.** A block's settings become card dials without a separate
  `review_controls` list. Shared settings are one dial for every instance; per-instance
  settings go to Advanced. The block registry chooses which settings are main, within the
  15-slider limit.
- **Dials read in time order, one section per beat.** A block whose result unfolds in
  beats (hops, caption lines, a reveal sequence, a pacing pass) emits one section per beat,
  in timeline order. Each section holds every dial for that beat: a hop's streak, blur and
  the hold that follows it. Sections are named by place or content the creator can see
  ("Swings → path", "Line 3"), never by internal numbering such as marks the creator may
  since have cleared. Settings shared by every beat sit in a first section ahead of them.
  Creator request, 2026-10-27: the speed-hop card listed every hold together, then every
  blur, so the creator could not tell which dials belonged to which hop.
- **Validation at draft time.** `proposal_create` compiles the block at its defaults and at
  each setting's minimum and maximum, one at a time (as hold controls are checked today),
  and refuses only when a setting's advertised range cannot compile. Refusals name the block,
  the setting and the value ("Hop 3 travel at 150% leaves Mark 4's source window"), never an
  operation index.
- **Mutation budget.** It counts compiled operations, as the subject entrance does today.

### After Apply

- **Phase 1:** Apply bakes the compiled operations into ordinary clips, exactly as today.
  The proposal record keeps the block instance. Each created element records `block_ref`
  (block id and role), so a later card or the agent can reopen the same settings instead of
  reverse-engineering clips.
- **Later:** blocks stay live on the timeline and the inspector shows their settings.
  That is out of scope here. It needs a timeline-level owner for compiled elements and rules
  for a creator's direct edits to them.

## Every kind of proposal

Each row is a candidate block. Its settings are the dials the creator thinks in; its compiler
emits today's operations, shown in the second column.

| Proposal kind | Compiles to today's operations | Settings that become dials (examples) |
| --- | --- | --- |
| Exact dictate, one-off change | Any operation | The operation's own fields (`operations@1`) |
| Pacing, silence and filler cuts | `source_range_cut`, `source_range_restore` | How tight (pause kept, in frames), keep breaths, filler words on or off, per-cut nudge in Advanced |
| Take selection and joins | `create_visual`, `patch`, `sync_speech_visual` | Which take per line, join offset per boundary |
| Captions | `replace_captions` | Look preset, words per line, position from the face, size, emphasis |
| Colour grade | `patch` grade fields | Look, strength (0 = off), warmth, contrast; per-clip match in Advanced |
| Speed ramp | `speed_change` | Top speed, ease in, ease out, where the slowdown lands |
| Transition | `create_transition` | Type, length in frames, direction, zoom pulse (0 = off) |
| Music and sound effects | `create_audio`, `patch` | Level, duck under speech, fade in and out, hit offset from its picture cue |
| Text, titles, lower thirds | `create_text`, `create_shape` | Text, style preset, position anchor, entrance (off by default), hold |
| Framing, push-ins | `patch` media transform keyframes | Region, zoom amount, timing |
| Generated or imported media placement | `create_visual`, `create_audio` | In point, length, position, fit |
| Effects (subject entrance, reveal sequence, speed hops, …) | `create_visual` keyframes and timing | The effect's own settings, as below |

What this changes everywhere, not just for effects:

- **Dials come from the registry, not from guessing.** Today the server picks main dials from
  whichever fields an option touches. With blocks, each kind declares its main settings, so
  a pacing card leads with "how tight", not with forty cut boundaries.
- **The agent writes intent plus measured inputs.** It sends "pacing, keep breaths, inputs:
  transcript alignment". It does not compute every cut boundary, caption cue or keyframe and
  paste them. The compile tools that exist (captions, framing, reveal sequences) become
  blocks rather than one-time generators.
- **Frame rounding, lane order and overlap rules live in one place:** the compilers. They
  stop being refusals the agent has to learn.
- **Several requests in one pass** stay several independent cards. Each card is one block,
  or a few blocks that depend on each other, so the "every pending card applies on its own"
  rule is unchanged.
- **My Style and recipes** become preset setting values for a block kind ("my caption look",
  "my pacing"). Today they are prose the agent has to translate into operations.

## First worked example: speed hops

Three blocks, named for what they do rather than for this effect. Each is usable by any
effect:

| Block | Purpose | Inputs |
| --- | --- | --- |
| `live_hold` | A window of real footage between two measured frames | Source, settle frame, takeoff frame |
| `keyframed_move` | An alpha clip moving between two placements over a few frames, with blur and fade | Cut-out receipt, start and end subject boxes (or an off-frame side), source frame |
| `hop_sequence` | Orders holds and moves across stops and owns their shared settings | Ordered stops, each with a cut-out receipt, subject box, settle and takeoff frames; the empty set; the closing line |

The agent's whole card becomes roughly:

```json
{ "blocks": [{ "block_id": "hops", "kind": "hop_sequence", "version": 1,
  "inputs": { "stops": ["…mark 2…", "…mark 6…"], "empty_set": "…", "line": "…" },
  "settings": { "variant": "out_and_in" } }] }
```

Every other value comes from the defaults below. Each `"…mark N…"` stands for that stop's
inputs (cut-out receipt, subject box, settle and takeoff frames). Settle and takeoff frames are measured beforehand, from
`visual_activity_prepare` motion onsets or the cut-out's mask over time, and passed in as
inputs.

`hop_sequence` settings:

| Setting | Unit, range | Default (off) | Dial |
| --- | --- | --- | --- |
| Variant | Mark to mark, Out and in | Out and in | Main (choice) |
| Streak length | 2–12 frames | 3 | Main; per hop in Advanced |
| Empty beat | 0–12 frames | 4 (0) | Main |
| Travel | 0–150 % of the distance to the edge or next stop | 15 % for Out and in (0 = no move) | Main; per hop in Advanced |
| Blur | 0–100 % of subject height | 33 % (0) | Main, one dial for every hop |
| Fade during streak | 0–100 % | 60 % (0) | Advanced |
| Hold at each stop | 0–3 s | Measured settle-to-takeoff | Main, one per stop |
| Speed at stops | 0.25–1× | 1× (off) | Main |
| Enters from / leaves toward | Left, right, up, down | Direction of travel | First entry main; per hop in Advanced |
| Ease | Linear, ease in, ease out | Ease in out of a stop, ease out into one | Advanced |

Compare this with what the agent built by hand:

| Hand-built today | With the block |
| --- | --- |
| Generator script, 23–31 KB payload per version | A few hundred characters of inputs and settings |
| Overlap, lane-order and rounding refusals | Impossible by construction; the compiler snaps and orders |
| Five blur dials (equal-value linking) | One Blur dial; each hop's pixels follow its subject's height |
| No Speed at stops | A setting: hold length stays in timeline seconds and the source window follows `hold × speed`, so nothing later moves |
| Hops timed from marks | Holds run from measured settle to takeoff frames |

## How it fits existing work

- **[Camera and timing anchors](camera-and-timing-anchors.md):** blocks consume anchors as
  inputs; a later block can follow a camera. Same rule: every piece is general.
- **[Compound effect recipes](compound-effect-recipes.md):** a recipe becomes a block preset,
  meaning named setting values for a block kind. My Style keeps preferring presets, as now.
- **Timing controls and derived fields:** stay for hand-written operations. Blocks use the
  same frame-quantised arithmetic internally but do not expose bindings to the agent.
- **Existing compile tools:** `proposal_reveal_sequence` and the subject entrance envelope
  are the first candidates to become blocks. `caption_proposal_compile` can keep
  `operations_from` for large static cue lists.
- **GPU-first rule:** every operation a block compiles must already pass GPU admission. A
  block adds no renderer features of its own.

## Phases

| Phase | Scope | Acceptance |
| --- | --- | --- |
| 1 (built 2026-10-27) | Block registry; `blocks` in the proposal schema with `operations@1` carrying every existing card unchanged; compile hook in the shared derivation; `live_hold`, `keyframed_move`, `hop_sequence` | Preview equals Apply for defaults, every setting's extremes and reset; Undo restores the timeline, metadata and review states together; refusals name the setting; `pnpm check:parameter-contract` covers block settings; a hop card reviewed in the real editor |
| 2 | Move the subject entrance envelope and `proposal_reveal_sequence` onto blocks | Existing proposal tests pass unchanged against the block versions |
| 2b | The most common proposal kinds: pacing cuts, captions, colour grade, then sound, transitions and text | For each, the creator's main dials match the registry and a real card is reviewed in the editor; agents stop sending raw operations for that kind |
| 3 | `block_ref` reopening: a new card starts from an applied block's settings | Retuning an applied hop sequence produces a card whose defaults equal the applied result |
| Later | Live blocks on the timeline, edited in the inspector | Separate design |

## Open questions

- **Versioning:** keep old compiler versions for pending cards, or migrate settings forward?
  Phase 1 pins `kind@version` per block and refuses an unregistered pair; a new compiler
  version is a new registry entry beside the old one until no pending card names it.
- **Speed:** compile on every dial move must stay well under a frame of interaction time.
  Measure with `perf:check`; cache compiled operations by a hash of the settings.
- **Edits after Apply:** if the creator edits a baked hop clip, does `block_ref` reopening
  respect or discard that edit?
- **Granularity:** is `hop_sequence` one block, or a thin ordering of the other two that
  agents could also compose by hand? Phase 1 does both: `hop_sequence` is one block that calls
  the `live_hold` and `keyframed_move` compilers, and those two are registered on their own.
