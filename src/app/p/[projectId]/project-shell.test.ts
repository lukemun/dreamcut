import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

test("project sections share a persistent frame and loading never replaces it", () => {
  assert.ok(read("./layout.tsx").includes("<ProjectShell"));
  const shell = read("./ProjectShell.tsx");
  assert.ok(shell.includes("usePathname()"));
  assert.ok(shell.includes('searchParams.get("embed") === "1"'));
  assert.ok(shell.includes("<ProjectVersionHeader"));
  for (const page of ["./EditorClient.tsx", "./library/page.tsx", "./memory/page.tsx", "./guide/page.tsx", "./loading.tsx"]) {
    assert.ok(!read(page).includes("<ProjectVersionHeader"), page);
    assert.ok(!read(page).includes("<main"), page);
  }
  // Export keeps a fixed-width, right-aligned slot so the header never shifts between pages.
  assert.match(read("./ProjectVersionHeader.tsx"), /id="timeline-project-header-actions"[^>]*className="flex w-\d+ shrink-0 items-center justify-end/);
});

test("Library replaces the Generate tab, the dock is desktop-only beside Storyboard, and staged drafts open Generate once", () => {
  const header = read("./ProjectVersionHeader.tsx"), shell = read("./ProjectShell.tsx");
  assert.match(header, /\["library", "Library", `\/p\/\$\{currentProjectId\}\/library`\]/);
  assert.doesNotMatch(header, /\["generate", "Generate"/);
  // Old Generate links land in Library with the Generate form open.
  assert.match(read("./generate/page.tsx"), /redirect\(`\/p\/\$\{encodeURIComponent\(projectId\)\}\/library\?generate=\$\{pane\}`\)/);
  // A browser driven from Claude Code or Codex has its own chat: no dock there, and none on Library.
  assert.match(shell, /setDesktopApp\(Boolean\(window\.dreamcutDesktop\)\)/);
  assert.match(shell, /visible=\{!embedded && desktopApp && activeView === "storyboard"\}/);
  // Once per staging; the first draft seen is the baseline; a busy creator gets a notice instead of a jump.
  assert.match(shell, /dreamcut:generation-draft-seen:/);
  assert.match(shell, /if \(creatorIsBusy\(\)\) setDraftNotice\(true\)/);
});
