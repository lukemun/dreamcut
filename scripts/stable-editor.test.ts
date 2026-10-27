import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { staticAssetFile } from "./stable-editor";

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
