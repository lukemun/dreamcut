# ChatGPT desktop local-media trial

This private development integration reuses `bin/dreamcut.mjs`, the local editor
service and the existing MCP dispatcher. It is not a public-directory release.

Run `node packaging/setup-chatgpt-local-trial.mjs` from the checkout. It adds one
entry to the personal marketplace, preserves other entries and backs up the
original catalog. The restricted mode installs a checkout-backed plugin under the user's plugin
directory, with a separate app-data/profile/projects root and cloud ingestion off.
Restricted mode cannot use the published npm runtime because it lacks this policy. Full mode uses npm as described below.
The checkout and Node executable must remain available. It is not a pinned release.

Restart ChatGPT desktop, select the existing personal marketplace source, install
**DreamCut Local Trial**, and start a new locally running chat. Ask it to open
DreamCut. Open the returned link yourself in an ordinary browser. Create a test
project and import synthetic media in that editor before asking for a numeric edit.
No project is created or migrated by setup. Node, repository dependencies and FFmpeg
must already be installed for the relevant editor operations.

## Boundary

`--local-media-only` filters discovery and rejects blocked calls before dispatch.
An explicit result projection returns project/element IDs and numeric timing only;
project names, media paths, captions, transcripts, preferences, waveforms, arbitrary
properties, images and internal errors are omitted. The editor connection must be
HTTP loopback. Family loading, resource reading, generation, media evidence, direct
timeline mutation and approval are unavailable. Numeric proposals still go through
the ordinary validation and human approval path. Trim patches include all four
source/timeline timing fields; styles and arbitrary effect properties are unsupported.

Metadata and user conversation reach OpenAI. This is an MCP boundary, not a sandbox
for ChatGPT's other file, browser or shell tools. Use a local chat with only this
integration for the test; do not upload footage, ask for screenshots or authorize
another tool to inspect project media. Full host-level prevention is not established.
The editor's internal agent and optional cloud services are outside this trial.

## Acceptance

- `node --test mcp/local-media-policy.test.mjs`: projections, blocked dispatch,
  no resource reads, numeric-operation restrictions and loopback links.
- `pnpm check:tools`: existing registry and shared schema contracts.
- Start the installed entry over stdio, confirm restricted instructions, open the
  local editor and read the isolated library.
- In ChatGPT itself, confirm install, tool discovery, one numeric proposal, human
  review/apply, reconnection and attempts to request media. Inspect outbound traffic
  before claiming complete network-egress verification. This interactive gate remains
  separate from protocol smoke tests; macOS success does not qualify Windows.

For removal, uninstall the plugin in ChatGPT and remove only its marketplace entry.
Keep test projects unless the person explicitly asks to delete them. Re-run setup
after changing the bundled skill; restart the local chat after runtime changes.

## Full access

The npm-based `--full-access` upgrade was removed with the npm launcher (2026-10-27). For normal DreamCut
capabilities, connect the agent to a source install instead (README, Install). Rerunning setup restores the
restricted configuration without deleting projects.

`DREAMCUT_PLUGIN_HOME` supports isolated installation tests; ordinary setup uses
the user's home directory.

Official guidance: [local packaging](https://developers.openai.com/plugins/build/plugins),
[desktop-only submission](https://developers.openai.com/plugins/deploy/desktop-only).
Public local-MCP submission requires partner eligibility and separate review.
