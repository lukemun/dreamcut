# Create isolated first assemblies and comparisons — evolution

Capability: `assembly-auditions`. Registry: [registry.json](../registry.json).

## Purpose and boundary

Create isolated first assemblies and comparisons. Bounded new-project grant ends at first human edit.

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

## 2026-10-07 — Close direct authority at first layout handoff

- Observation: A delivered first layout retained direct authority until a human edit,
  allowing agent feedback corrections to bypass proposals.
- Decision: Require `assembly_handoff` before the first review handoff. Persist a
  permanent guard outside history; all subsequent changes require proposals.
- Verification: Store/MCP regression tests cover first handoff without human edits,
  retry, empty-layout refusal, stale grants, history restoration and dispatch races.
  Tool registry and typecheck are checked separately. Chat prose is not an automatic
  handoff signal; agents must call the explicit operation.


Desktop runtime adaptation: the MCP server now launches its fixed allowlist of local
TypeScript helpers with the current Node/Electron executable and tsx, rather than
package-manager scripts absent from the packaged manifest. Existing tool schemas,
allowlists and human approval/workspace gates are unchanged. Selection rejects
unknown scripts; output retention is bounded during capture; timeout terminates the
helper before returning failure. Shared runner tests cover those boundaries. This
launcher change alone does not qualify every helper’s codecs, browser/model runtime
or editorial result.


2026-10-09 — Local helper descendant cleanup: the shared fixed-command runner
now owns a private POSIX process group and terminates it on timeout or helper exit,
including descendants that retain output pipes. Real nested-process fixtures cover
both paths and reject invalid/overflowed deadlines. Tool authority and result shape
are unchanged. This covers ordinary completion and timeout, not abrupt MCP/host death;
Windows retains immediate-child termination and is outside the initial desktop scope.

2026-10-09 — MCP input closure now aborts active fixed local helpers and rejects
new helper launches after closure. An AbortSignal connects transport lifetime to
the existing private-group cleanup owner; disconnected transports suppress late
responses. Tests cover a running helper with nested output-pipe descendants and
pre-aborted admission. Forced MCP termination and service-owned HTTP jobs retain
separate lifetimes and are not covered by this change.

2026-10-09 — Fixed local MCP helpers now register their private process group
with the existing IPC-lifetime crash guard. The canonical guard/watchdog live in
`mcp/`; desktop entry points delegate to them and packaging copies those canonical
modules into the host too. Forced MCP death terminates a running helper and nested
child in real source and relocated-package fixtures. Eighty targeted tests and
tool registry checks pass. No tool authority changes. Separately detached children
and service-owned HTTP operations are not covered by helper-group ownership.

2026-10-10 — `audition_create` failures (audit F8): `scripts/build-take-audition.ts`
installs the shared one-line failure reporter (code AUDITION_BUILD_FAILED) and the handler
maps it through `scriptFailure`; stack frames and absolute paths no longer reach the model.
Specific per-cause codes for audition validation remain future work.

2026-10-13 — Format variants: `assembly_create` gains `copy_source_timeline`. The
creator asked for a vertical short-form version of a finished 16:9 edit;
`source_project_id` was only recorded, so the agent had no route except rebuilding
~300 elements and re-running cutouts. With the flag, the new workspace starts from the
source's live elements, valid transitions, lane order/defaults/visibility, caption safe
area and referenced media plus their ready preparation packages. Media is copy-on-write cloned
(`COPYFILE_FICLONE_FORCE`, or `cp -c` on macOS where libuv returns ENOSYS); a full copy is admitted only when it leaves 5 GiB free.
Preparation records are rewritten for the copies so placement stays ready. The source
project is only read; authority is unchanged (the usual bounded workspace grant, closed
at handoff). Absolute provenance paths (caption alignments, cutout evidence) still point
at the source project. `assembly-workspaces.test.ts` covers the copy, URL rewrite,
dropped removed elements, unreferenced media, clone mode on macOS and the missing-source
refusal. First live use (talking-points-intro → vertical) fell back to a 4 GB copy before the
macOS fix; the copies were swapped for verified clones afterwards.
