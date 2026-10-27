# Personal editing style

My Style is one editable `STYLE.md` document in the local profile. It is the source
of active personal direction for the editor and agents. User → My style displays
readable sections; Edit my style opens the Markdown with Save, Cancel and Undo last
save. Direct file changes take effect on the next context read. Current requests
and project exceptions still take priority.

## Scope and storage

Use headings and ordinary paragraphs in your own words. `## Vertical videos` scopes
its content and subordinate headings to 9:16 projects; the next peer heading returns
to all edits. Keep project-only exceptions in the separate project section. Named
reusable combinations of settings live in Properties → Templates, not the active document.

The private JSON sidecar retains learning settings, evidence, project exceptions
and suggested/retired preferences. It cannot override active personal Markdown.
Migration backs up the previous generated document and preferences; content-hashed
snapshots retain document revisions under `style-history/`. Existing hand-authored
Markdown is preserved. Missing migrated documents fail visibly rather than silently
resurrecting old preferences. Saves reject stale revisions; conflicted UI drafts
remain available to copy before loading the latest version.

## Learning and boundaries

The editor does not learn preferences on its own. STYLE.md changes when the creator
edits it, or when they accept a suggestion synced from their DreamCut account.

Rules applying to every editor belong in shared skills and standards, not personal
style. No model call is needed to read or save the document. No persona file or
second active style store is introduced. Personal content stays outside the repo.
External editors do not share the app's write lock, so avoid simultaneous file/UI
saves. Cross-project style comparisons and automatic prose rewriting are not implemented.

The historical projection template remains a migration test fixture. Runtime
behavior is covered by `src/lib/local-store/style-document.test.ts` and the existing
editing-memory tests.
