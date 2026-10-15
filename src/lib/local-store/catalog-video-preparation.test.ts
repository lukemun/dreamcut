import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { createProject } from "./store";
import { readProjectSourceManifest } from "./media-ingest";
import { preparationDir, preparedPlacement, readPreparation } from "./media-preparation";
import { prepareEditorMedia } from "../media-analysis/prepare-editor-media";
import { POST as prepare } from "../../app/api/projects/[projectId]/media-preparation/route";
import { GET as assets } from "../../app/api/projects/[projectId]/timeline/assets/route";

test("catalog videos import, prepare, and become placeable without changing the timeline", async () => {
  const template = JSON.parse(fs.readFileSync("visual-catalog/catalog.json", "utf8")).assets[0];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "catalog-video-preparation-"));
  const keys = ["TIMELINE_PROJECTS_DIR", "TIMELINE_VISUAL_CATALOG_DIR", "MEDIA_PREPARATION_AUTOSTART"] as const;
  const previous = keys.map(key => process.env[key]);
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  process.env.TIMELINE_VISUAL_CATALOG_DIR = path.join(root, "catalog");
  process.env.MEDIA_PREPARATION_AUTOSTART = "0";
  try {
    createProject("fixture", "web");
    fs.mkdirSync(path.join(root, "catalog/media/licensed"), { recursive: true });
    const source = path.join(root, "catalog/media/licensed/fixture.mp4");
    execFileSync("ffmpeg", ["-v", "error", "-f", "lavfi", "-i", "testsrc2=s=160x90:r=30:d=0.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", source]);
    const original = fs.readFileSync(source);
    const entry = { ...template, id: "fixture", file: "licensed/fixture.mp4", derivation: undefined,
      has_alpha_channel: false, duration_seconds: 0.5, width: 160, height: 90,
      sha256: createHash("sha256").update(original).digest("hex") };
    fs.writeFileSync(path.join(root, "catalog/catalog.json"), JSON.stringify({ schema_version: 1, assets: [entry] }));
    const timelineFile = path.join(root, "projects/fixture/timeline.json");
    const before = fs.readFileSync(timelineFile);
    const params = { params: Promise.resolve({ projectId: "fixture" }) };
    const list = async () => {
      const response = await assets(new Request("http://localhost/api/projects/fixture/timeline/assets"), params);
      assert.equal(response.status, 200, await response.clone().text());
      return (await response.json()).visuals.find((asset: { catalog_visual_id?: string }) => asset.catalog_visual_id === "fixture");
    };
    const post = (id: string) => prepare(new Request("http://localhost/api/projects/fixture/media-preparation", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ catalog_visual_id: id }),
    }), params);
    assert.equal((await list()).preparation.state, "imported");
    assert.equal((await post("unknown")).status, 404);
    fs.writeFileSync(source, "changed catalog bytes");
    const rejected = await post("fixture");
    assert.equal(rejected.status, 400);
    assert.match((await rejected.json()).error, /checksum/);
    assert.equal(readProjectSourceManifest("fixture").assets.length, 0);
    assert.deepEqual(fs.readdirSync(path.join(root, "projects/fixture/media")), []);
    assert.equal(fs.existsSync(preparationDir("fixture")), false, "rejected sources never queue preparation");
    fs.writeFileSync(source, original);
    assert.equal((await post("fixture")).status, 202);
    const preparing = await list();
    assert.equal(preparing.preparation.state, "preparing");
    assert.match(preparing.source_url, /^\/api\/projects\/fixture\/media\//);
    assert.throws(() => preparedPlacement("fixture", preparing.source_url, {}), /not ready/);
    const ready = prepareEditorMedia("fixture", readPreparation("fixture", preparing.upload_id)!);
    assert.equal(ready.state, "ready", ready.error);
    const available = await list();
    assert.equal(available.preparation.state, "ready");
    assert.match(preparedPlacement("fixture", available.source_url, {}).props.preview_source_url, /\.prepared\//);
    assert.equal((await post("fixture")).status, 202);
    assert.equal(readProjectSourceManifest("fixture").assets.length, 1, "retry reuses the managed source");
    assert.deepEqual(fs.readFileSync(source), original);
    assert.deepEqual(fs.readFileSync(timelineFile), before);
  } finally {
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
