import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createProject, readTimeline, readMetadata } from "./store";
import { ingestMediaBuffer, readProjectSourceManifest } from "./media-ingest";
import { readWorkspaceMediaSelection, updateWorkspaceMediaSelection, prepareLibraryGenerationReference, prepareLibraryAudioMedia, workspaceMediaSelectionContext } from "./workspace-media-selection";
import { timelinePayload } from "./timeline-payload";

test("Library selection is durable context; explicit reference import preserves bytes and does not place media", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-library-selection-"));
  const keys = ["TIMELINE_PROJECTS_DIR", "TIMELINE_VISUAL_CATALOG_DIR", "TIMELINE_IMAGE_CATALOG_DIR"] as const;
  const previous = keys.map(key => process.env[key]);
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  process.env.TIMELINE_VISUAL_CATALOG_DIR = path.join(root, "catalog");
  process.env.TIMELINE_IMAGE_CATALOG_DIR = path.join(root, "images");
  try {
    createProject("selection-test", "reels");
    const bytes = await sharp({ create: { width: 24, height: 24, channels: 3, background: "#267080" } }).png().toBuffer();
    const local = ingestMediaBuffer({ projectId: "selection-test", originalFilename: "local.png", buffer: bytes });
    const catalogFile = path.join(root, "catalog/media/owned/test.png");
    fs.mkdirSync(path.dirname(catalogFile), { recursive: true }); fs.writeFileSync(catalogFile, bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    fs.writeFileSync(path.join(root, "catalog/catalog.json"), JSON.stringify({ schema_version: 1, assets: [{
      id: "test-image", type: "still", title: "Catalog test image", description: "Synthetic image", file: "owned/test.png", sha256, width: 24, height: 24,
      source: { provider: "test", asset_url: "https://example.com/image", license_name: "Test", license_url: "https://example.com/license", source_status: "owned", acquired_at: "2026-01-01T00:00:00.000Z", acquisition_notes: "Synthetic test fixture" },
      annotation: { meaning: "Synthetic image", use_cases: ["testing"], tone: ["neutral"], template_structure: "Solid color", cultural_context: "None", avoid_when: [], tags: ["test"], confidence: "high", sources: [{ label: "Fixture", url: "https://example.com/image", kind: "original_source" }] },
    }] }));
    const wav = Buffer.alloc(44 + 1600);
    wav.write("RIFF", 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write("WAVEfmt ", 8); wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22); wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34); wav.write("data", 36); wav.writeUInt32LE(1600, 40);
    const audio = ingestMediaBuffer({ projectId: "selection-test", originalFilename: "silence.wav", buffer: wav });
    const audioUrl = `/api/projects/selection-test/media/${audio.media_path}`;
    const count = readProjectSourceManifest("selection-test").assets.length;
    assert.equal((await prepareLibraryAudioMedia("selection-test", audioUrl)).source, audio.media_path);
    assert.equal(readProjectSourceManifest("selection-test").assets.length, count, "Existing audio must not be copied again");
    await assert.rejects(prepareLibraryAudioMedia("selection-test", `https://outside.example${audioUrl}`), /unavailable/);
    await assert.rejects(prepareLibraryAudioMedia("selection-test", "/api/projects/other/media/silence.wav"), /unavailable/);
    await assert.rejects(prepareLibraryGenerationReference("selection-test", audio.media_path), /image or video/);
    const beforeTimeline = readTimeline("selection-test"), beforeMetadata = readMetadata("selection-test");
    await Promise.all([updateWorkspaceMediaSelection("selection-test", { action: "toggle", source: local.media_path }),
      updateWorkspaceMediaSelection("selection-test", { action: "toggle", source: "catalog:visual:test-image" })]);
    assert.equal(readWorkspaceMediaSelection("selection-test").sources.length, 2);
    assert.equal(workspaceMediaSelectionContext("selection-test").assets.length, 2);
    assert.equal(timelinePayload("selection-test", beforeTimeline).library_selection.sources.length, 2);
    await assert.rejects(updateWorkspaceMediaSelection("selection-test", { action: "set", sources: ["../../outside.png"] }), /unavailable/);
    assert.equal(readWorkspaceMediaSelection("selection-test").sources.length, 2);
    const reference = await prepareLibraryGenerationReference("selection-test", "catalog:visual:test-image");
    const manifest = readProjectSourceManifest("selection-test");
    const imported = manifest.assets.find(a => a.media_path === reference.source)!;
    assert.equal(imported.storage_mode, "managed_copy"); assert.equal(imported.source_sha256, sha256);
    assert.deepEqual(fs.readFileSync(path.join(root, "projects/selection-test/media", reference.source)), bytes);
    assert.deepEqual(await prepareLibraryGenerationReference("selection-test", "catalog:visual:test-image"), reference);
    assert.deepEqual(readTimeline("selection-test"), beforeTimeline);
    assert.deepEqual(readMetadata("selection-test"), beforeMetadata);
    await updateWorkspaceMediaSelection("selection-test", { action: "set", sources: [] });
    assert.equal(readWorkspaceMediaSelection("selection-test").sources.length, 0);
    assert.ok(fs.existsSync(catalogFile));
  } finally {
    keys.forEach((key, i) => { if (previous[i] === undefined) delete process.env[key]; else process.env[key] = previous[i]; });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
