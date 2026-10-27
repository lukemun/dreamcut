import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { readMetadata } from "@/lib/local-store/store";
import { isSafeProjectId } from "@/lib/local-store/paths";
import { POST } from "./route";

test("project display names preserve spaces and Unicode without becoming paths", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-project-name-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  const create = (data: object) => POST(new Request("http://localhost/api/projects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ aspect_ratio: "16:9", ...data }) }));
  try {
    for (const title of ["Weekly market recap", "Recap", "市場の週報", "../My / video"]) {
      const response = await create({ title });
      assert.equal(response.status, 201);
      const { id } = await response.json();
      assert.ok(isSafeProjectId(id));
      assert.equal(readMetadata(id).title, title);
    }
    assert.equal((await create({ title: "  " })).status, 400);
    assert.equal((await create({ id: "../escape" })).status, 400);
    assert.equal((await create({ id: "legacy-id" })).status, 201);
    assert.equal((await create({ id: "legacy-id" })).status, 409);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
