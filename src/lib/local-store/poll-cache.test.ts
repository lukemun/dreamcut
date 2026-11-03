import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { cachedPolledJson, projectInputsKey } from "./poll-cache";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "poll-cache-"));
process.env.TIMELINE_PROJECTS_DIR = root;
const project = "p";
fs.mkdirSync(path.join(root, project, "proposals"), { recursive: true });
fs.mkdirSync(path.join(root, project, "instruments"), { recursive: true });
fs.writeFileSync(path.join(root, project, "timeline.json"), "{}");

test("an unchanged project reuses the last body; a changed input file rebuilds it", () => {
  let builds = 0;
  const build = () => ({ n: ++builds });
  const request = (etag?: string) => new Request("http://x/", etag ? { headers: { "if-none-match": etag } } : undefined);
  const first = cachedPolledJson(request(), "s", project, build);
  const etag = first.headers.get("etag")!;
  assert.equal(builds, 1);
  assert.equal(cachedPolledJson(request(etag), "s", project, build).status, 304);
  assert.equal(builds, 1);
  fs.writeFileSync(path.join(root, project, "proposals", "a.json"), "{}");
  assert.equal(cachedPolledJson(request(etag), "s", project, build).status, 200);
  assert.equal(builds, 2);
});

test("evidence and preparation folders do not change the input key", () => {
  const before = projectInputsKey(project);
  fs.writeFileSync(path.join(root, project, "instruments", "frame.png"), "x");
  fs.mkdirSync(path.join(root, project, "preprocess", "export-chunks"), { recursive: true });
  fs.writeFileSync(path.join(root, project, "preprocess", "export-chunks", "chunk.mp4"), "x");
  assert.equal(projectInputsKey(project), before);
});
