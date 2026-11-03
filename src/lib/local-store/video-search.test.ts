import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { publishVideoDescription, readVideoDescription, videoCatalogDescription } from "./video-descriptions";
import { searchVideos } from "./video-search";
import { videoDescriptionTimes, type VideoDescription } from "../media-analysis/video-descriptions";
const descriptionFixture = (hash: string): VideoDescription => ({ schema_version: 1, recipe: "video-descriptions-v1", source_sha256: hash, duration_seconds: 2.5, summary: "A room and a spotted cat", tags: [], uncertainties: [], frames: videoDescriptionTimes(2.5).map((time, i) => ({ id: `f-${i}`, time_seconds: time, description: i < 2 ? "Empty room" : "Spotted cat beside sofa", tags: [] })), summary_input_ids: videoDescriptionTimes(2.5).map((_, i) => `f-${i}`) });
import { enqueueImportJob, runImportQueue, readImportJob, recordAgentVideoDescription } from "./media-import-jobs";
import { readMediaContextIndex } from "./media-context";
import { mediaAnalysisContentDir } from "./paths";
import { buildProjectMediaContextPack } from "../media-analysis/project-context";
import { presentLibraryVideos, resolveLibraryPresentation, dismissLibraryPresentation, readLibraryPresentation } from "./library-presentation";

test("source catalog is shared, timed, searchable, deduplicated, and fails closed on changed bytes or corrupt evidence", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "video-search-"));
  const old = process.env.TIMELINE_PROJECTS_DIR, oldAuto = process.env.DREAMCUT_IMPORT_AUTOSTART;
  process.env.DREAMCUT_IMPORT_AUTOSTART = "0";
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    const bytes = Buffer.from("synthetic source");
    const hash = createHash("sha256").update(bytes).digest("hex");
    for (const id of ["one", "two"]) {
      const dir = path.join(root, id); fs.mkdirSync(path.join(dir, "media", "sources"), { recursive: true });
      fs.writeFileSync(path.join(dir, "timeline.json"), JSON.stringify({ elements: [], transitions: [] }));
      fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify({ title: id, delivery_target: "reels" }));
      fs.writeFileSync(path.join(dir, "media", "sources", "video.mov"), bytes);
      fs.writeFileSync(path.join(dir, "source-manifest.json"), JSON.stringify({ schema_version: 1, project_id: id, updated_at: new Date().toISOString(), assets: [{ asset_id: `${id}-asset`, original_filename: "video.mov", source_path: null, storage_mode: "managed_copy", media_path: "sources/video.mov", source_sha256: hash, bytes: bytes.length, imported_at: new Date().toISOString() }] }));
    }
    const description = descriptionFixture(hash);
    // The compact summary deliberately omits the distinctive ending detail.
    description.summary = "An indoor room.";
    publishVideoDescription(description); publishVideoDescription(description);
    assert.equal(readMediaContextIndex(hash).datasets.video_descriptions.revisions.length, 1);
    assert.equal(videoCatalogDescription("one", "sources/video.mov", hash).status, "ready");
    const contextPack = buildProjectMediaContextPack("one");
    assert.equal(contextPack.assets.find(asset => asset.relative_path === "sources/video.mov")?.context_id, `sha256:${hash}`);
    assert.equal(contextPack.contexts[0]?.datasets.some(dataset => dataset.dataset_id === "video_descriptions"), true);
    const { randomUUID } = await import("node:crypto");
    process.env.DREAMCUT_IMPORT_ANALYSIS = "worker";
    const job = enqueueImportJob("two", { asset_id: randomUUID(), media_path: "sources/video.mov", source_sha256: hash });
    await runImportQueue("two", async () => { throw new Error("Matching descriptions must reuse context without a worker call"); });
    assert.equal(readImportJob("two", job.id).reused_context_id, `sha256:${hash}`);
    assert.equal(readImportJob("two", job.id).status, "complete");
    const found = searchVideos({ query: "spotted cat" });
    assert.equal(found.total, 1, JSON.stringify(found.warnings)); assert.equal(found.videos[0].projects.length, 2);
    assert.deepEqual(found.videos[0].matching_frames.map(f => f.time_seconds), [2, 2.45]);
    assert.equal(searchVideos({ projectId: "one", query: "dog" }).total, 0);
    assert.throws(() => searchVideos({ query: "", limit: 101 }), /bounds/);
    const timelineBefore = fs.readFileSync(path.join(root, "one", "timeline.json"), "utf8");
    const first = presentLibraryVideos("one", { title: "Cats found for you", items: [{ project_id: "two", asset_id: "two-asset", source_sha256: hash, time_seconds: 2.45 }] });
    const presented = resolveLibraryPresentation("one");
    assert.equal(presented.videos[0].project_id, "two");
    assert.equal(presented.videos[0].matching_frames[0].time_seconds, 2.45);
    assert.throws(() => presentLibraryVideos("one", { title: "Invalid", items: [{ project_id: "two", asset_id: "two-asset", source_sha256: hash, time_seconds: 1.5 }] }), /verified sampled/);
    assert.equal(readLibraryPresentation("one")?.id, first.presentation.id);
    const second = presentLibraryVideos("one", { title: "Updated results", items: [{ project_id: "one", asset_id: "one-asset", source_sha256: hash }] });
    assert.throws(() => dismissLibraryPresentation("one", first.presentation.id), /New Library/);
    assert.equal(readLibraryPresentation("one")?.id, second.presentation.id);
    assert.equal(fs.readFileSync(path.join(root, "one", "timeline.json"), "utf8"), timelineBefore);
    fs.writeFileSync(path.join(root, "one", "media", "sources", "video.mov"), "changed source");
    assert.equal(resolveLibraryPresentation("one").videos.length, 0);
    assert.equal(resolveLibraryPresentation("one").warnings.length, 1);
    dismissLibraryPresentation("one", second.presentation.id);
    assert.equal(readLibraryPresentation("one"), null);
    assert.equal(videoCatalogDescription("one", "sources/video.mov", hash).status, "stale");
    assert.equal(buildProjectMediaContextPack("one").assets.find(asset => asset.relative_path === "sources/video.mov")?.context_id, null);
    assert.equal(searchVideos({ projectId: "one", query: "spotted cat" }).total, 0);
    const index = readMediaContextIndex(hash);
    const artifact = index.datasets.video_descriptions.revisions[0].artifact!;
    fs.writeFileSync(path.join(mediaAnalysisContentDir(hash), artifact.relative_path), "corrupt");
    assert.throws(() => readVideoDescription(hash), /checksum/);
    assert.equal(videoCatalogDescription("two", "sources/video.mov", hash).status, "failed");
  } finally {
    if (old === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = old;
    if (oldAuto === undefined) delete process.env.DREAMCUT_IMPORT_AUTOSTART; else process.env.DREAMCUT_IMPORT_AUTOSTART = oldAuto;
    delete process.env.DREAMCUT_IMPORT_ANALYSIS;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an agent's own description makes an imported video searchable, and must cover every planned sample", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-describe-"));
  const old = process.env.TIMELINE_PROJECTS_DIR, oldAnalysis = process.env.DREAMCUT_IMPORT_ANALYSIS;
  process.env.TIMELINE_PROJECTS_DIR = root; delete process.env.DREAMCUT_IMPORT_ANALYSIS;
  try {
    const bytes = Buffer.from("agent described source");
    const hash = createHash("sha256").update(bytes).digest("hex");
    const dir = path.join(root, "p"); fs.mkdirSync(path.join(dir, "media", "sources"), { recursive: true });
    fs.writeFileSync(path.join(dir, "timeline.json"), JSON.stringify({ elements: [], transitions: [] }));
    fs.writeFileSync(path.join(dir, "metadata.json"), JSON.stringify({ title: "p", delivery_target: "reels" }));
    fs.writeFileSync(path.join(dir, "media", "sources", "hill.mp4"), bytes);
    const asset = { asset_id: "11111111-1111-4111-8111-111111111111", media_path: "sources/hill.mp4", source_sha256: hash };
    fs.writeFileSync(path.join(dir, "source-manifest.json"), JSON.stringify({ schema_version: 1, project_id: "p", updated_at: new Date().toISOString(), assets: [{ ...asset, original_filename: "hill.mp4", source_path: null, storage_mode: "managed_copy", bytes: bytes.length, imported_at: new Date().toISOString() }] }));
    const frames = videoDescriptionTimes(2).map(time => ({ time_seconds: time, description: time < 1 ? "Fog over a green hill" : "A hiker reaches the hilltop at dusk", tags: ["hill"] }));
    assert.throws(() => recordAgentVideoDescription("p", { asset, duration_seconds: 2, summary: "Hill", tags: [], frames: frames.slice(1), uncertainties: [], author: "agent:test" }), /every planned sample/);
    const job = recordAgentVideoDescription("p", { asset, duration_seconds: 2, summary: "A hiker climbs a foggy hill", tags: ["hiker"], frames, uncertainties: [], author: "agent:test" });
    assert.equal(job.status, "complete");
    assert.equal(readVideoDescription(hash)?.frames.length, frames.length);
    const found = searchVideos({ projectId: "p", query: "hiker dusk" });
    assert.equal(found.total, 1);
    assert.deepEqual(found.videos[0].matching_frames.map(frame => frame.time_seconds), frames.slice(1).map(frame => frame.time_seconds));
  } finally {
    if (old === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = old;
    if (oldAnalysis === undefined) delete process.env.DREAMCUT_IMPORT_ANALYSIS; else process.env.DREAMCUT_IMPORT_ANALYSIS = oldAnalysis;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
