import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { withStableBuildLock } from "./stable-build-lock";

test("independent launchers cannot enter the destructive build section together", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stable-build-race-"));
  const worker = path.join(root, "worker.mts");
  fs.writeFileSync(worker, `
    import fs from 'node:fs';
    import { withStableBuildLock } from ${JSON.stringify(new URL("./stable-build-lock.ts", import.meta.url).href)};
    const [root, id] = process.argv.slice(2);
    fs.writeFileSync(root+'/'+id+'-started', 'yes');
    await withStableBuildLock(root, async () => {
      if (fs.existsSync(root+'/active')) throw Error('concurrent destructive build');
      fs.writeFileSync(root+'/active', id);
      fs.appendFileSync(root+'/events', id+' enter\\n');
      if (id==='first') while (!fs.existsSync(root+'/release')) await new Promise(r=>setTimeout(r,10));
      fs.appendFileSync(root+'/events', id+' exit\\n');
      fs.unlinkSync(root+'/active');
    }, {timeoutMs:5000,pollMs:10});
  `);
  const children: ReturnType<typeof spawn>[] = [];
  const run = (id: string) => {
    const child = spawn(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), worker, root, id], { stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    let diagnostic = "";
    child.stderr!.on("data", chunk => { diagnostic += chunk; });
    return new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", code => code === 0 ? resolve() : reject(new Error(diagnostic || `worker exit ${code}`)));
    });
  };
  const waitFor = async (file: string) => {
    const deadline = Date.now() + 5000;
    while (!fs.existsSync(path.join(root, file))) {
      assert.ok(Date.now() < deadline, `timed out waiting for ${file}`);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  };
  try {
    const first = run("first");
    await waitFor("active");
    const second = run("second");
    await waitFor("second-started");
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(fs.readFileSync(path.join(root, "events"), "utf8"), "first enter\n");
    fs.writeFileSync(path.join(root, "release"), "yes");
    await Promise.all([first, second]);
    assert.equal(fs.readFileSync(path.join(root, "events"), "utf8"), "first enter\nfirst exit\nsecond enter\nsecond exit\n");
  } finally {
    children.forEach(child => { if (child.exitCode === null) child.kill(); });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("failed build releases its lease so the next build can recover", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stable-build-error-"));
  try {
    await assert.rejects(withStableBuildLock(root, async () => { throw new Error("compile failed"); }), /compile failed/);
    assert.equal(await withStableBuildLock(root, async () => "recovered"), "recovered");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("timeout preserves another or abandoned builder's lease", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "stable-build-busy-"));
  const lock = path.join(root, ".desktop-build", "stable-build.lock");
  fs.mkdirSync(lock, { recursive: true });
  fs.writeFileSync(path.join(lock, "owner.json"), "unknown owner");
  try {
    await assert.rejects(withStableBuildLock(root, async () => assert.fail("must not build"), { timeoutMs: 0 }), /Another stable build owns/);
    assert.equal(fs.readFileSync(path.join(lock, "owner.json"), "utf8"), "unknown owner");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
