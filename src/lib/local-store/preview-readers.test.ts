import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { activePreviewReaders, withPreviewReadersLock } from "./preview-readers";

const relative = ".prepared/editor-media-v1/source/generation/preview.mp4";

test("backend exit retains its supervisor's URLs; proven-dead owners permit reclamation", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-reader-owner-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    const module = path.resolve("src/lib/local-store/preview-readers.ts");
    const runReader = (project: string, owner: string) => {
      const script = `const i = await import(${JSON.stringify(module)}); const m = i.retainPreviewReader ? i : i.default; m.retainPreviewReader(${JSON.stringify(project)}, ${JSON.stringify(relative)});`;
      const result = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], {
        env: { ...process.env, DREAMCUT_PREVIEW_READER_OWNER_PID: owner }, encoding: "utf8",
      });
      assert.equal(result.status, 0, result.stderr);
      return result.pid;
    };
    const exitedBackend = runReader("supervised", String(process.pid));
    assert.throws(() => process.kill(exitedBackend, 0), "the backend has exited");
    assert.deepEqual(withPreviewReadersLock("supervised", () => [...activePreviewReaders("supervised")]), [relative], "supervisor survives backend handoff");
    // The fallback owner is the child itself. Its completed exit permits cleanup.
    const exitedOwner = runReader("unsupervised", "");
    assert.ok(fs.existsSync(path.join(root, "unsupervised/preprocess/preview-readers", `${exitedOwner}.lease`)));
    assert.deepEqual(withPreviewReadersLock("unsupervised", () => [...activePreviewReaders("unsupervised")]), []);
    assert.equal(fs.existsSync(path.join(root, "unsupervised/preprocess/preview-readers", `${exitedOwner}.lease`)), false);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
