import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readProjectListMetadata } from "./project-list-metadata";

test("project browsing tolerates incomplete and corrupt metadata without rewriting it", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "project-list-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    for (const [id, contents, expected] of [
      ["incomplete", '{"title":"My cut","version_label":"V2"}', { title: "My cut", versionLabel: "V2" }],
      ["corrupt", "{", { title: "corrupt", versionLabel: null }],
      ["null", "null", { title: "null", versionLabel: null }],
      ["invalid", '{"title":123,"version_label":{}}', { title: "invalid", versionLabel: null }],
    ] as const) {
      fs.mkdirSync(path.join(root, id));
      const file = path.join(root, id, "metadata.json");
      fs.writeFileSync(file, contents);
      assert.deepEqual(readProjectListMetadata(id), expected);
      assert.equal(fs.readFileSync(file, "utf8"), contents);
    }
    assert.deepEqual(readProjectListMetadata("missing"), { title: "missing", versionLabel: null });
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
