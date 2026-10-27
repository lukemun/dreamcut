import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createProject } from "./store";
import { generationAssets, generationDir, listAssetJobs } from "./asset-generation";

test("generation assets reuse a request snapshot without rereading jobs", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "generation-assets-test-"));
  const names = ["TIMELINE_PROJECTS_DIR", "DREAMCUT_PROFILE_DIR", "DREAMCUT_APP_DATA_DIR"] as const;
  const previous = names.map(name => process.env[name]);
  try {
    names.forEach((name, index) => { process.env[name] = path.join(root, String(index)); });
    createProject("fixture", "web");
    const id = randomUUID();
    fs.mkdirSync(generationDir("fixture"), { recursive: true });
    const file = path.join(generationDir("fixture"), `${id}.json`);
    const job = { id, status: "ready", createdAt: "2026-01-01T00:00:00Z", outputs: [
      { id: "draft.png", source: "draft.png", kind: "image" },
      { id: "kept.png", source: "kept.png", kind: "image", keptSource: "sources/kept.png" },
    ] };
    fs.writeFileSync(file, JSON.stringify(job));
    const jobs = listAssetJobs("fixture");
    const expected = generationAssets("fixture");
    assert.equal(expected.length, 1);
    assert.deepEqual(generationAssets("fixture", jobs), expected);
    // A worker finishes after the snapshot: the next request sees its outputs,
    // while this request's job status and asset list stay internally consistent.
    fs.writeFileSync(file, JSON.stringify({ ...job, outputs: [] }));
    assert.deepEqual(generationAssets("fixture", jobs), expected);
    assert.deepEqual(generationAssets("fixture"), []);
    assert.deepEqual(generationAssets("fixture", []), []);
  } finally {
    names.forEach((name, index) => {
      if (previous[index] === undefined) delete process.env[name];
      else process.env[name] = previous[index];
    });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
