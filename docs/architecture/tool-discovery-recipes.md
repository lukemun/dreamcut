# Tool discovery and executable recipes

A capability tool exposes reusable preparation or editing behavior. An effect recipe
composes those capabilities into a named treatment. Skills guide creative choices;
known arithmetic and dependency binding belong in deterministic code. Do not add one
MCP tool per visual look or merge unrelated actions into an unrestricted execution tool.

## Catalog ownership

`docs/tools/registry.json` owns tool families, authority and evolution links.
`docs/effects/catalog.json` owns visual reference entries and their maturity.
`docs/effects/executable-recipes.json` owns executable recipe IDs, exact versions,
requirements and implementation links. A catalog reference or skill is not automatically
an executable recipe. No duplicate tool definitions are stored in these catalogs.

`capability_catalog` searches all three, plus the creator features inside
`proposal_create` (below), with bounded pagination. `get` returns an exact entry and the
schemas of its tools that this session has not registered yet; a registered tool is named
with `registered: true` because its schema is already in `tools/list`. When two returned
tools share a large property schema, the second carries `same_schema_as` pointing at the
first (`proposal_spatial_preflight` takes `proposal_create`'s proposal body). `get` on a
feature returns only that field's schema. `load` accepts a capability family ID and enables
that family's schemas in this MCP session, returns them in full, then emits
`notifications/tools/list_changed`. Clients must request/register the updated `tools/list`;
schemas in response text alone are insufficient. No per-project data or private evidence
is included in discovery.

## Everyday language in search

Each capability family declares `search_aliases` in the tool registry. For example,
masking, rotoscoping, background removal and isolating a person find cutout preparation;
subtitles find speech preparation and scratch pad finds cutout treatments. Recipes and
effect entries can also declare aliases. The registry check requires nonempty, unique
aliases for each capability family.

Search normalizes case, punctuation and Unicode compatibility characters, removes a
small set of conversational filler words and plural endings, and matches the remaining
words against names, IDs, tool names, aliases, recipe names, skills and effect inputs.
Capability, recipe and effect entries do not read tool or field descriptions; a capability
is findable only through its aliases. Exact names/IDs/aliases rank first. Next come
entries containing a whole alias phrase from the request, compared on content words (so
"trim the clip" contains the alias "trim clip") with longer phrases ranking higher; then
entries matching at least half of the request's words, by the share matched. Ties retain
catalog order (capabilities, recipes, effects, features) and pagination. It does not
search authority/status metadata.

Feature entries (`kind: "feature"`, `mcp/feature-index.mjs`) make the edits inside
`proposal_create` findable. They are derived, not listed by hand: each operation kind,
`patch` field and top-level `props` field in `mcp/proposal-schema.json`, plus
`timing_controls`. Each result names the owning `capability` (`proposal-authoring`), the
`tool` and the exact `field_path`, such as
`proposal.options[].operations[].props.media_scale`, with the field description's first
sentence. A feature is searchable by its field name, its schema description, its child
field names and enum values, and its labels from the control registries
(`EFFECT_CONTROLS` and `PROPOSAL_TUNABLE_FIELDS`, snapshotted in `mcp/feature-labels.json`;
regenerate with `node --import tsx mcp/feature-index.mjs --write-labels`). Describing a
proposal field therefore makes it searchable. `FEATURE_VOCABULARY` adds creator wording
("cut out the silence" → `source_range_cut`, "green screen" → `props.chroma_key_color`)
only to features that exist; its test rejects a key naming no derived feature. Feature
cases (`docs/tools/feature-cases.json`) pin the requests each capability must answer; a
feature entry reaches its owning capability.
This is deterministic vocabulary matching, not semantic understanding, typo correction
or multilingual translation. Unrecognized wording can still return no matches. Ambiguous
terms can return multiple candidates; the agent chooses based on their requirements.
Discovery neither loads tools nor changes permissions, including for blocked families.

## Profiles and authority

Start the editing operator with:

```sh
node mcp/server.mjs --profile=editing
```

Or set `DREAMCUT_TOOL_PROFILE=editing` in its MCP server environment. The repository `.mcp.json` currently selects `full` until a real client passes the refresh probe. Direct invocations without a profile
default to `full` for compatibility. Restart/reconnect to change startup configuration;
this does not modify an already-running client's registered tools.

Editing starts with 11 tools: discovery, timeline context, feedback accounting, proposal
read/create/preview/preflight and recipe compilation. Families load only as needed.
For a bounded harness, set comma-separated `DREAMCUT_TOOL_FAMILIES` to its maximum
permitted families. Omitted/empty means all families are permitted; it does not mean a
restricted sandbox. Unknown profile/family names fail startup. Hidden calls fail until
loaded. Loading never grants workspace authority or human approval powers. The normal
project-aware write gate remains required after exposure checks.

Use `--catalog --profile=full` or `--catalog --profile=editing` for static clients and
measurement. Both report the complete catalog fingerprint. Static runners (including
the current Codex trial adapter) register tools before starting a run; they do not gain
dynamic tool registration just because the MCP supports list changes. Do not silently
fall back to arbitrary shell/code when a capability is missing.

## First executable recipe

`recipe_compile` with `recipe_id: prepared-reveal-sequence`, `recipe_version: 1`,
`project_id` and `inputs` invokes the same compiler as `proposal_reveal_sequence`.
The old name remains compatible; the editing profile uses the recipe entry point.
Its input schema includes the prepared base option, ordered actor bindings and gap/
presence settings. Runtime validation belongs to the shared compiler. The result adds
recipe identity to the ordinary option, mutation count and timing-control output.

The compiler performs no source preparation. Cached assets remain unchanged; source
bounds, linked audio, the 15-slider cap and preview/approval bindings retain their
existing owners. Recompile from the unchanged base option for a new control plan.
Run normal preflight and proposal_create afterward; the human approves in the editor.
This is one supported recipe, not a general dependency language or automatic treatment
builder. See [reveal controls](reveal-sequence-controls.md) for exact limits.

## Comparison and remaining evidence

`pnpm eval:reveals compare-catalogs shared-gap-first` emits one frozen case with full
and editing schemas, fingerprint and UTF-8 sizes. Repeat for
`independent-gaps-followup`. Grade saved outputs using the existing reveal grader.
The packet prescribes identical bounded dispatch authority in both arms: catalog reads/
loads and compilation only, with distractor calls rejected and counted. It does not
launch inference. Keep model/settings, fixture, prompt and permissions fixed; retain all
attempts, actual calls, failures, latency and provider tokens (unknown if absent).
Do not include graders/reference answers in model context.

Transport and compiler tests establish routing, boundaries and structural behavior.
Schema bytes are not tokens, and fewer definitions do not prove a faster or better
agent. Real-footage review and client refresh behavior require separate trials.

[Client tool-refresh eval](../evals/client-tool-refresh.md) defines the isolated runtime
probe and grader. A scripted-client pass proves fixture behavior only.

## Client compatibility boundary

Native Codex sessions currently use the full profile. Attachment and read-only native
calls were verified after project-scoped registration and reconnect. Notification-driven
refresh has not been qualified for that client, so do not enable the editing profile
there based on a server-only test.

The owned eval adapter explicitly refreshes tools/list after loading a family, registers
the returned schemas, and rejects requests for unregistered tools. Its
[progressive-discovery eval](../evals/progressive-tool-discovery.md) is a separate model +
harness trial. This gives future model runners a deterministic integration point without
requiring a native desktop client to handle dynamic list changes. It does not make a
full-profile native call into evidence of progressive discovery.
