import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { withEditRequestActor } from "@/lib/local-store/edit-attribution";
import { createProject, getRevision, readMetadata, writeMetadata } from "@/lib/local-store/store";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-write-refresh-"));
process.env.TIMELINE_PROJECTS_DIR = root;

function writeShape(projectId: string, client: "mcp" | "editor", shape: "9:16" | "16:9") {
  const handler = withEditRequestActor(async (_request: Request) => {
    writeMetadata(projectId, { ...readMetadata(projectId), output_aspect_ratio: shape }, "output_format");
    return new Response(null);
  });
  return handler(new Request(`http://127.0.0.1/api/projects/${projectId}/timeline/output-format`, { method: "PATCH", headers: { "x-dreamcut-client": client } }));
}

test("an agent's output-shape write reloads the open editor; the editor's own write does not", async () => {
  createProject("shape-refresh", "web");
  const baseline = getRevision("shape-refresh").externalRev;

  await writeShape("shape-refresh", "editor", "9:16");
  assert.equal(getRevision("shape-refresh").externalRev, baseline);

  await writeShape("shape-refresh", "mcp", "16:9");
  const afterAgent = getRevision("shape-refresh").externalRev;
  assert.notEqual(afterAgent, baseline);
  assert.equal(readMetadata("shape-refresh").output_aspect_ratio, "16:9");

  // A later poll with no new write stays put, so the editor reloads once.
  assert.equal(getRevision("shape-refresh").externalRev, afterAgent);
});
