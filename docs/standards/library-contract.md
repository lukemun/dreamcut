# DreamCut Library contract

Status: required for every writer of creator content; adopted 2026-10-11, with the gaps listed below. Design
and evidence: [library contract design](../architecture/web-desktop-library-contract.md) and
[findings](../research/2026-10-11-web-ui-local-agent-shared-library.md). Implementation:
[`src/lib/library/`](../../src/lib/library/).

Every DreamCut front end must read and write the same folder without corrupting each other's work: the
local web app and its MCP tools today, a desktop app later, and an older or newer DreamCut on the same
disk. This contract is what makes "open it in the other app and see the same project" true.

## The Library

- A Library is a plain folder (never a macOS package) containing `dreamcut-library.json` and `projects/`.
- **Location:** the creator chooses it. The suggestion is `~/Movies/DreamCut Library` (macOS),
  `%USERPROFILE%\Videos\DreamCut Library` (Windows) or `~/Videos/DreamCut Library` (Linux). DreamCut does
  not create it until the creator confirms. The choice is saved in `<app data>/DreamCut/library.json`;
  `DREAMCUT_LIBRARY_DIR` overrides it, and `TIMELINE_PROJECTS_DIR` still overrides the projects folder
  for development and tests.
- **Marker:** `format: "dreamcut-library"`, `format_version`, `min_reader_version`, `library_id`,
  `created_at`, `created_by`. A reader whose supported format is below `min_reader_version` refuses the
  Library. A reader below `format_version` opens it **read-only** and says why.
- **Creating:** only in an empty or missing folder; never inside a folder that already holds other files.
- **App data is not creator content.** Profiles, agent sessions, journals and settings stay in
  `<app data>/DreamCut`. Media, timelines, history and renders live in the Library.

## Documents

Every authored JSON document in a project follows these rules:

1. **Versioned.** It carries `schema_version`. Readers migrate older versions in order, in memory, and the
   next real write stamps the current version. Migrations are upgrade-only.
2. **Newer is never reinterpreted.** A document newer than the reader opens read-only, or is refused with
   the version it needs. It is never rewritten in an older shape.
3. **Unknown fields survive.** A reader keeps fields it does not understand and writes them back unchanged.
   Validation may reject wrong types on known fields, never the presence of new ones.
4. **Stale writes fail.** Every write names the revision it was planned from (a counter or a content hash).
   A write against a changed document fails, and the writer re-reads; it never overwrites.
5. **Atomic replacement.** Writes go through `writeJsonFileAtomic`: temporary file, flush, rename. Windows
   rename-over-existing has documented partial-failure states, so readers tolerate a leftover
   `.<name>.<pid>.<uuid>.tmp` and never treat it as a document.
6. **No lock files for correctness.** Advisory locks may coordinate work inside one process, but
   correctness relies only on rules 4 and 5. Locks are ignorable and unreliable on sync and network folders.

## Media

- **Managed copies:** imported media lives inside the project (`media/`) as unchanged bytes, with a
  SHA-256 hash in `source-manifest.json`. External references are allowed but are not portable between
  machines or front ends, and are flagged as such.
- **Rebuildable derivatives** (proxies, thumbnails, peaks, analysis) are disposable under the
  [storage lifecycle](storage-lifecycle.md); losing them costs time, never work.

## Migration into a Library

Existing projects move with `planProjectMigration` / `runProjectMigration`:

- **Same volume:** a rename, so nothing is copied and nothing can be half moved.
- **Across volumes:** copy into a hidden staging folder, verify the file count and every byte count, then
  rename into place. Originals are never deleted.
- **Name conflicts:** skipped and reported, never merged or overwritten.

## Fixture corpus

`src/lib/library/library.test.ts` is the start of the contract corpus. It covers:
- creation in paths with spaces and non-ASCII characters;
- refusal of non-empty and existing folders;
- newer (read-only) and unreadable (refused) Libraries;
- unknown marker fields surviving;
- default locations per OS;
- saved choice precedence;
- same-volume moves, cross-volume copies and conflict skips.

Each gap closed below adds its cases here.

## Current conformance (2026-10-11)

| Document | Version | Stale-write guard | Unknown fields | Gap to close |
| --- | --- | --- | --- | --- |
| `dreamcut-library.json` | `format_version` | n/a (rarely written) | Kept | — |
| `timeline.json` | `schema_version` 3, in-order migrations | `expected_revision` (content SHA-256) at the API | Kept on elements during migration | Newer timeline is refused rather than opened read-only |
| `metadata.json` | None | None (written with the timeline) | Kept (2026-10-11); unknown fields never grant behaviour | Add `schema_version`; guard writes |
| `storyboard.json` | `schema_version` 1 | `revision` counter | Kept (2026-10-11); agent draft input stays strict | A newer version is refused with a clear message; open it read-only instead |
| `source-manifest.json` | `schema_version` 1 | None | Kept in assets | A newer version is refused with a clear message (2026-10-11); it stores `project_id`, so renaming a project folder breaks it; add a guard for concurrent imports |
| `proposals/*.json` | `PROPOSAL_RECORD_VERSION` | Per-record status checks | Not audited | Audit |
| Other project files (`memory/`, `history/`, `source-notes.json`, `workspace-selection.json`, `analysis/`, `preprocess/`) | Mixed | Mixed | Not audited | Classify as authored or rebuildable, then apply rules 1–4 to the authored ones |
| Whole Library | `format_version` 1 | — | — | Both resolvers (`src/lib/local-store/paths.ts` and its MCP mirror `mcp/projects-root.mjs`, kept identical by a parity test) **refuse** a newer or invalid Library instead of using it or falling back. A true read-only mode that lets an older DreamCut view a newer Library must land before format 2. |
