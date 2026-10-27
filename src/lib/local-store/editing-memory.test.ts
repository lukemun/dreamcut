import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { createProject, readTimeline, writeMetadata, readMetadata } from "./store";
import { recordMemoryEvent, memoryEvents, writeEditingProfile, effectivePreferences, createExportCheckpoint, memoryDir, migrateLegacyProfileDirectory, profileDir } from "./editing-memory";
import { projectEvidenceClipState } from "./export-evidence";
import { addFrameTag, readFrameTags, updateFrameTag } from "./frame-tags";
const root = fs.mkdtempSync(path.join(os.tmpdir(), "editing-memory-test-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");

test("legacy profile data moves to the DreamCut directory without overwriting a current profile", () => {
  const migrationRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-profile-migration-"));
  const legacy = path.join(migrationRoot, "OpenEdit", "profiles", "default");
  const current = path.join(migrationRoot, "DreamCut", "profiles", "default");
  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, "preferences.json"), "legacy-profile");
  assert.equal(migrateLegacyProfileDirectory(current, legacy), current);
  assert.equal(fs.readFileSync(path.join(current, "preferences.json"), "utf8"), "legacy-profile");
  assert.equal(fs.existsSync(legacy), false);

  fs.mkdirSync(legacy, { recursive: true });
  fs.writeFileSync(path.join(legacy, "preferences.json"), "do-not-overwrite");
  assert.equal(migrateLegacyProfileDirectory(current, legacy), current);
  assert.equal(fs.readFileSync(path.join(current, "preferences.json"), "utf8"), "legacy-profile");
});

test("a configured app-data folder keeps the profile inside it", () => {
  const saved = { profile: process.env.DREAMCUT_PROFILE_DIR, appData: process.env.DREAMCUT_APP_DATA_DIR };
  const appData = path.join(root, "custom app data");
  try {
    delete process.env.DREAMCUT_PROFILE_DIR;
    process.env.DREAMCUT_APP_DATA_DIR = appData;
    assert.equal(profileDir(), path.join(appData, "profiles", "default"));
  } finally {
    process.env.DREAMCUT_PROFILE_DIR = saved.profile;
    if (saved.appData === undefined) delete process.env.DREAMCUT_APP_DATA_DIR; else process.env.DREAMCUT_APP_DATA_DIR = saved.appData;
  }
});

test("export evidence preserves spatial corrections without leaking media or transcript content", () => {
  const projected = projectEvidenceClipState({
    type: "still", timeline_start: 1, duration: 2, source_url: "/private/source.png",
    props: {
      text: "private transcript", media_scale: 0.42, media_offset_x: -0.2, media_offset_y: 0.1,
      sticker_outline: true, semantic_layout: { schema_version: 1, slot: "upper_right", size: "peer", private_note: "omit" },
      groupLayout: { kind: "paragraph_panel", row: 2, rows: 4, private_note: "omit" },
      keyframes: { media_offset_x: [{ t: 0, v: 0 }, { t: 1, v: 0.2 }], grade_contrast: [{ t: 0, v: 1 }] },
    },
  })!;
  assert.deepEqual(projected.layout, {
    media_scale: 0.42, media_offset_x: -0.2, media_offset_y: 0.1, sticker_outline: true,
    semantic_layout: { schema_version: 1, slot: "upper_right", size: "peer" },
    groupLayout: { kind: "paragraph_panel", row: 2, rows: 4 },
    spatial_keyframe_counts: { media_offset_x: 2 },
  });
  assert.equal("source_url" in projected, false);
  assert.equal(JSON.stringify(projected).includes("private transcript"), false);
  assert.equal(JSON.stringify(projected).includes("private_note"), false);
});

test("review notes persist without changing the video timeline", () => {
  createProject("notes", "web");
  const timeline = readTimeline("notes");
  const { tag } = addFrameTag("notes", 3);
  updateFrameTag("notes", tag.id, { note: "Tighten the gap" });
  const saved = readFrameTags("notes").tags[0]!;
  assert.equal(saved.note, "Tighten the gap");
  assert.deepEqual(readTimeline("notes"), timeline);
});

test("evidence is idempotent and tampering fails integrity validation", () => {
  createProject("ledger", "web");
  const input = { id: "same-event", type: "test", actor: "human" as const, summary: "Explicit correction" };
  recordMemoryEvent("ledger", input); recordMemoryEvent("ledger", input);
  assert.equal(memoryEvents("ledger").filter(e => e.id === input.id).length, 1);
  const dir = path.join(memoryDir("ledger"), "events");
  const file = fs.readdirSync(dir).map(name => path.join(dir, name)).find(file => JSON.parse(fs.readFileSync(file, "utf8")).id === input.id)!;
  const changed = JSON.parse(fs.readFileSync(file, "utf8")); changed.summary = "forged";
  fs.writeFileSync(file, JSON.stringify(changed));
  assert.throws(() => memoryEvents("ledger"), /integrity/);
});
test("personal defaults honor status and scope; project rules sort above global rules", () => {
  const base = { text: "Short captions", category: "Captions" as const, evidence: [], origin: "human" as const, updated_at: new Date().toISOString() };
  writeEditingProfile({ version: 1, preferences: [
    { ...base, id: randomUUID(), status: "active", scope: "all" },
    { ...base, id: randomUUID(), status: "active", scope: "vertical-social" },
    { ...base, id: randomUUID(), status: "active", scope: "project", project_id: "one" },
    { ...base, id: randomUUID(), status: "suggested", scope: "all" },
    { ...base, id: randomUUID(), status: "retired", scope: "all" },
  ] });
  assert.equal(effectivePreferences("one", "9:16").length, 3);
  assert.deepEqual(effectivePreferences("one", "9:16").map(p => p.scope), ["project", "vertical-social", "all"]);
  assert.equal(effectivePreferences("two", "16:9").length, 1);
});
test("export checkpoints freeze evidence and a repeat export reuses the same checkpoint", () => {
  createProject("frozen", "web");
  const timeline = readTimeline("frozen");
  const first = createExportCheckpoint("frozen", "export-one", { timeline, metadata: readMetadata("frozen") });
  writeMetadata("frozen", { ...readMetadata("frozen"), title: "Changed after export" }, "title_change");
  const again = createExportCheckpoint("frozen", "export-one", { different: true });
  assert.deepEqual(again, first);
  assert.deepEqual(readTimeline("frozen"), timeline);
});
