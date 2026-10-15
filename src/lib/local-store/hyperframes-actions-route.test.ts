import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { POST } from "../../app/api/projects/[projectId]/hyperframes/route";

test("animation actions use desktop ownership and retain exclusion after a rejected concurrent request", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dreamcut-animation-owner-"));
  const previousRoot = process.env.TIMELINE_PROJECTS_DIR;
  const key = Symbol.for("dreamcut.desktop.worker-owner");
  const host = process as NodeJS.Process & { [key: symbol]: unknown };
  const previousOwner = host[key];
  let launches = 0;
  const child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });
  try {
    await fs.mkdir(path.join(root, "fixture"));
    process.env.TIMELINE_PROJECTS_DIR = root;
    host[key] = { spawn(command: string, args: string[]) {
      launches++;
      assert.equal(command, process.execPath);
      assert.deepEqual(args, ["--import", "tsx", path.resolve("scripts/hyperframes-overlay.ts"), "check", "fixture", "title"]);
      return child;
    } };
    const request = () => POST(new Request("http://localhost/api/projects/fixture/hyperframes", {
      method: "POST", body: JSON.stringify({ action: "check", composition_id: "title" }),
    }), { params: Promise.resolve({ projectId: "fixture" }) });
    const first = request();
    while (!launches) await new Promise(resolve => setImmediate(resolve));
    assert.equal((await request()).status, 409);
    assert.equal((await request()).status, 409);
    assert.equal(launches, 1);
    child.stdout.write("Checked fixture");
    child.emit("close", 0);
    assert.equal((await first).status, 200);
    host[key] = { spawn() { throw Error("DreamCut is shutting down"); } };
    const stopped = await request();
    assert.equal(stopped.status, 500);
    assert.match((await stopped.json()).error, /shutting down/);
  } finally {
    if (previousRoot === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previousRoot;
    if (previousOwner === undefined) delete host[key]; else host[key] = previousOwner;
    await fs.rm(root, { recursive: true, force: true });
  }
});
