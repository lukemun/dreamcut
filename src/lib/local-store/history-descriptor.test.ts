import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { latestHistoryDescriptor } from "./history-descriptor";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "history-descriptor-test-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
after(() => fs.rmSync(root, { recursive: true, force: true }));
function directory(name: string) {
  const dir = path.join(root, name); fs.mkdirSync(dir, { recursive: true }); return dir;
}
const snapshot = (op: string) => JSON.stringify({ op, at: "2026-10-23T00:00:00Z", timeline: {} });

test("unchanged polls avoid directory enumeration and snapshot reads", t => {
  const dir = directory("bounded");
  fs.writeFileSync(path.join(dir, "z.json"), JSON.stringify({ op: "trim", at: "now", timeline: { data: "x".repeat(1024 * 1024) } }));
  const read = fs.readSync;
  let bytes = 0;
  t.mock.method(fs, "readSync", (...args: Parameters<typeof fs.readSync>) => {
    const count = read(...args); bytes += count; return count;
  });
  assert.deepEqual(latestHistoryDescriptor(dir), { id: "z.json", op: "trim", at: "now" });
  assert.equal(bytes, 64 * 1024);
  t.mock.method(fs, "readdirSync", () => { throw Error("unchanged poll must not enumerate"); });
  t.mock.method(fs, "openSync", () => { throw Error("unchanged poll must not reread"); });
  assert.deepEqual(latestHistoryDescriptor(dir), { id: "z.json", op: "trim", at: "now" });
});

test("external append, delete, same-size rewrite and atomic replacement invalidate", () => {
  const dir = directory("external"), file = path.join(dir, "a.json");
  fs.writeFileSync(file, snapshot("first"));
  assert.equal(latestHistoryDescriptor(dir)?.op, "first");
  const original = fs.statSync(file);
  fs.writeFileSync(file, snapshot("other"));
  fs.utimesSync(file, original.atime, original.mtime);
  assert.equal(latestHistoryDescriptor(dir)?.op, "other", "ctime detects same-size preserved-mtime replacement");
  const replacement = path.join(dir, "replacement.tmp");
  fs.writeFileSync(replacement, snapshot("third")); fs.utimesSync(replacement, original.atime, original.mtime); fs.renameSync(replacement, file);
  assert.equal(latestHistoryDescriptor(dir)?.op, "third");
  fs.writeFileSync(path.join(dir, "z.json"), snapshot("newer"));
  assert.equal(latestHistoryDescriptor(dir)?.id, "z.json");
  fs.unlinkSync(path.join(dir, "z.json"));
  assert.equal(latestHistoryDescriptor(dir)?.id, "a.json");
  fs.rmSync(dir, { recursive: true });
  assert.equal(latestHistoryDescriptor(dir), null);
  fs.mkdirSync(dir); fs.writeFileSync(file, snapshot("rebuilt"));
  assert.equal(latestHistoryDescriptor(dir)?.op, "rebuilt");
});

test("small legacy, malformed, nested and quoted timeline fields have bounded fallbacks", () => {
  const dir = directory("headers"), file = path.join(dir, "a.json");
  const check = (text: string, op: string, at = "a.json") => {
    fs.writeFileSync(file, text);
    assert.deepEqual(latestHistoryDescriptor(dir), { id: "a.json", op, at });
  };
  check(JSON.stringify({ timeline: {}, op: "legacy", at: "then" }), "legacy", "then");
  check('{"op":"broken",', "timeline_write");
  check("null", "timeline_write");
  check(JSON.stringify({ note: 'quoted "timeline": in a label', nested: { timeline: "nested" }, op: "correct", at: "now", timeline: { data: "x".repeat(70_000) } }), "correct", "now");
  check(JSON.stringify({ timeline: { data: "x".repeat(70_000) }, op: "after-large-timeline", at: "then" }), "timeline_write");
  check(JSON.stringify({ note: "x".repeat(70_000), op: "beyond-budget", timeline: {} }), "timeline_write");
});

test("descriptor cache is bounded and keys include the absolute directory", t => {
  const dirs = Array.from({ length: 65 }, (_, i) => directory(`cache-${i}/history`));
  for (const [i, dir] of dirs.entries()) {
    fs.writeFileSync(path.join(dir, "same.json"), snapshot(String(i)));
    assert.equal(latestHistoryDescriptor(dir)?.op, String(i));
  }
  const readDirectory = fs.readdirSync;
  let scans = 0;
  t.mock.method(fs, "readdirSync", (...args: Parameters<typeof fs.readdirSync>) => { scans++; return readDirectory(...args); });
  assert.equal(latestHistoryDescriptor(dirs.at(-1)!)?.op, "64");
  assert.equal(scans, 0);
  assert.equal(latestHistoryDescriptor(dirs[0])?.op, "0");
  assert.equal(scans, 1, "oldest directory is evicted");
});

test("revision GET returns 304 without reading history and refreshes external edits", async t => {
  const projectId = "route";
  const project = directory(`projects/${projectId}`), history = directory(`projects/${projectId}/history`);
  fs.writeFileSync(path.join(project, "timeline.json"), "{}");
  fs.writeFileSync(path.join(project, "metadata.json"), "{}");
  fs.writeFileSync(path.join(history, "a.json"), snapshot("first"));
  const { GET } = await import("../../app/api/projects/[projectId]/revision/route");
  const get = (etag?: string) => GET(new Request("http://127.0.0.1:3123/api/projects/route/revision", { headers: etag ? { "if-none-match": etag } : undefined }), { params: Promise.resolve({ projectId }) });
  const initial = await get(); assert.equal(initial.status, 200);
  const etag = initial.headers.get("etag")!;
  const readDirectory = fs.readdirSync, open = fs.openSync;
  t.mock.method(fs, "readdirSync", (...args: Parameters<typeof fs.readdirSync>) => { assert.notEqual(String(args[0]), history); return readDirectory(...args); });
  t.mock.method(fs, "openSync", (...args: Parameters<typeof fs.openSync>) => { assert.ok(!String(args[0]).startsWith(history + path.sep)); return open(...args); });
  assert.equal((await get(etag)).status, 304);
  t.mock.restoreAll();
  fs.writeFileSync(path.join(history, "z.json"), snapshot("external"));
  const changed = await get(etag); assert.equal(changed.status, 200);
  assert.equal((await changed.json()).history.op, "external");
  assert.equal((await get(changed.headers.get("etag")!)).status, 304);
});
