import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "./store";
import { readPreviewSettings, writeAutomaticPreviewQuality, writePreviewSettings } from "./preview-settings";
import {
  enqueueMediaPreparation, placeable, preparedPlacement, readPreparation, refreshStaleProjectPreviews,
  writePreparation, PREPARATION_RECIPE, PREVIEW_POLICY_VERSION, type PreparedMedia,
} from "./media-preparation";

function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "preview-settings-"));
  const previous = { profile: process.env.DREAMCUT_PROFILE_DIR, projects: process.env.TIMELINE_PROJECTS_DIR, auto: process.env.MEDIA_PREPARATION_AUTOSTART };
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  process.env.MEDIA_PREPARATION_AUTOSTART = "0";
  const restore = () => {
    for (const [key, value] of [["DREAMCUT_PROFILE_DIR", previous.profile], ["TIMELINE_PROJECTS_DIR", previous.projects], ["MEDIA_PREPARATION_AUTOSTART", previous.auto]] as const) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  };
  return { root, settingsFile: path.join(root, "profile", "preview-settings.json"), restore };
}

/** A ready package on disk: source, render authority = source, and an earlier preview. */
function readyPackage(root: string, projectId: string, quality: PreparedMedia["preview_quality"]) {
  const media = path.join(root, "projects", projectId, "media");
  fs.mkdirSync(path.join(media, ".prepared/editor-media-v1/abc/gen"), { recursive: true });
  fs.writeFileSync(path.join(media, "talk.mov"), "source bytes");
  fs.writeFileSync(path.join(media, ".prepared/editor-media-v1/abc/gen/preview.mp4"), "preview bytes");
  const stat = fs.statSync(path.join(media, "talk.mov"));
  const record: PreparedMedia = {
    recipe: PREPARATION_RECIPE, source: "talk.mov", size: stat.size, mtime: stat.mtimeMs, state: "ready",
    preview_policy_version: PREVIEW_POLICY_VERSION, preview_quality: quality, prepared_preview_quality: quality, preview_frame_rate: 30,
    preview: ".prepared/editor-media-v1/abc/gen/preview.mp4", preview_hash: "x", render: "talk.mov", duration: 1, alpha: false,
  };
  writePreparation(projectId, record);
  return record;
}

test("unreadable preview settings never re-prepare a project at another size", () => {
  const { root, settingsFile, restore } = sandbox();
  try {
    createProject("talk", "web");
    writeAutomaticPreviewQuality("talk", "hd");
    assert.deepEqual(readPreviewSettings("talk"), { choice: "prepared", quality: "hd", known: true });
    readyPackage(root, "talk", "hd");
    assert.equal(enqueueMediaPreparation("talk", "talk.mov")?.state, "ready", "a package at the current size is kept");

    // A torn or foreign write: this process keeps the last settings it read.
    fs.writeFileSync(settingsFile, "{\"projects\": {\"talk\"");
    assert.deepEqual(readPreviewSettings("talk"), { choice: "prepared", quality: "hd", known: true });
    assert.equal(enqueueMediaPreparation("talk", "talk.mov")?.state, "ready");
    assert.throws(() => writePreviewSettings("other", "balanced"), "an unreadable file is never replaced with one project");
    assert.equal(fs.readFileSync(settingsFile, "utf8"), "{\"projects\": {\"talk\"");
  } finally { restore(); }
});

test("a process that never read the settings keeps the prepared size while they are unreadable", () => {
  const { root, restore } = sandbox();
  try {
    createProject("talk", "web");
    readyPackage(root, "talk", "hd");
    // The last good read is per file: a profile this process never read stands in for another process.
    process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile-2");
    fs.mkdirSync(process.env.DREAMCUT_PROFILE_DIR, { recursive: true });
    fs.writeFileSync(path.join(process.env.DREAMCUT_PROFILE_DIR, "preview-settings.json"), "not json");
    assert.equal(readPreviewSettings("talk").known, false);
    assert.equal(refreshStaleProjectPreviews("talk"), 0, "no stale refresh without readable settings");
    const kept = enqueueMediaPreparation("talk", "talk.mov");
    assert.equal(kept?.state, "ready");
    assert.equal(kept?.preview_quality, "hd");
    // No file at all is a real "no setting": Automatic starts at the default size.
    fs.rmSync(path.join(process.env.DREAMCUT_PROFILE_DIR, "preview-settings.json"));
    assert.deepEqual(readPreviewSettings("talk"), { choice: "prepared", quality: "prepared", known: true });
  } finally { restore(); }
});

test("concurrent writers in several processes keep every project's setting", async () => {
  const { settingsFile, restore } = sandbox();
  try {
    const module = path.resolve("src/lib/local-store/preview-settings.ts");
    const writers = Array.from({ length: 6 }, (_, index) => new Promise<number>((resolve, reject) => {
      const script = `const i0 = await import(${JSON.stringify(module)}); const m = i0.writePreviewSettings ? i0 : i0.default; for (let i = 0; i < 15; i++) m.writePreviewSettings("p${index}-" + i, "hd");`;
      const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { env: process.env, stdio: ["ignore", "ignore", "pipe"] });
      let stderr = "";
      child.stderr.on("data", chunk => { stderr += chunk; });
      child.on("error", reject);
      child.on("exit", code => code === 0 ? resolve(code) : reject(new Error(stderr)));
    }));
    await Promise.all(writers);
    const stored = JSON.parse(fs.readFileSync(settingsFile, "utf8"));
    assert.equal(Object.keys(stored.projects).length, 6 * 15, "no write was lost to another process's read-modify-write");
    assert.deepEqual(fs.readdirSync(path.dirname(settingsFile)).filter(name => name !== "preview-settings.json"), [], "no lock or temporary file is left");
  } finally { restore(); }
});

test("video being prepared again stays placeable on its earlier package, including after that attempt fails", () => {
  const { root, restore } = sandbox();
  try {
    createProject("talk", "web");
    writeAutomaticPreviewQuality("talk", "hd");
    readyPackage(root, "talk", "balanced");
    const url = "/api/projects/talk/media/talk.mov";
    const requeued = enqueueMediaPreparation("talk", "talk.mov")!;
    assert.equal(requeued.state, "preparing");
    assert.equal(requeued.preview_quality, "hd");
    assert.equal(requeued.preview, ".prepared/editor-media-v1/abc/gen/preview.mp4", "the earlier package stays on the record");
    assert.ok(placeable("talk", requeued));
    assert.equal(preparedPlacement("talk", url, {}).props.preview_source_url, "/api/projects/talk/media/.prepared/editor-media-v1/abc/gen/preview.mp4");
    writePreparation("talk", { ...requeued, state: "failed", error: "encoder crashed" });
    assert.equal(preparedPlacement("talk", url, {}).source_url, url, "a failed re-preparation keeps the earlier package placeable");

    // A first preparation has no package to fall back on.
    const first: PreparedMedia = { ...readPreparation("talk", "talk.mov")!, state: "preparing" };
    delete first.preview; delete first.render; delete first.prepared_preview_quality;
    writePreparation("talk", first);
    assert.throws(() => preparedPlacement("talk", url, {}), /not ready/);
    writePreparation("talk", { ...first, state: "failed" });
    assert.throws(() => preparedPlacement("talk", url, {}), /not ready/);
  } finally { restore(); }
});
