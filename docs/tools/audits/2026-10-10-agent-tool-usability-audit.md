# Agent tool usability audit — 2026-10-10

Scope: the 60 agent-facing MCP tools published by `mcp/server.mjs` (full profile,
all families), assessed against [the tool-authoring standard](../../standards/tool-authoring.md)
and [the discovery architecture](../../architecture/tool-discovery-recipes.md).
This is an audit report only. It changes no source, schema or gate. Another change
set is building deterministic gates (`docs/tools/undescribed-fields.json`,
`docs/tools/proposal-props-baseline.json`, `docs/tools/feature-cases.json`); this
report's findings are inputs to those gates, not substitutes for them.

Trigger: on 2026-10-09/10 a `playback_reverse` boolean was added to
`proposal_create` operation props without a field description or catalog alias. A
local model searched `capability_catalog` for "reverse", got no result, guessed
`keyframes: {reverse: true}`, and the harness validator error ("must NOT have
additional properties") did not name the field. That one field has since been fixed
(description at `src/lib/agent/timeline-editor-agent-apply.ts:231`, aliases in the
`proposal-authoring` registry entry). The audit asks how many other features sit in
the same state.

## Summary

| Measure | Value |
| --- | --- |
| Tools published (`--all-tools --profile=full`) | 60 |
| Input fields across all tool schemas | 1,954 |
| Input fields with no `description` | 1,854 (94.9%) |
| `proposal_create` fields / undescribed | 810 / 806 |
| `proposal_create` top-level operation props (`operations[].props.*`) / described | 167 / 1 (`playback_reverse`) |
| `proposal_spatial_preflight` fields / undescribed (duplicate of the proposal schema) | 807 / 804 |
| Serialized tool schemas, all tools | 181 KB (proposal_create alone 76 KB) |
| `capability_catalog` `get proposal-authoring` response | 166 KB |
| Tool descriptions over 3,000 chars | 1 (`proposal_create`, 5,602) |
| Tool descriptions under 120 chars | 3 (`proposal_list` 33, `proposal_get` 70, `assembly_get` 81) |
| Natural creator requests tested against `capability_catalog` search | 88 |
| Requests missing their capability — committed HEAD `1f063f9` | 74 of 88 (all 74 zero-result) |
| Requests missing their capability — working tree during audit | 43 of 88 (25 zero-result, 18 wrong family); 41 after reclassifying two |
| Tools whose failures use typed `tool_error` payloads | 11 of 60 |

Per-dimension scorecard totals (60 tools; detail below):

| Dimension | pass | partial | fail | other |
| --- | --- | --- | --- | --- |
| 1. Tool description | 44 | 15 | 1 | |
| 2. Field documentation | 9 | 44 | 7 | |
| 3. Discoverability | 28 | 25 | 1 | 5 core, 1 n/a |
| 4. Error usefulness | 11 | 44 | 5 | |
| 5. Overlap disambiguation | 47 | 13 | 0 | |

Headline: tool-level descriptions are mostly good — authority, approval and
workspace-only boundaries are stated consistently. The failure is one level down.
Almost every creator-facing feature lives as an undescribed prop inside
`proposal_create`, and capability search cannot see props at all. The reverse
incident was one instance of a general pattern: color grade, chroma key, fades and
volume envelopes, rotation, mirroring, crop, speed steps, stabilization, voice
cleanup, caption styling and text animation are all in the same state today.

## Method

All commands run from the repository root. Snapshot: HEAD `1f063f9`; the working
tree had uncommitted changes from a concurrent session, including
`mcp/capability-catalog.mjs` search scoring and `docs/tools/registry.json` aliases.
Discovery results are therefore reported for both the committed HEAD and the working
tree as of 2026-10-10T16:12Z. Line numbers refer to the working tree at that time.

1. Dump the live catalog:

   ```sh
   DREAMCUT_TOOL_FAMILIES= node mcp/server.mjs --catalog --all-tools --profile=full > catalog.json
   ```

2. Count fields. Recursively walk each `inputSchema` through `properties`, `items`,
   `anyOf`/`oneOf`/`allOf` and object-valued `additionalProperties`. Count every
   property node and whether it has a `description`. This reproduces the baseline of
   1,954/1,854.

3. Run discovery queries against the real search function. A stub selection is
   enough because search does not depend on what is loaded:

   ```js
   const { queryCatalog } = await import(process.env.CATALOG_MODULE); // mcp/capability-catalog.mjs
   const sel = { permitted: new Set(), enabled: new Set(), load() { return []; } };
   const r = queryCatalog({ action: 'search', query: 'fade the music', limit: 20 }, sel, []);
   // hit = r.entries.some(e => e.id === expectedCapabilityId)
   ```

   For HEAD, copy `mcp/capability-catalog.mjs`, `docs/tools/registry.json`,
   `docs/effects/catalog.json` and `docs/effects/executable-recipes.json` from
   `git show HEAD:<path>` into a scratch tree with the same relative layout, then
   point `CATALOG_MODULE` at it. The 88 requests and their expected capabilities are
   the union of the miss table below and these hits: "make it play backward",
   "reverse this clip", "play the clip backwards", "speed ramp", "speed up the
   middle", "add captions", "add subtitles", "transcribe the interview", "word by
   word captions", "cut out the background", "remove the background", "isolate the
   person", "rotate the clip", "add a transition", "whip pan", "film burn", "trim
   the clip", "split the clip", "find the beats", "cut to the music", "import my
   footage", "generate an image", "make an ai video", "outline around the person",
   "white paper outline", "sticker outline", "add a mask", "pin text to a wall",
   "track the text to a surface", "motion tracking", "check the layout for
   overlap", "look at the frames", "show me a screenshot", "describe the footage",
   "compare two takes", "start a new video", "remember my style", "save this look",
   "preview the proposal", "mute a track", "reorder layers", "normalize loudness",
   "proxy not ready", "make previews", "nested clip".

4. Measure `get` cost: `JSON.stringify(queryCatalog({action:'get', id}, sel, catalog.tools)).length`.

5. Probe validator errors without a server. Call `parseEditorAgentProposal` from
   `src/lib/agent/timeline-editor-agent-apply.ts` under `node --import tsx` on a
   minimal schema-2 proposal whose single operation carries
   `props: {keyframes: {reverse: true}}`, `props: {playback_reverse: "yes"}`,
   `props: {grade_temperature: 900}` and `patch: {playback_rate: 0}`.

6. Probe script failure output by calling `node --import tsx scripts/import-media.ts
   --request-base64 <b64 of {"project_id":"zz-audit-nonexistent","source_paths":["/nonexistent.mp4"],"create_if_missing":false}>`.
   This exits before any write.

7. Read handlers and validation code for each tool (`mcp/server.mjs`, the routes
   under `src/app/api/projects/[projectId]/`, `src/lib/agent/*`,
   `src/lib/media-analysis/cutout-preparation.ts`). Scores are reviewer judgment
   against the standard's description requirement: when to use and when not to use,
   required inputs, units and clocks, output meaning, side effects and authority.

Limits: no model was run. Discovery is measured with the deterministic search only,
so a capable model might still recover by loading families and reading schemas, at
the context cost measured in finding F4. Error findings are from code reading plus
the two probes above, not exhaustive per-tool failure injection.

## Ranked findings

| # | Severity | Tool / field | Evidence | Impact on an agent | Recommended fix | Acceptance check |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Critical | `capability_catalog` search ↔ `proposal_create` props | Search indexes only id, name, aliases, tool names, recipe/skill and effect `required_inputs` (`mcp/capability-catalog.mjs:48`). `proposal-authoring` aliases cover proposals, sliders, reveal and reverse/speed only (`docs/tools/registry.json:70`). 41 of 88 natural requests miss in the working tree, 74 of 88 at HEAD, including color grade, chroma key, fades/volume, crop, zoom, flip, rotate, stabilize, voice cleanup, text/title and freeze/hold. | The incident pattern: the agent concludes the feature does not exist, or guesses field names. | Index proposal operation kinds and props as searchable feature entries that return the field path (e.g. `operations[].props.grade_temperature`). Derive labels from the existing control registries (`src/lib/timeline/effect-controls.ts:85-131` has 46 labelled props; `src/lib/agent/proposal-controls.ts:83-128` has 22). Add a `feature-cases.json` case per feature. | Every request in the miss table returns `proposal-authoring` and the specific field path in the top 3. |
| F2 | Critical | `proposal_create` schema (806/810 undescribed) | Only `project_id`, `proposal`, `personal_style` and `props.playback_reverse` carry descriptions. These required top-level proposal fields are undescribed: `mode` (`workshop`/`production_finish`), `decision` (`propose`/`no_change`/`blocked`), `caps.max_mutations`/`requested_mutations`/`max_renders`, `expected_revision`, `rebase_policy`, `options[].requested_mutations`. | The agent must infer enum semantics and mutation-counting rules. Any wrong guess fails at runtime. Ranges hide units, e.g. `grade_temperature` is -1…1, not Kelvin (probe: "Too big: expected number to be <=1"). | Add `.describe()` in the zod schema (`src/lib/agent/timeline-editor-agent-apply.ts:1086` onward) and regenerate `mcp/proposal-schema.json`. Generate prop descriptions from the control registries' label, range, unit and identity so they cannot drift. | Undescribed-field ratchet: 0 for required fields and for every prop listed in `proposal-props-baseline.json`. |
| F3 | High | Discovery doc vs code | `docs/architecture/tool-discovery-recipes.md:31-32` says search matches "names, IDs, tools, aliases and input descriptions" and "all remaining words". Code does not index any tool input description, and the working-tree scoring now accepts ≥50% term coverage. | Authors may believe adding a field description makes it discoverable. It does not. | Index schema descriptions (see F1), or correct the document in the same change as the scoring change. | A test proving that a described field becomes searchable, or doc text matching the code. |
| F4 | High | `capability_catalog get`, `proposal_spatial_preflight` | `get proposal-authoring` returns 166 KB because it embeds two full copies of the 76 KB proposal schema. The full catalog is 181 KB of schemas, 42% of it from `proposal_create`. `proposal_spatial_preflight` repeats the same schema. | The natural follow-up to a search consumes a large share of a local model's context. That pushes models toward guessing rather than reading. | `get` returns tool summaries plus a field index (path, one-line description), with full schemas on request. Preflight can state "same body as proposal_create" in its description instead of carrying a second copy where clients allow it. | The `get` response for any family is under 20 KB. Matched eval completion does not regress. |
| F5 | High | Routing to the wrong family | Working tree: "cut out the silence", "remove the pause" and "remove background noise" → `cutout-preparation` (SAM segmentation). "fade the music" and "make the music quieter" → `spatial-rhythm`. "delete this part" → `workspace-editing`. "add a transition", "trim", "split" and "aspect ratio" → `workspace-editing` only. On a working timeline these are `proposal_create` operations (`source_range_cut`, `create_transition`, `patch`, `set_output_format`, `set_lane_order`). | The agent loads direct-mutation tools that refuse on working timelines, or queues an expensive segmentation job for an audio request. | Add working-timeline aliases to `proposal-authoring`. Say "assembly workspace only" in the `workspace-editing` outcome text. Return the authority line with search hits so the agent can choose. | "trim the clip", "add a transition" and "make it vertical" rank `proposal-authoring` first. No audio request returns `cutout-preparation`. |
| F6 | High | `element_create`, `element_create_from_source_window` errors | The route returns `{error:"Invalid request body", issues}` (`src/app/api/projects/[projectId]/timeline/elements/route.ts:85`). MCP `http()` forwards only `error` (`mcp/server.mjs:1038-1055`), so the agent sees `POST /api/projects/<id>/timeline/elements failed (400): Invalid request body`. | Validation failure gives no field. The agent retries blindly. | Fold zod issue paths and messages into the error message and typed payload, e.g. a `zodIssuesToMessage` variant that includes paths (`src/lib/api-helpers.ts:3`). | An invalid `lane_key` returns a message naming `lane_key`. |
| F7 | High | `proposal_create` / `proposal_spatial_preflight` unknown fields | The closest-field hint (`mcp/argument-errors.mjs`) is wired only into the owned harness (`mcp/harness-mcp.mjs:49`). The live server does not validate arguments against `inputSchema`. The application validator returns raw zod JSON that names the key but suggests nothing. Probe on `props.keyframes`: `Unrecognized key: "keyframes"`, listed beside a ~200-char UUID regex issue. | A native client (not the harness) gets an unknown-key error with no route to `playback_reverse` / `playback_speed_steps`. | Format zod issues server-side as `path: message`, append `closestFields` suggestions for `unrecognized_keys`, and drop regex bodies. | The `props.keyframes` probe returns a message naming `playback_speed_steps` or `playback_reverse` among the suggestions. |
| F8 | High | `media_import`, `audition_create` failures | Handlers throw `result.stderr` verbatim (`mcp/server.mjs:235`, `:961`). The probe shows a top-level throw in `scripts/import-media.ts:71` producing a full Node stack trace with absolute repository and `node_modules` paths (stderr up to 50 KB, `mcp/local-script-runner.mjs:50`). | Leaks local paths into model context and transcripts, and buries the one-line cause. Violates "Unknown failures return a safe diagnostic ID". | Scripts catch and print one JSON error line (`code`, `message`, `recovery`). The handler maps it to `toolError` and never forwards stack text. | The probe returns `Missing media source: /nonexistent.mp4` with a typed code and no stack frames. |
| F9 | Medium | `run_instrument` | A non-zero exit resolves as success `{exit_code, stdout, stderr}` with up to 200 KB stdout (`mcp/local-script-runner.mjs:49,58`; handler `mcp/server.mjs:1034`). `extra_args` is a free-form CLI string array (`:1025`) that reaches `--out`, `--proposal-file` and `--base` in `scripts/frame-state.ts:67-133`. | Failures look like successes. Large logs flood context. A shell-string API contradicts "do not make a shell command string the tool API" and "reject unsafe paths". | Replace `extra_args` with typed fields (`at_seconds[]`, `proposal_id`/`option_id`, `warm_renderer`). Return `isError` on non-zero exit. Return the report path relative to project instruments so it feeds `timeline_evidence` directly. | Arbitrary flags are rejected. A failing instrument returns `isError: true`. The returned report path is accepted unchanged by `timeline_evidence`. |
| F10 | Medium | Generic failure classification | `toolFailure` (`mcp/tool-runtime.mjs:4-11`) labels every untyped error `retryable:false`, `state_changed:"unknown"`, recovery `inspect_failure`. Busy errors are untyped, e.g. `Cutout queue busy; retry shortly` (`src/lib/media-analysis/cutout-preparation.ts:133`). The payload contradicts the message. Only 11 of 60 tools emit typed errors. | The agent either gives up on a transient condition or retries deterministic bad input. | Migrate the cutout, proposal and element routes to `toolError(...)` (`src/lib/agent/tool-error.ts`) with BUSY/INVALID_INPUT/STALE codes. | The busy cutout path returns `code:"BUSY", retryable:true`. |
| F11 | Medium | `timeline_get` description | The handler returns `revision` and `editing_context` (`mcp/server.mjs:153-156`; route `.../timeline/route.ts:12`). The description mentions neither. `proposal.expected_revision` is required but undescribed. | The agent may call `editing_memory_get` redundantly. It may not know where `expected_revision` comes from and fail with a stale or invalid value. | Name `revision` (→ `expected_revision`) and `editing_context` (preferences) in the description. Describe `proposal.expected_revision`. | A fresh agent supplies a valid `expected_revision` on the first `proposal_create` in an eval. |
| F12 | Medium | Read/write vocabulary mismatch | Stored element props include `keyframes` (e.g. `props.keyframes.playback_rate`, `src/lib/agent/timeline-editor-agent-apply.ts:1332`) and `timeline_get` returns them. Proposal props reject `keyframes`, but `clear_props` accepts it. | Copying shapes from `timeline_get` into a proposal is the natural move, and it fails. This is the exact guess made in the incident. | Describe `operations[].props` as a closed write vocabulary and list the mappings (`keyframes.playback_rate` ↔ `playback_speed_steps`; animated tracks ↔ `transition_keyframes` / `*_keyframes`). | A feature case for "copy an existing speed curve" passes. |
| F13 | Medium | Thin descriptions | `proposal_list` (33 chars), `proposal_get` (70), `assembly_get` (81). None states output fields, staleness semantics or when to use it instead of `proposal_preview`. | The agent cannot tell whether `proposal_list` shows stale or superseded drafts, or where `tuned_baseline` lives. | Add output meaning: status, `stale`/`stale_reason`, `supersedes_proposal_ids`, the pending filter, and `tuned_baseline` in `proposal_get`. | Descriptions are ≥120 chars and name their output fields. |
| F14 | Medium | Untyped object inputs | `element_create.element` ("copy the key list off an existing element"), `element_props_patch.props`, `elements_batch.operations[].props`, `transition_patch.patch`, `personal_style_save.style/existing`, `proposal_reveal_sequence.option`, `asset_generation_prepare.draft.settings`. | Workspace tools expose the 167-prop vocabulary with no schema at all. Errors arrive late and, per F6, without detail. | Reuse the proposal prop schema (or a shared prop schema) for workspace props. Give `style`/`existing` explicit properties. | Field ratchet covers these objects. |
| F15 | Medium | Units and clocks | `cutout_prepare.start_seconds/end_seconds/prompt_seconds` do not say source or timeline (surface tracking does). `editing_feedback_record.targets.timeline_range` has no clock. `surface_track_prepare` uses camelCase `parentId/start/end` without `_seconds`. In `proposal_create`, `volume_envelope[].time_seconds` (clip-relative), `transition_keyframes[].t` (clip-relative, ≤ clip duration, enforced at `timeline-editor-agent-apply.ts:1326`) and `playback_speed_steps[].source_t` (source clock) all differ, all undescribed. | Clock confusion is the most likely silent error: a valid call that produces the wrong edit. | State the clock in every time field's description using one convention ("source seconds", "timeline seconds", "clip-relative seconds"). | A lint flags any `*seconds*`/`t`/`time*` field without a clock word. |
| F16 | Low | `proposal_reveal_sequence` vs `recipe_compile` | Same compiler and the same inputs (`mcp/server.mjs` `TOOLS.recipe_compile`). The older tool's description does not say it is the legacy alias. | Two tools for one outcome: the agent may alternate between them, or split evidence across them. | Mark `proposal_reveal_sequence` as a compatibility alias of `recipe_compile` in its description. | Description names `recipe_compile`. |
| F17 | Low | Lexical fragility | HEAD had no stemming ("backwards" ≠ "backward"; "take" ≠ "takes") and required every non-filler word. The working tree fixes some of this but now matches broadly on generic words: "rotate the clip" and "crossfade between clips" hit `proposal-authoring` only through the alias token "clip"; "ken burns" → `FX-FILM-BURN`; "green screen" → `FX-14` (floating screen). | Over-matching can rank irrelevant entries first, which is costly with `get` at 166 KB. | Down-weight tokens that appear in many entries (clip, video, text). Prefer alias-phrase hits. | Precision@1 tracked alongside recall in the feature-case gate. |
| F18 | Low | Overlap: preview vs preflight vs spatial_assess | Preflight states "BEFORE proposal_create … Nothing is persisted". `proposal_preview` never says it requires saved proposals. `spatial_assess` with `proposal_id` repeats preview's spatial section. | Mild: the agent may call `proposal_preview` on a draft and get a not-found error. | Add one sentence to each tool: draft → preflight; saved → preview; whole cut → spatial_assess. | Descriptions cross-reference each other. |
| F19 | Low | `compound_prepare` dual mode | Without `proposal_id` it "creates the existing reviewable grouping proposal". This is a proposal-creating path outside `proposal_create`, with no `responds_to_feedback_ids`. | Feedback accounting can miss this work. | Accept `responds_to_feedback_ids`, or document that the agent must link it with `editing_feedback_disposition`. | `editing_feedback_check` accounts for a compound-created proposal. |

## Per-tool scorecard

Columns: D = description (when/not, inputs, units/clocks, output, authority, length),
F = field documentation, S = discoverability via `capability_catalog` search for the
owning family (working tree), E = error usefulness, O = overlap disambiguation.
"core" = always loaded in the editing profile, so search is not required to reach
the tool, though its features may still need search (see F1).

| Tool | Family | Desc chars | Undescribed / fields | D | F | S | E | O | Key evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `asset_generation_prepare` | media-intake-generation | 631 | 14/17 | pass | partial | pass | partial | pass | `draft` documented as one prose blob; `modelId`, `resolution`, `settings` undescribed |
| `assembly_create` | assembly-auditions | 599 | 12/14 | pass | partial | pass | partial | pass | `source_path` vs `source_url`, `source_project_id`, `script_text` undescribed |
| `assembly_handoff` | assembly-auditions | 313 | 0/1 | pass | pass | pass | partial | pass | Clear authority and irreversibility |
| `assembly_get` | assembly-auditions | 81 (<120) | 0/1 | partial | pass | pass | partial | pass | 81 chars; output fields not named |
| `timeline_get` | editing-context | 275 | 0/1 | partial | pass | core | partial | partial | Omits that it returns `revision` (for expected_revision) and `editing_context` (preferences) |
| `beat_grid_get` | spatial-rhythm | 259 | 1/2 | pass | partial | partial | partial | pass | `element_id` kinds undescribed; "sync cuts to the beat" misses |
| `beat_annotation_prepare` | spatial-rhythm | 291 | 1/2 | pass | partial | partial | partial | pass | Runtime prerequisite stated (librosa, 30 min) |
| `library_present` | media-intake-generation | 552 | 5/8 | pass | partial | partial | pass | pass | Typed LIBRARY_PRESENTATION_FAILED; `asset_id` origin undescribed |
| `video_search` | media-intake-generation | 564 | 3/4 | pass | partial | partial | partial | pass | "find clips of a dog" returns nothing |
| `media_import` | media-intake-generation | 488 | 5/6 | pass | partial | pass | fail | pass | Failure returns raw Node stack trace with absolute paths |
| `spatial_assess` | spatial-rhythm | 1168 | 2/3 | partial | partial | pass | partial | partial | 1,168 chars of output semantics; no "use preflight for drafts" pointer |
| `editing_feedback_record` | editing-context | 473 | 14/15 | pass | partial | partial | partial | pass | `timeline_range` clock unstated; session/turn/ordinal only in prose |
| `editing_feedback_check` | editing-context | 229 | 0/1 | pass | pass | partial | partial | pass |  |
| `editing_feedback_disposition` | editing-context | 236 | 6/7 | pass | partial | partial | partial | pass | `feedback_id` source (event_id) implied only |
| `personal_style_list` | editing-context | 149 | 0/1 | partial | pass | pass | partial | pass | Output not described |
| `personal_style_get` | editing-context | 246 | 1/2 | pass | partial | pass | partial | pass |  |
| `personal_style_save` | editing-context | 324 | 2/3 | pass | fail | pass | partial | pass | `style` and `existing` are untyped objects; shape lives only in prose |
| `editing_memory_get` | editing-context | 214 | 0/1 | partial | pass | pass | partial | partial | Does not say timeline_get already includes the same context |
| `elements_batch` | workspace-editing | 805 | 1/7 | pass | partial | partial | partial | pass | `props` open object; 167-prop vocabulary undocumented here |
| `element_create` | workspace-editing | 913 | 0/3 | pass | fail | partial | fail | pass | `element` untyped ("copy the key list off an existing element"); route `issues` dropped |
| `element_create_from_source_window` | workspace-editing | 713 | 3/6 | pass | partial | partial | fail | pass | Good clock wording; same dropped-issues route |
| `element_trim` | workspace-editing | 567 | 2/7 | pass | pass | pass | partial | pass | Exemplary clock description on `source_seconds` |
| `element_props_patch` | workspace-editing | 522 | 2/4 | partial | fail | partial | partial | pass | `props` untyped; no pointer to prop vocabulary |
| `element_delete` | workspace-editing | 387 | 1/3 | pass | partial | partial | partial | pass |  |
| `element_restore` | workspace-editing | 390 | 1/3 | pass | partial | partial | partial | pass |  |
| `element_split` | workspace-editing | 396 | 1/4 | pass | pass | pass | partial | pass | `at_seconds` = timeline time, stated |
| `element_duplicate` | workspace-editing | 355 | 1/3 | partial | partial | partial | partial | pass | "onto free space": placement rule unexplained |
| `element_normalize` | workspace-editing | 492 | 1/3 | pass | partial | pass | partial | pass | LUFS targets stated |
| `transition_create` | workspace-editing | 650 | 3/7 | pass | partial | partial | partial | partial | Search for "transition" routes here even on working timelines |
| `transition_patch` | workspace-editing | 373 | 2/4 | partial | fail | partial | partial | pass | `patch` untyped |
| `transition_delete` | workspace-editing | 338 | 1/3 | pass | partial | partial | partial | pass |  |
| `lane_order_set` | workspace-editing | 382 | 1/3 | pass | partial | pass | partial | pass | Lane key source not stated |
| `muted_lanes_set` | workspace-editing | 460 | 1/3 | pass | partial | pass | partial | pass |  |
| `output_format_set` | workspace-editing | 491 | 2/4 | pass | partial | partial | partial | partial | "make it vertical"/"change to 9:16" miss; `delivery_target` not enumerated here |
| `asset_preparation_status` | media-readiness | 149 | 1/2 | partial | partial | partial | pass | pass | 149 chars; output states not enumerated |
| `caption_proposal_compile` | speech-preparation | 357 | 9/10 | pass | partial | pass | pass | pass | `style.*` strings lack the enums proposal_create has |
| `speech_prepare` | speech-preparation | 285 | 4/5 | pass | partial | pass | pass | pass | `source` format (project-media-relative path) undescribed |
| `cutout_treatment_prepare` | cutout-treatment | 295 | 4/5 | pass | partial | pass | pass | pass |  |
| `visual_analyze` | visual-evidence | 577 | 13/14 | pass | partial | partial | pass | pass | `evidence.report/page`, `backend` undescribed |
| `timeline_evidence` | visual-evidence | 340 | 2/3 | partial | partial | partial | pass | partial | Does not name run_instrument frame-state as the report producer |
| `audio_waveform_prepare` | media-readiness | 610 | 1/2 | pass | partial | pass | pass | pass | `sources` URL form undescribed |
| `media_readiness` | media-readiness | 262 | 2/3 | pass | partial | pass | pass | pass | `source` must be project-relative (only in error text) |
| `surface_track_prepare` | surface-tracking | 522 | 6/7 | pass | partial | pass | partial | pass | camelCase `parentId/start/end` unsuffixed, unlike *_seconds elsewhere |
| `surface_track_status` | surface-tracking | 224 | 1/2 | pass | partial | pass | partial | pass |  |
| `cutout_prepare` | cutout-preparation | 557 | 13/14 | partial | partial | pass | partial | pass | `start_seconds/end_seconds/prompt_seconds` clock (source vs timeline) unstated; busy error non-retryable |
| `cutout_status` | cutout-preparation | 334 | 1/2 | pass | partial | pass | partial | pass |  |
| `cutout_correct` | cutout-preparation | 491 | 7/8 | pass | partial | pass | partial | pass | Frame range and ROI order stated |
| `source_evidence` | visual-evidence | 330 | 2/3 | pass | partial | partial | partial | pass |  |
| `proposal_reveal_sequence` | proposal-authoring | 786 | 16/17 | pass | partial | pass | partial | partial | Duplicate of recipe_compile; not marked legacy |
| `proposal_work_record` | proposal-authoring | 560 | 7/8 | pass | partial | partial | partial | pass | Action/phase state machine only in prose |
| `proposal_create` | proposal-authoring | 5602 (>3000) | 806/810 | partial | fail | fail | partial | pass | 5,602-char description; 806/810 fields undescribed; props undiscoverable |
| `proposal_spatial_preflight` | proposal-authoring | 894 | 804/807 | pass | fail | core | partial | partial | Duplicates the full 76 KB proposal schema |
| `compound_prepare` | compound-preparation | 495 | 4/5 | pass | partial | pass | partial | partial | Without proposal_id it creates a proposal outside proposal_create |
| `proposal_list` | proposal-authoring | 33 (<120) | 0/1 | fail | pass | core | partial | partial | 33 chars; no output/staleness/status meaning |
| `proposal_get` | proposal-authoring | 70 (<120) | 1/2 | partial | partial | core | partial | partial | 70 chars; `tuned_baseline` mentioned only in proposal_preview |
| `proposal_preview` | proposal-authoring | 427 | 10/11 | partial | partial | core | partial | partial | Does not say "saved proposals only — use preflight for drafts"; override target/field semantics undescribed |
| `audition_create` | assembly-auditions | 831 | 26/29 | pass | partial | partial | fail | pass | 26 undescribed fields incl. required section_id/source_note; raw stderr on failure |
| `run_instrument` | visual-evidence | 734 | 1/3 | pass | fail | partial | fail | pass | Free-form `extra_args`; non-zero exit returned as success |
| `recipe_compile` | proposal-authoring | 361 | 19/20 | pass | partial | pass | pass | partial | Inputs inherit reveal-sequence gaps |
| `capability_catalog` | capability-discovery | 374 | 5/5 | partial | partial | n/a | pass | pass | Query semantics (keyword match, no synonyms) and result shape not described |

Notes on the description dimension: `proposal_create` scores partial rather than fail.
It covers when to use and when not to use, authority, approval and option policy
thoroughly. It is penalized for length, which is paid on every `tools/list`. It also
spreads operation semantics across prose rather than field descriptions, and has no
clock/unit summary for operation fields. Moving the operation-specific guidance into
field descriptions would shorten it and make it searchable.

## Natural requests that missed the catalog

Working tree as of 2026-10-10T16:12Z. "Got" lists what search returned instead (empty = zero results).
The intended route column gives the capability (and field or operation) the request should reach.

| Request | Intended route | Results | Got instead |
| --- | --- | --- | --- |
| "slow this down" | proposal-authoring — `patch.playback_rate` / `props.playback_speed_steps` | 0 | |
| "slow motion" | proposal-authoring — `patch.playback_rate` | 0 | |
| "fade the music" | proposal-authoring — `patch.fade_in/fade_out`, `props.volume_envelope` | 1 | spatial-rhythm |
| "fade out the audio" | proposal-authoring — `patch.fade_out` | 0 | |
| "make the music quieter" | proposal-authoring — `patch.volume` | 1 | spatial-rhythm |
| "duck the music under the voice" | proposal-authoring — `props.volume_envelope` | 0 | |
| "turn down the volume" | proposal-authoring — `patch.volume` | 0 | |
| "green screen" | proposal-authoring — `props.chroma_key_*` | 1 | FX-14 |
| "chroma key" | proposal-authoring — `props.chroma_key_*` | 0 | |
| "color grade" | proposal-authoring — `props.grade_*` | 0 | |
| "make it warmer" | proposal-authoring — `props.grade_temperature` | 0 | |
| "brighten the shot" | proposal-authoring — `props.grade_exposure_ev` | 3 | FX-14, FX-11, FX-16 |
| "increase saturation" | proposal-authoring — `props.grade_saturation` | 0 | |
| "zoom in" | proposal-authoring — `props.media_scale` | 0 | |
| "crop the video" | proposal-authoring — `props.mask_inset` | 13 | assembly-auditions, media-intake-generation, visual-evidence, … |
| "flip the video horizontally" | proposal-authoring — `props.media_mirror` | 0 | |
| "move it to the top left" | proposal-authoring — `props.semanticLayout.slot` | 0 | |
| "add a title" | proposal-authoring — `create_text` | 3 | media-intake-generation, FX-02, FX-20 |
| "add text" | proposal-authoring — `create_text` | 4 | media-intake-generation, speech-preparation, surface-tracking, FX-05 |
| "text animation" | proposal-authoring — `props.animationIn/animationOut` | 3 | speech-preparation, surface-tracking, FX-05 |
| "lower third" | proposal-authoring — `create_text` + `positionPreset` | 0 | |
| "cut out the silence" | proposal-authoring — `source_range_cut` | 1 | cutout-preparation |
| "remove the pause" | proposal-authoring — `source_range_cut` | 2 | cutout-preparation, FX-20 |
| "delete this part" | proposal-authoring — `source_range_cut` / `remove_visual` | 1 | workspace-editing |
| "stabilize the shaky footage" | proposal-authoring — `use_video_stabilization` | 0 | |
| "clean up the voice" | proposal-authoring — `use_voice_enhancement` | 0 | |
| "remove background noise" | proposal-authoring — `use_voice_enhancement` | 2 | cutout-preparation, FX-20 |
| "enhance audio" | proposal-authoring — `use_voice_enhancement` | 1 | media-readiness |
| "make it vertical" | proposal-authoring — `set_output_format` (workspace: `output_format_set`) | 0 | |
| "change to 9:16" | proposal-authoring — `set_output_format` | 0 | |
| "resize for tiktok" | proposal-authoring — `set_output_format` | 0 | |
| "sync cuts to the beat" | spatial-rhythm — `beat_grid_get` | 0 | |
| "find clips of a dog" | media-intake-generation — `video_search` | 0 | |
| "glow around the subject" | proposal-authoring — `props.subject_glow` | 0 | |
| "blur the background" | proposal-authoring — blur props on a cutout composite | 9 | cutout-preparation, FX-12, … |
| "pick the best take" | assembly-auditions — `audition_create` | 0 | |
| "ken burns" | proposal-authoring — `props.transition_keyframes.media_scale/media_offset_*` | 2 | workspace-editing, FX-FILM-BURN |
| "picture in picture" | proposal-authoring — `create_visual` + `semanticLayout` | 0 | |
| "freeze frame" | proposal-authoring — `timing_controls` kind `hold` | 3 | visual-evidence, native-render-verification, FX-02 |
| "hold on the last frame" | proposal-authoring — `timing_controls` kind `hold` | 0 | |
| "bring to front" | proposal-authoring — `set_lane_order` (workspace: `lane_order_set`) | 1 | media-intake-generation |

Reclassified (not counted in the 41): "undo" returns nothing, which is correct.
History restore is human-only, though a search result explaining that would help.
"crossfade between clips" returned `proposal-authoring`, the correct working-cut route
(`create_transition`), but only through the generic token "clip".

Nominal hits that still mislead: "trim the clip", "split the clip" and "add a
transition" rank `workspace-editing` first. Those tools refuse outside an assembly
workspace (F5). "rotate the clip" reaches `proposal-authoring` only through "clip",
because no alias mentions rotation or `media_orientation`.

At committed HEAD `1f063f9`, only 14 of 88 requests hit. The other 74 returned zero
results, including "make it play backward", "add captions", "add subtitles", "trim
the clip" and "compare two takes".

## Top 15 `proposal_create` props needing descriptions

Selection criteria: the feature is creator-facing, the name is ambiguous about
meaning, units, clock or direction, and the prop is not reachable by search. Proposed
text is derived from the validator ranges and the existing control registries
(`src/lib/timeline/effect-controls.ts`, `src/lib/agent/proposal-controls.ts`,
`src/lib/timeline/*`). Verify each against the owning renderer before adopting it.

| # | Field (`operations[].props.*` unless noted) | Why ambiguous | Proposed description |
| --- | --- | --- | --- |
| 1 | `playback_speed_steps` | `source_t`/`v` are opaque. The source clock is not stated, and neither is the conflict with reverse. | Constant-speed segments on the source clock: each `{source_t, v}` plays at `v`× (0.25–4) from source second `source_t` until the next step. `source_t` must increase. Not combinable with `playback_reverse`. |
| 2 | `volume_envelope` | Clock and gain scale unstated. | Gain automation within the clip: points `{time_seconds, volume}` in clip-relative seconds from 0 to the clip duration, `volume` as a linear multiplier (1 = unchanged, 0 = silent, max 4). Use for fades and ducking inside one clip. |
| 3 | `grade_temperature` | Looks like Kelvin; actually -1…1. | White-balance warmth from -1 (cooler/blue) to 1 (warmer/amber). 0 leaves the picture unchanged. Shown in the editor as Temperature -100…100. |
| 4 | `media_scale` | Relative to what? | Picture zoom relative to the clip's fitted size: 1 = fitted, 2 = twice as large (0.1–3). For a punch-in or zoom, animate it with `transition_keyframes.media_scale`. |
| 5 | `media_offset_x` (and `media_offset_y`) | Unit and sign unknown. | Horizontal position of the picture centre in half-canvas units: 0 = centred, -1 = centre on the left edge, 1 = on the right edge (range -2…2). For `media_offset_y`, positive moves down. Prefer `semanticLayout` unless exact placement is requested. |
| 6 | `mask_inset` | Tuple order and unit unknown. | Crop the picture: `[top, right, bottom, left]` insets as fractions of the frame (0–0.95 each). `[0,0,0,0]` shows the full frame. Soften edges with `mask_feather`. |
| 7 | `media_orientation` | "clockwise" by how much? | Rotate the picture 90° `clockwise` or `counterclockwise`; `original` leaves it unrotated (editor label: Rotate picture). |
| 8 | `media_mirror` | Only `none`/`horizontal`; meaning not obvious. | Mirror the picture left-to-right when `horizontal`; `none` leaves it unchanged. |
| 9 | `chroma_key_tolerance` (with `chroma_key_color`, `_softness`, `_spill`) | Green-screen feature hidden behind "chroma"; scale unknown. | Green/blue-screen removal: how far from `chroma_key_color` a pixel can be and still become transparent (0–1, default 0.18). Raise it if the backdrop remains; lower it if the subject erodes. |
| 10 | `playback_ramp_slow_start_source_seconds` | Clock mixing; "slow start" reads as easing. | Source-clock second where the slowdown begins (editor label: Slowdown starts · source). Measured in the original media, not timeline time. |
| 11 | `timingMode` | Enum values undescribed. | Caption reveal: `phrase` shows the whole cue, `active_word` highlights the word being spoken, `single_word` shows one word at a time. Word modes need `wordTimings`. |
| 12 | `caption_follow_audio` | Boolean with non-obvious coupling. | When true, this caption stays bound to its linked speech clip and retimes with that clip's trims and speed changes. It also forces single-line layout. |
| 13 | `iris_radius` | "radius" of what; default is the maximum. | Oval reveal size: 2 = fully open (no mask, the default), 0 = fully closed. Animate it with `transition_keyframes.iris_radius` for an iris wipe; soften the edge with `iris_feather`. |
| 14 | `semanticLayout` (also `create_visual.semanticLayout`) | The preferred placement path, but undescribed. | Named placement on the 3×5 safe grid: `slot` (e.g. `lower_right`), `size` class (`hero` … `tiny`, `full`) and optional named-slot motion. Deterministic code derives position and scale. Prefer this over raw `media_offset_*`/`absX`. |
| 15 | `transition_keyframes` | Generic name hides that it is the main per-property animation track. | Animate supported visual properties inside the clip: each key (e.g. `media_scale`, `media_opacity`, `iris_radius`) holds `[{t, v, ease}]`, where `t` is clip-relative seconds (≤ clip duration). Captions support `media_offset_x` only. |

Proposal-level fields needing descriptions with the same urgency (required, not
props): `proposal.mode`, `proposal.decision`, `proposal.caps.*`,
`proposal.expected_revision` (sha256 from `timeline_get.revision`),
`proposal.rebase_policy` and `options[].requested_mutations`.

## Strengths worth keeping

- The authority language is consistent. `AGENT_WORKSPACE_ONLY_NOTE` is appended
  centrally (`mcp/server.mjs:1069`). Approval and human-only boundaries appear in
  every relevant description.
- These field descriptions model the clock-explicit style that F15 asks for:
  `element_trim.source_seconds`, `element_split.at_seconds` and
  `library_present.items[].time_seconds`.
- Typed recovery payloads in `media_readiness`, `caption_proposal_compile`, the
  preparation route and `capability_catalog` follow the standard's error shape and
  name the next tool to call.
- The `playback_reverse` fix is complete for its own field: description, aliases,
  and runtime conflict checks that say what to change
  (`timeline-editor-agent-apply.ts:1328-1336`).
