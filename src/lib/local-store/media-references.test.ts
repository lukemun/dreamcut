import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { findMediaReferences } from "./media-references";

test("reference scans fail closed when a project directory cannot be read", () => {
  assert.throws(() => findMediaReferences(["preview.mp4"], path.join(os.tmpdir(), "missing-reference-scan", "projects")), /ENOENT/);
});
test("unreadable project records cannot be treated as unreferenced media", t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "media-reference-scan-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const record = path.join(root, "history.json");
  fs.writeFileSync(record, JSON.stringify({ source: "preview.mp4" }));
  const read = fs.readFileSync;
  t.mock.method(fs, "readFileSync", (...args: Parameters<typeof fs.readFileSync>) => {
    if (args[0] === record) throw Object.assign(new Error("denied"), { code: "EACCES" });
    return Reflect.apply(read, fs, args);
  });
  assert.throws(() => findMediaReferences(["preview.mp4"], root), /denied/);
});
