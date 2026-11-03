import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createProject } from "../local-store/store";
import { jobPath, stageFile } from "../local-store/asset-generation";
import { assetGenerationResults } from "./asset-generation-results";

test("generation results return each image output as an MCP image and answer at once for a running job", async () => {
  const old = process.env.TIMELINE_PROJECTS_DIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "generation-results-"));
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("fixture", "web");
    const ready = "11111111-1111-4111-8111-111111111111", running = "22222222-2222-4222-8222-222222222222";
    const { source, file } = stageFile("fixture", ready, "result-1.png");
    await sharp({ create: { width: 1200, height: 2000, channels: 3, background: "#884422" } }).png().toFile(file);
    const job = (id: string, status: string, outputs: unknown[], createdAt: string) => ({ id, projectId: "fixture", createdAt, updatedAt: createdAt, status, outputs, references: [], quote: { credits: 150, catalogVersion: "test", kind: "credits" },
      request: { task: "image", route: "fal", modelId: "nano-banana-pro", prompt: "Outfit", references: [], count: 1 } });
    fs.mkdirSync(path.dirname(jobPath("fixture", ready)), { recursive: true });
    fs.writeFileSync(jobPath("fixture", ready), JSON.stringify(job(ready, "ready", [{ id: "result-1.png", source, kind: "image", sha256: "x" }], "2026-10-13T00:00:00.000Z")));
    fs.writeFileSync(jobPath("fixture", running), JSON.stringify(job(running, "running", [], "2026-10-13T00:01:00.000Z")));

    const done = await assetGenerationResults("fixture", { job_id: ready });
    assert.equal(done.job.status, "ready");
    assert.equal(done.job.credits, 150);
    assert.equal(done.images.length, 1);
    assert.equal(done.images[0].mimeType, "image/jpeg");
    const preview = await sharp(Buffer.from(done.images[0].data, "base64")).metadata();
    assert.ok(Math.max(preview.width!, preview.height!) <= 768);
    assert.deepEqual({ ...done.outputs[0], sha256: undefined }, { id: "result-1.png", kind: "image", source, sha256: undefined, kept: false, preview: "image 1", preview_shows: "the image" });
    assert.equal(done.review_url, "/p/fixture/library?generate=results");

    const started = Date.now(), latest = await assetGenerationResults("fixture", {});
    assert.equal(latest.job.id, running, "omitting job_id reads the most recent request");
    assert.ok(Date.now() - started < 1000, "wait_seconds 0 answers immediately");
    assert.equal(latest.images.length, 0);
    assert.match(latest.next_action, /Do not submit again/);
  } finally {
    if (old === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = old;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
