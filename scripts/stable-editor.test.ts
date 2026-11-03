import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { buildSlot, rendersRunningUnder, staticAssetFile } from "./stable-editor";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stable-editor-"));
  const write = (slot: string, relative: string) => {
    const file = path.join(root, ".desktop-build", slot, ".next-desktop", "static", relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, slot);
    return file;
  };
  return { root, write };
}

test("a chunk only the earlier build has is found in that build's slot", () => {
  const { root, write } = fixture();
  const old = write("stable-b", "chunks/app/p/[projectId]/page-old.js");
  write("stable-c", "chunks/app/p/[projectId]/page-new.js");
  assert.deepEqual(staticAssetFile(root, "/_next/static/chunks/app/p/%5BprojectId%5D/page-old.js?dpl=1", "stable-c"), { file: old, slot: "stable-b" });
});

test("the serving build answers first when it has the file", () => {
  const { root, write } = fixture();
  write("stable-a", "css/shared.css");
  const current = write("stable-c", "css/shared.css");
  assert.deepEqual(staticAssetFile(root, "/_next/static/css/shared.css", "stable-c"), { file: current, slot: "stable-c" });
});

test("non-static paths, traversal and missing files are left to the server", () => {
  const { root, write } = fixture();
  write("stable-a", "chunks/a.js");
  assert.equal(staticAssetFile(root, "/api/projects/x/timeline", "stable-a"), null);
  assert.equal(staticAssetFile(root, "/_next/static/../BUILD_ID", "stable-a"), null);
  assert.equal(staticAssetFile(root, "/_next/static/chunks/%2e%2e/%2e%2e/BUILD_ID", "stable-a"), null);
  assert.equal(staticAssetFile(root, "/_next/static/chunks/%E0%A4%A", "stable-a"), null);
  assert.equal(staticAssetFile(root, "/_next/static/chunks/missing.js", "stable-a"), null);
  assert.equal(staticAssetFile(root, "/_next/static/chunks", "stable-a"), null);
});

test("an export keeps the server it runs under, and only that one, from being stopped", () => {
  const jobsDir = fs.mkdtempSync(path.join(os.tmpdir(), "render-jobs-"));
  const job = (id: string, status: string, pid: number) => fs.writeFileSync(path.join(jobsDir, `${id}.json`), JSON.stringify({ id, status, pid }));
  const exited = spawnSync(process.execPath, ["-e", ""]).pid;
  // This test process stands in for the Next server; its parent for the tsx wrapper the launcher spawned.
  job("running-here", "processing", process.pid);
  job("finished-here", "completed", process.pid);
  job("interrupted", "processing", exited);
  fs.writeFileSync(path.join(jobsDir, "running-here.stop"), "");
  fs.writeFileSync(path.join(jobsDir, "torn.json"), "{");
  assert.deepEqual(rendersRunningUnder(jobsDir, process.ppid), ["running-here"]);
  assert.deepEqual(rendersRunningUnder(jobsDir, process.pid), ["running-here"]);
  // A newer server is not this process's ancestor, so the export does not hold it.
  const unrelated = spawnSync(process.execPath, ["-e", ""]).pid;
  assert.deepEqual(rendersRunningUnder(jobsDir, unrelated), []);
  assert.deepEqual(rendersRunningUnder(path.join(jobsDir, "missing"), process.ppid), []);
});

test("concurrent build callers reuse the finished slot instead of rebuilding it", async () => {
  const { root } = fixture();
  fs.mkdirSync(path.join(root, "desktop"));
  fs.writeFileSync(path.join(root, "desktop", "build.mjs"), `
    import fs from 'node:fs'; import path from 'node:path';
    fs.appendFileSync('builds', 'started\\n');
    const slot = process.env.DREAMCUT_BUILD_DIR;
    fs.rmSync(slot, {recursive:true,force:true});
    await new Promise(r=>setTimeout(r,100));
    fs.mkdirSync(path.join(slot,'.next-desktop'),{recursive:true});
    fs.writeFileSync(path.join(slot,'.next-desktop','BUILD_ID'),'fixture');
  `);
  try {
    const [first, second] = await Promise.all([buildSlot(root), buildSlot(root)]);
    assert.deepEqual(first, second);
    assert.equal(fs.readFileSync(path.join(root, "builds"), "utf8"), "started\n");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("failed compilation rejects even when an older build is available", async () => {
  const { root } = fixture();
  fs.mkdirSync(path.join(root, "desktop"));
  fs.writeFileSync(path.join(root, "desktop", "build.mjs"), "process.exit(5);");
  const old = path.join(root, ".desktop-build", "stable-a", ".next-desktop");
  fs.mkdirSync(old, { recursive: true });
  fs.writeFileSync(path.join(old, "BUILD_ID"), "old");
  try {
    await assert.rejects(buildSlot(root), /exit 5/);
    const command = spawnSync(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), "--tsconfig", path.resolve("tsconfig.json"), path.resolve("scripts/stable-editor.ts"), "build"], { cwd: root, encoding: "utf8" });
    assert.equal(command.status, 1, command.stdout + command.stderr);
    assert.match(command.stderr, /Stable editor build failed/);
    assert.ok(!fs.existsSync(path.join(root, ".desktop-build", "stable-build.lock")));
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
