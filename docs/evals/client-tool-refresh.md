# Discover and call a newly exposed tool

Case: `client-tool-refresh-v1`. Fixture/grader version: 2.
Purpose: verify the client side of progressive tool exposure before enabling the editing
profile by default. This is client compatibility, not an editorial quality benchmark.

## Fixture and boundaries

The probe proxies the actual DreamCut MCP server in editing mode, backed by a local fake
HTTP service. Initial tools/list hides cutout_status. Catalog loading enables the real
cutout family and emits the production list-change notification. The only permitted
non-catalog tool call is cutout_status for project `refresh-probe`, job `probe-job`.
It returns a fresh random receipt marker from the fake service. Other calls are blocked.
No editor server, project, real media, model download or segmentation is needed.

Receipt creation refuses overwrite. The run ends on stdin closure or after two minutes;
100 incoming messages is the hard request budget. Receipts contain client-reported
name/version, production source fingerprint, ordered exposure/call events and grading.
They do not store full prompts/tool arguments, credentials or media. Keep them private.

## Run in the actual client being qualified

Register a temporary MCP server named `dreamcut-refresh-probe` in that client. Its
command is `node`, with these arguments (use absolute paths appropriate to the checkout):

```text
/absolute/path/to/DreamCut/mcp/client-refresh-probe.mjs
serve
/absolute/private/path/to/new-receipt.json
```

Use a fresh client connection so initial discovery is captured. Disable other editing
servers for this isolated trial to avoid confusing their tools with the probe. Record
client version and model/settings alongside the receipt. Do not ask the model to manually
refresh schemas using a shell or a separate MCP client: the host must handle discovery.

Give the model this bounded task:

> Use only dreamcut-refresh-probe tools. Find the masking/cutout capability in its
> catalog and load that family. Then use its cutout job-status tool to inspect project
> refresh-probe, job probe-job. Report the returned probe marker. Do not prepare media,
> modify a project, use shell/code, or call another server. If the status tool never
> becomes callable, report that blocker.

Grade the receipt afterward:

```sh
pnpm eval:tool-refresh grade /absolute/private/path/to/new-receipt.json
```

A pass requires this observed order: initial list without cutout_status → list-change
notification → refreshed list containing cutout_status → successful invocation returning
the private per-run marker. Forbidden calls fail the run. Reading schema text alone,
receiving a notification alone or guessing a hidden name does not pass. Preserve failed
receipts; classify a missing refreshed list as a client integration gap, not a model
editing failure. The grader checks transport evidence; a human also confirms the model
reported the returned marker, and that the client wasn't replaced by a scripted driver.

## Automated regression and readiness

`pnpm eval:tool-refresh:check` runs the proxy against a clearly labeled scripted client
and tests missing/reordered evidence and forbidden calls. This establishes fixture and
grader correctness only. Actual Codex/Claude/local harness trials remain pending until
run through their native MCP integrations. The current Codex static dynamic-tool trial
adapter is not a substitute for this test.

After client qualification, run the separate reveal-profile comparison on an isolated
fixture to measure tool-selection quality, latency and provider token usage. A refresh
pass does not establish these improvements or real-footage visual quality.

## Native Codex CLI runner

`pnpm eval:tool-refresh:run <exact-model-id> [editing|full]` launches the installed Codex
CLI with a temporary configuration/auth directory, empty workspace and the native MCP
integration. The runner disables shell, browser, apps, plugins and web-search features;
the proxy independently blocks all non-probe calls. Existing global agent instructions
may still be supplied by the CLI; this is not a VM. Only the copied temporary credential
directory is removed afterward. Private run manifests, requested model/settings, raw
client events, answer, receipt and available token usage remain under
`private/eval-tool-refresh/`. The three-minute runner deadline terminates its process
group. No global Codex configuration is modified.

Use `full` as a baseline: the status tool is visible initially and can be invoked without
refresh. This proves ordinary MCP invocation, not progressive discovery. `editing`
requires the entire refresh chain. Fixture/grader version 2 records explicit family
loading/status calls and rejects runtime failure; old v1 receipts remain historical.

The first GPT-6 Sol attempt on CLI 0.144.4 was rejected by the provider as unsupported
for this ChatGPT account before tool use. This is a model availability blocker, not a
refresh failure. Requested model IDs are retained; no replacement model is silently used.

## Desktop subagent attachment check

Parallel Sol and default-model Codex subagent probes found no DreamCut tools in their
actual tool inventories. Neither could invoke catalog discovery, so these runs are
attachment-blocked, not refresh failures or passes. The repository now has a machine-local
`.codex/config.toml` MCP registration using full exposure; `codex mcp get timeline-editor`
recognizes it. This file uses a local checkout path and is Git-ignored. `.mcp.json` alone
was not evidence of native Codex registration. Reconnect the desktop client and verify
actual callable tools before rerunning the refresh case. CLI config recognition does not
prove desktop activation or subagent inheritance.

After reconnect, the parent session and a GPT-6 Sol subagent both exposed 54 native
DreamCut tools. Native searches for background removal/masking returned cutout preparation.
A read-only timeline call initially failed with the editor server stopped; starting the
normal dev/collector entry point resolved it and the native read succeeded. This verifies
native attachment, subagent inheritance and the full-profile HTTP path. It does not pass
the editing-profile refresh case: cutout_status was present before loading any family.

The [owned-harness progressive discovery case](progressive-tool-discovery.md) tests an
explicit refresh adapter separately. A pass there does not upgrade native-client status.
