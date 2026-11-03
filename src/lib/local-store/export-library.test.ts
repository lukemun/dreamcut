import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { addToExportsFolder, exportFileName, exportsDir, finishedExportFile } from "./export-library";

function withExportsDir(run: (exports: string, renders: string) => void) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "export-library-"));
  const prior = process.env.DREAMCUT_EXPORTS_DIR;
  process.env.DREAMCUT_EXPORTS_DIR = path.join(root, "exports");
  const renders = path.join(root, "renders");
  fs.mkdirSync(renders);
  try { run(process.env.DREAMCUT_EXPORTS_DIR, renders); } finally {
    if (prior === undefined) delete process.env.DREAMCUT_EXPORTS_DIR; else process.env.DREAMCUT_EXPORTS_DIR = prior;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("export names read as the project and when it finished, never overwriting", () => {
  const at = new Date(2026, 9, 13, 21, 5);
  assert.equal(exportFileName("Talking points video", at, ".mp4", () => false), "Talking points video 2026-10-13 21.05.mp4");
  assert.equal(exportFileName("a/b: c", at, ".mp4", (name) => name === "a b c 2026-10-13 21.05.mp4"), "a b c 2026-10-13 21.05 (2).mp4");
  assert.equal(exportFileName("  ", at, ".mp4", () => false), "Untitled 2026-10-13 21.05.mp4");
});

test("a finished export lands in the shared folder without changing the project's copy", () => withExportsDir((exports, renders) => {
  assert.equal(exportsDir(), path.resolve(exports));
  const render = path.join(renders, "2026-10-13.mp4");
  fs.writeFileSync(render, "video bytes");
  const placed = addToExportsFolder(render, "Talking points video", new Date(2026, 9, 13, 21, 5));
  assert.ok(placed && placed.startsWith(exports));
  assert.equal(fs.readFileSync(placed, "utf8"), "video bytes");
  assert.equal(fs.readFileSync(render, "utf8"), "video bytes");
  // A second export at the same minute gets its own name.
  const second = addToExportsFolder(render, "Talking points video", new Date(2026, 9, 13, 21, 5));
  assert.notEqual(second, placed);
}));

test("the Library plays the shared copy, falls back to the project's, and drops an export once both are gone", () => withExportsDir((exports, renders) => {
  const render = path.join(renders, "r.mp4");
  fs.writeFileSync(render, "x");
  const shared = addToExportsFolder(render, "P", new Date())!;
  const job = { projectId: "p", fileName: "r.mp4", libraryPath: shared };
  assert.equal(finishedExportFile(job, renders), path.resolve(shared));
  fs.rmSync(shared);
  assert.equal(finishedExportFile(job, renders), render);
  fs.rmSync(render);
  assert.equal(finishedExportFile(job, renders), null);
  // A recorded path outside the shared folder is never served.
  assert.equal(finishedExportFile({ ...job, libraryPath: "/etc/hosts", fileName: null }, renders), null);
}));
