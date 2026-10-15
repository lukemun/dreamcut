import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { LIBRARY_FORMAT_VERSION, LibraryError, configuredLibraryDir, createLibrary, defaultLibraryDir, libraryConfigPath, libraryMarkerPath, readLibrary, saveLibraryChoice } from "./library";
import { planProjectMigration, runProjectMigration } from "./migrate";
import { projectsRoot } from "../local-store/paths";
import { createProject, readMetadata, writeMetadata } from "../local-store/store";
import { projectsRootFor } from "../../../mcp/projects-root.mjs";
import { librarySetup, libraryStatus } from "./setup";
import { readStoryboard, updateStoryboard } from "../local-store/storyboard";
import { ingestMediaBuffer, readProjectSourceManifest } from "../local-store/media-ingest";
import { readTimelineSnapshot } from "../local-store/store";
import { libraryProjectsDir } from "./library";
import { GET, POST } from "../../app/api/library/route";

// Every function reads the environment when called, so setting it here isolates the whole file.
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-library-"));
// Never touch the real Application Support folder or the repository's projects/.
process.env.DREAMCUT_APP_DATA_DIR = path.join(scratch, "app data");
delete process.env.TIMELINE_PROJECTS_DIR;
delete process.env.DREAMCUT_LIBRARY_DIR;
// Under a loaded parallel run, a migration's last writes can land while the folder is being removed; retry briefly.
test.after(async () => {
  for (let attempt = 1; ; attempt += 1) {
    try { fs.rmSync(scratch, { recursive: true, force: true }); return; }
    catch (error) { if (attempt >= 10) throw error; await new Promise(resolve => setTimeout(resolve, 100)); }
  }
});


const dir = (...parts: string[]) => path.join(scratch, ...parts);
const writeJson = (file: string, value: unknown) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(value)); };
const project = (root: string, id: string, media = "frame bytes") => {
  writeJson(path.join(root, id, "timeline.json"), { schema_version: 3, elements: [] });
  fs.mkdirSync(path.join(root, id, "media", "sources"), { recursive: true });
  fs.writeFileSync(path.join(root, id, "media", "sources", "clip one.mp4"), media);
};

test("a Library is created in an empty folder whose path has spaces and non-ASCII characters", () => {
  const library = createLibrary(dir("Vidéos d'été", "DreamCut Library"), "test");
  assert.equal(library.access, "read-write");
  assert.equal(library.marker.format_version, LIBRARY_FORMAT_VERSION);
  assert.ok(fs.statSync(path.join(library.root, "projects")).isDirectory());
  assert.deepEqual(readLibrary(library.root).marker, library.marker);
});

test("creating refuses an existing Library and a folder that already holds files", () => {
  const root = createLibrary(dir("existing"), "test").root;
  assert.throws(() => createLibrary(root, "test"), (e: InstanceType<typeof LibraryError>) => e.code === "EXISTS");
  fs.mkdirSync(dir("busy"), { recursive: true });
  fs.writeFileSync(dir("busy", "notes.txt"), "mine");
  assert.throws(() => createLibrary(dir("busy"), "test"), (e: InstanceType<typeof LibraryError>) => e.code === "NOT_EMPTY");
  assert.equal(fs.readFileSync(dir("busy", "notes.txt"), "utf8"), "mine", "nothing in a refused folder is touched");
});

test("a newer Library opens read-only, one this version cannot read is refused, and unknown fields survive", () => {
  const root = createLibrary(dir("newer"), "test").root;
  const marker = JSON.parse(fs.readFileSync(libraryMarkerPath(root), "utf8"));
  writeJson(libraryMarkerPath(root), { ...marker, format_version: LIBRARY_FORMAT_VERSION + 1, future_field: { kept: true } });
  const newer = readLibrary(root);
  assert.equal(newer.access, "read-only");
  assert.match(newer.reason ?? "", /newer DreamCut/);
  assert.deepEqual(newer.marker.future_field, { kept: true });
  writeJson(libraryMarkerPath(root), { ...marker, format_version: 9, min_reader_version: 9 });
  assert.throws(() => readLibrary(root), (e: InstanceType<typeof LibraryError>) => e.code === "TOO_NEW");
});

test("missing and invalid markers are distinguished", () => {
  fs.mkdirSync(dir("plain"), { recursive: true });
  assert.throws(() => readLibrary(dir("plain")), (e: InstanceType<typeof LibraryError>) => e.code === "NOT_A_LIBRARY");
  writeJson(dir("broken", "dreamcut-library.json"), { format: "something-else" });
  assert.throws(() => readLibrary(dir("broken")), (e: InstanceType<typeof LibraryError>) => e.code === "INVALID_MARKER");
});

test("default locations are the user's video folder on each platform", () => {
  assert.equal(defaultLibraryDir("darwin", {}, "/Users/ana"), "/Users/ana/Movies/DreamCut Library");
  assert.equal(defaultLibraryDir("win32", { USERPROFILE: "C:\\Users\\Ana" }, "C:\\Users\\Ana"), "C:\\Users\\Ana\\Videos\\DreamCut Library");
  assert.equal(defaultLibraryDir("linux", {}, "/home/ana"), "/home/ana/Videos/DreamCut Library");
});

test("the saved choice keeps other settings, and projects resolve into the chosen Library once it exists", () => {
  writeJson(libraryConfigPath(), { other_setting: 1 });
  const chosen = dir("chosen Library");
  saveLibraryChoice(chosen);
  assert.equal(configuredLibraryDir(), chosen);
  assert.equal(JSON.parse(fs.readFileSync(libraryConfigPath(), "utf8")).other_setting, 1);
  assert.equal(projectsRoot(), path.resolve(process.cwd(), "projects"), "no marker yet: the old default stays");
  createLibrary(chosen, "test");
  assert.equal(projectsRoot(), path.join(chosen, "projects"));
  process.env.TIMELINE_PROJECTS_DIR = dir("override");
  try { assert.equal(projectsRoot(), dir("override"), "the explicit override still wins"); }
  finally { delete process.env.TIMELINE_PROJECTS_DIR; }
});

test("migration moves projects on the same volume, skips name conflicts and ignores non-projects", () => {
  const from = dir("old projects");
  project(from, "trip");
  project(from, "taken");
  fs.mkdirSync(path.join(from, "not-a-project"), { recursive: true });
  fs.writeFileSync(path.join(from, ".timeline.json.123.tmp"), "half written");
  const library = createLibrary(dir("move target"), "test");
  project(path.join(library.root, "projects"), "taken", "the Library's own copy");
  const plan = planProjectMigration(from, library);
  assert.equal(plan.sameVolume, true);
  assert.deepEqual(plan.projects.map(p => [p.id, p.action]), [["taken", "skip"], ["trip", "move"]]);
  const results = runProjectMigration(plan);
  assert.deepEqual(results.map(r => [r.id, r.outcome]), [["taken", "skipped"], ["trip", "moved"]]);
  assert.ok(fs.existsSync(path.join(library.root, "projects", "trip", "media", "sources", "clip one.mp4")));
  assert.equal(fs.readFileSync(path.join(library.root, "projects", "taken", "media", "sources", "clip one.mp4"), "utf8"), "the Library's own copy", "a conflict never overwrites");
  assert.ok(fs.existsSync(path.join(from, "taken")), "a skipped project stays where it was");
});

test("migration across volumes copies, verifies and keeps the originals", () => {
  const from = dir("other volume");
  project(from, "festival", "x".repeat(5000));
  const library = createLibrary(dir("copy target"), "test");
  const plan = planProjectMigration(from, library);
  const copyPlan = { ...plan, sameVolume: false, projects: plan.projects.map(p => ({ ...p, action: "copy" as const })) };
  assert.deepEqual(runProjectMigration(copyPlan).map(r => r.outcome), ["copied"]);
  assert.equal(fs.statSync(path.join(library.root, "projects", "festival", "media", "sources", "clip one.mp4")).size, 5000);
  assert.ok(fs.existsSync(path.join(from, "festival", "timeline.json")), "originals are never deleted");
  assert.deepEqual(fs.readdirSync(path.join(library.root, "projects")).filter(n => n.startsWith(".")), [], "no staging folder left behind");
});

test("project settings keep fields from a newer DreamCut through a read and a write, without granting anything", () => {
  process.env.TIMELINE_PROJECTS_DIR = dir("settings projects");
  try {
    createProject("future", "web", "Future project");
    const file = path.join(dir("settings projects"), "future", "metadata.json");
    writeJson(file, { ...JSON.parse(fs.readFileSync(file, "utf8")), color_space: "rec2020", agent_workspace: "yes" });
    const read = readMetadata("future") as ReturnType<typeof readMetadata> & { color_space?: string };
    assert.equal(read.color_space, "rec2020");
    assert.equal(read.agent_workspace, undefined, "only a real boolean grant is honoured");
    writeMetadata("future", { ...read, title: "Renamed" }, "test_metadata");
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(saved.color_space, "rec2020");
    assert.equal(saved.title, "Renamed");
  } finally { delete process.env.TIMELINE_PROJECTS_DIR; }
});

test("the MCP's plain-JS resolver agrees with the editor's, and both refuse a Library from a newer DreamCut", () => {
  const editorRoot = process.cwd();
  const both = () => [projectsRoot(), projectsRootFor(editorRoot)];
  const agreeOn = (expected: string) => assert.deepEqual(both(), [expected, expected]);
  const library = dir("parity Library");
  process.env.DREAMCUT_LIBRARY_DIR = library;
  try {
    agreeOn(path.join(editorRoot, "projects"));
    process.env.DREAMCUT_DEFAULT_PROJECTS_DIR = dir("packaged default");
    agreeOn(dir("packaged default"));
    delete process.env.DREAMCUT_DEFAULT_PROJECTS_DIR;
    createLibrary(library, "test");
    agreeOn(path.join(library, "projects"));
    process.env.TIMELINE_PROJECTS_DIR = dir("parity override");
    agreeOn(dir("parity override"));
    delete process.env.TIMELINE_PROJECTS_DIR;
    const marker = JSON.parse(fs.readFileSync(libraryMarkerPath(library), "utf8"));
    writeJson(libraryMarkerPath(library), { ...marker, format_version: LIBRARY_FORMAT_VERSION + 1 });
    const later = new Date(Date.now() + 5000);
    fs.utimesSync(libraryMarkerPath(library), later, later);
    assert.throws(() => projectsRoot(), /newer DreamCut/);
    assert.throws(() => projectsRootFor(editorRoot), /newer DreamCut/);
    for (const broken of [{ ...marker, min_reader_version: undefined }, { ...marker, library_id: "not-a-uuid" }, { ...marker, format_version: 0 }]) {
      writeJson(libraryMarkerPath(library), broken);
      const bumped = new Date(Date.now() + 10_000 + Math.random() * 1000);
      fs.utimesSync(libraryMarkerPath(library), bumped, bumped);
      assert.throws(() => projectsRoot(), /not a valid DreamCut Library marker/);
      assert.throws(() => projectsRootFor(editorRoot), /invalid DreamCut Library marker/);
    }
  } finally { delete process.env.DREAMCUT_LIBRARY_DIR; delete process.env.TIMELINE_PROJECTS_DIR; }
});

test("setup creates and chooses a Library, plans a migration, and moves only the confirmed projects", () => {
  const env = { ...process.env, DREAMCUT_LIBRARY_DIR: "" };
  const cwd = dir("setup repo");
  project(path.join(cwd, "projects"), "alpha");
  project(path.join(cwd, "projects"), "beta");
  const before = libraryStatus(env, cwd);
  assert.deepEqual(before.legacy_folders.map(f => [f.dir, f.projects]), [[path.join(cwd, "projects"), 2]]);
  const created = librarySetup({ action: "create", dir: dir("setup Library") }, env, cwd);
  assert.equal(created.library?.root, dir("setup Library"));
  assert.equal(configuredLibraryDir(env), dir("setup Library"));
  const { plan } = librarySetup({ action: "plan_migration", from: path.join(cwd, "projects") }, env, cwd) as { plan: { projects: { id: string }[]; total_bytes: number } };
  assert.deepEqual(plan.projects.map(p => p.id), ["alpha", "beta"]);
  assert.ok(plan.total_bytes > 0);
  assert.throws(() => librarySetup({ action: "migrate", from: path.join(cwd, "projects"), confirm: true, project_ids: ["gamma"] }, env, cwd), /Not in the migration plan: gamma/);
  assert.throws(() => librarySetup({ action: "migrate", from: path.join(cwd, "projects"), project_ids: ["alpha"] }, env, cwd), /confirm/);
  const moved = librarySetup({ action: "migrate", from: path.join(cwd, "projects"), confirm: true, project_ids: ["alpha"] }, env, cwd) as { results: { id: string; outcome: string }[] };
  assert.deepEqual(moved.results.map(r => [r.id, r.outcome]), [["alpha", "moved"]]);
  assert.ok(fs.existsSync(path.join(cwd, "projects", "beta")), "an unconfirmed project stays where it was");
  assert.equal(libraryStatus(env, cwd).legacy_folders[0]?.projects, 1);
});

test("setup refuses to choose a folder that is not a Library or one from a newer DreamCut, and reports a development override", () => {
  assert.throws(() => librarySetup({ action: "use_existing", dir: dir("plain") }), (e: InstanceType<typeof LibraryError>) => e.code === "NOT_A_LIBRARY");
  const newer = createLibrary(dir("setup newer"), "test").root;
  writeJson(libraryMarkerPath(newer), { ...JSON.parse(fs.readFileSync(libraryMarkerPath(newer), "utf8")), format_version: LIBRARY_FORMAT_VERSION + 1 });
  const env = { ...process.env, DREAMCUT_LIBRARY_DIR: "" };
  const before = configuredLibraryDir(env);
  assert.throws(() => librarySetup({ action: "use_existing", dir: newer }, env), (e: InstanceType<typeof LibraryError>) => e.code === "TOO_NEW");
  assert.equal(configuredLibraryDir(env), before, "the saved choice is unchanged");
  const status = libraryStatus({ ...process.env, TIMELINE_PROJECTS_DIR: dir("pinned") });
  assert.equal(status.projects_override, dir("pinned"));
});

test("the route answers status and maps errors to clear statuses", async () => {
  const status = await (await GET()).json();
  assert.ok("suggested_dir" in status);
  const bad = await POST(new Request("http://127.0.0.1/api/library", { method: "POST", body: JSON.stringify({ action: "explode" }) }));
  assert.equal(bad.status, 422);
  const notLibrary = await POST(new Request("http://127.0.0.1/api/library", { method: "POST", body: JSON.stringify({ action: "use_existing", dir: dir("plain") }) }));
  assert.equal(notLibrary.status, 409);
  assert.equal((await notLibrary.json()).code, "NOT_A_LIBRARY");
});

test("a storyboard keeps fields from a newer DreamCut through a save, and a newer storyboard is refused clearly", async () => {
  process.env.TIMELINE_PROJECTS_DIR = dir("storyboard projects");
  try {
    createProject("boards", "web", "Boards");
    const file = path.join(dir("storyboard projects"), "boards", "storyboard.json");
    const groupId = "11111111-1111-4111-8111-111111111111";
    writeJson(file, { schema_version: 1, revision: 4, past: [], future: [], future_record_field: "kept",
      content: { sources: [], marks: [], shots: [], groups: [{ id: groupId, name: "Intro", color: "teal" }], board_theme: "dark" } });
    const read = readStoryboard("boards");
    assert.equal((read.content as Record<string, unknown>).board_theme, "dark");
    await updateStoryboard("boards", { action: "save", revision: 4, content: { ...read.content, groups: read.content.groups.map(g => ({ ...g, name: "Opening" })) } });
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    assert.equal(saved.content.board_theme, "dark");
    assert.equal(saved.content.groups[0].color, "teal");
    assert.equal(saved.content.groups[0].name, "Opening");
    assert.equal(saved.future_record_field, "kept");
    writeJson(file, { ...saved, schema_version: 2 });
    assert.throws(() => readStoryboard("boards"), /newer DreamCut \(version 2\)/);
  } finally { delete process.env.TIMELINE_PROJECTS_DIR; }
});

test("a media list saved by a newer DreamCut is refused clearly, not reported as corrupt", () => {
  process.env.TIMELINE_PROJECTS_DIR = dir("manifest projects");
  try {
    createProject("clips", "web", "Clips");
    writeJson(path.join(dir("manifest projects"), "clips", "source-manifest.json"), { schema_version: 2, project_id: "clips", assets: [] });
    assert.throws(() => readProjectSourceManifest("clips"), /newer DreamCut \(version 2\)/);
  } finally { delete process.env.TIMELINE_PROJECTS_DIR; }
});

test("an existing project reopens identically after migrating into the Library", () => {
  const oldRoot = dir("reopen old projects");
  process.env.TIMELINE_PROJECTS_DIR = oldRoot;
  let before: { timeline: string; metadata: unknown; manifest: unknown; storyboard: unknown };
  try {
    createProject("vacation", "web", "Vacation");
    ingestMediaBuffer({ projectId: "vacation", buffer: Buffer.from("not really a video"), originalFilename: "beach day.mp4" });
    writeMetadata("vacation", { ...readMetadata("vacation"), title: "Vacation cut" }, "test_metadata");
    before = { timeline: readTimelineSnapshot("vacation").revision, metadata: readMetadata("vacation"),
      manifest: readProjectSourceManifest("vacation"), storyboard: readStoryboard("vacation").content };
  } finally { delete process.env.TIMELINE_PROJECTS_DIR; }
  const library = createLibrary(dir("reopen Library"), "test");
  const results = runProjectMigration(planProjectMigration(oldRoot, library));
  assert.deepEqual(results.map(r => r.outcome), ["moved"]);
  process.env.TIMELINE_PROJECTS_DIR = libraryProjectsDir(library.root);
  try {
    assert.equal(readTimelineSnapshot("vacation").revision, before.timeline, "timeline bytes unchanged");
    assert.deepEqual(readMetadata("vacation"), before.metadata);
    assert.deepEqual(readProjectSourceManifest("vacation"), before.manifest);
    assert.deepEqual(readStoryboard("vacation").content, before.storyboard);
    const asset = readProjectSourceManifest("vacation").assets[0];
    assert.equal(fs.readFileSync(path.join(libraryProjectsDir(library.root), "vacation", "media", asset.media_path), "utf8"), "not really a video");
  } finally { delete process.env.TIMELINE_PROJECTS_DIR; }
});

test("a read-only Library cannot be migrated into", () => {
  const root = createLibrary(dir("frozen"), "test").root;
  const marker = JSON.parse(fs.readFileSync(libraryMarkerPath(root), "utf8"));
  writeJson(libraryMarkerPath(root), { ...marker, format_version: LIBRARY_FORMAT_VERSION + 1 });
  assert.throws(() => planProjectMigration(dir("old projects"), readLibrary(root)), /newer DreamCut/);
});
