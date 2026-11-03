# Choose where projects live and move them into the Library — evolution

Capability: `library-setup`. Registry: [registry.json](../registry.json). Contract:
[DreamCut Library contract](../../standards/library-contract.md).

## Purpose and boundary

Let a creator, usually through their agent, put every project in one visible DreamCut Library that any
DreamCut app opens, and move older projects into it. The tools create a Library only in an empty folder,
save the creator's choice, and move only the projects the creator confirmed from a plan they were shown.
They never delete, merge or overwrite projects and never edit a timeline.

## 2026-10-11 — initial tools

- **Observation:** DreamCut now launches as a local web app run from inside Claude Code and Codex; the
  first-run step of choosing where projects live had no agent-facing surface, and projects sat in the
  repository folder (development) or hidden Application Support (desktop).
- **Decision:** `library_status` (read-only) and `library_setup` (`create`, `use_existing`,
  `plan_migration`, `migrate`) over `src/lib/library/setup.ts`, served by `/api/library`. `migrate`
  requires `confirm: true` and the exact project ids from the plan, so projects added after the plan was
  shown are not moved. In-editor agent access: enabled, because setup is creator-requested and
  non-destructive.
- **Verification:** unit tests cover creation, choosing an existing Library, planning and confirmed
  migration (including refusing ids outside the plan) and status reporting of older folders. The live
  route and MCP round trip were exercised once against a scratch Library.
- **Model evidence (2026-10-11, `library-create`, simulated tools):** Codex gpt-6.1-sol 3/3 (each run read
  `library_status` first), Claude Opus 5.5 3/3 (two runs went straight to `create`, which refuses an
  existing Library, so no harm). Receipts are private under `private/eval-features/`.
- **Acceptance for next change:** add a creator-facing first-run screen in the editor that uses the same
  route; measure a migration request end to end.

## 2026-10-11 — projects for coding agents

- **Observation:** an agent in Claude Code or Codex (the DreamCut plugin) is not bound to a project and had
  no way to find one the creator named: no tool listed projects.
- **Decision:** `library_status` also returns the current projects (id, title, last change; the 100 most
  recent, with `project_count`), from the same resolver the editor uses. Its first call already happens
  at the start of every plugin session, so no new tool. The plugin's `open` skill uses it.
- **Verification:** typecheck; the `/api/library` route change ships in the rebuilt runtime checked by
  `packaging/verify-web-runtime.mjs`.
