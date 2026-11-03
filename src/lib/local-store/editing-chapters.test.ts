import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { createProject } from "./store";
import { projectHistoryDir, projectProposalPath } from "./paths";
import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";
import { recordEditingFeedback } from "./editing-feedback";
import { snapshotLabel } from "./history-list";
import { CHAPTER_HEADS_VERSION, chapterChangesDir, chapterHeadsPath, createExportCheckpoint, editChapters, readMemoryPage, readMemoryView, memoryChapter, memoryChapterPage, memoryEvents, memoryHash, recordMemoryEvent } from "./editing-memory";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "editing-chapters-test-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");

/** The full-rescan implementation editChapters replaced, kept verbatim as the oracle. */
type Clip = { id: string; type: string; timeline_start: number; duration: number; props?: Record<string, unknown> };
type Snap = Record<string, any> & { op: string; at: string; timeline: { elements: Clip[]; transitions?: unknown[] } };
function referenceChapters(projectId: string) {
  const dir = projectHistoryDir(projectId);
  const names = fs.readdirSync(dir).filter(f => f.endsWith(".json")).sort();
  const clipSummary = (c: Clip) => { const { updated_at: _a, created_at: _b, ...values } = c as Clip & { updated_at?: string; created_at?: string }; return values; };
  const savedActor = (v: unknown) => ["human", "agent", "system"].includes(String(v)) ? v : "unknown";
  const category = (op: string) => /caption|text|font/.test(op) ? "Captions" : /audio|music|voice|volume/.test(op) ? "Audio" : /mark|frame_tag/.test(op) ? "Marks"
    : /trim|cut|split|duration|ripple/.test(op) ? "Pacing" : /agent|proposal/.test(op) ? "Review" : "Timeline";
  let previous: Snap | undefined;
  const chapters: unknown[] = [];
  for (const name of names) {
    const snap = readJsonFile<Snap | null>(path.join(dir, name), null);
    if (!snap?.timeline?.elements) continue;
    const before = new Map((previous?.timeline.elements ?? []).map(c => [c.id, c]));
    const after = new Map(snap.timeline.elements.map(c => [c.id, c]));
    const changes: { id: string; label: string; before: unknown; after: any }[] = [];
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const a = before.get(id), b = after.get(id);
      if (memoryHash(a ? clipSummary(a) : null) === memoryHash(b ? clipSummary(b) : null)) continue;
      const c = b ?? a!;
      changes.push({ id, label: String(c.props?.text ?? c.props?.label ?? c.type).slice(0, 120), before: a ? clipSummary(a) : null, after: b ? clipSummary(b) : null });
    }
    const context_changes = (["metadata", "frame_tags", "auditions", "layout_proposals", "transitions"] as const).flatMap(field => {
      const a = (field === "transitions" ? previous?.timeline.transitions : previous?.[field]) ?? null;
      const b = (field === "transitions" ? snap.timeline.transitions : snap[field]) ?? null;
      return memoryHash(a) === memoryHash(b) ? [] : [{ field, before: a, after: b }];
    });
    if (changes.length || context_changes.length || /frame_tag/.test(snap.op) && !snap.op.endsWith("_before")) {
      chapters.push({ id: name, time: snap.at, operation: snap.op, category: category(snap.op),
        actor: savedActor(snap.actor), initiated_by: savedActor(snap.initiated_by), attribution_source: snap.attribution_source ?? "unknown",
        responds_to_feedback_ids: snap.responds_to_feedback_ids, transaction_id: snap.transaction_id, proposal_ids: snap.proposal_ids, restores_snapshot_id: snap.restores_snapshot_id,
        label: snapshotLabel(projectId, snap, snap.op),
        summary: `${snap.op.replaceAll("_", " ")} · ${changes.length ? `${changes.length} clip${changes.length === 1 ? "" : "s"} changed` : "project settings or review marks"}`,
        seconds: changes.length ? Math.min(...changes.map(c => Number(c.after?.timeline_start ?? c.before?.timeline_start ?? 0))) : null, changes, context_changes });
    }
    previous = snap;
  }
  return chapters;
}

let clock = Date.UTC(2026, 0, 1);
function writeSnapshot(projectId: string, name: string, body: unknown) {
  const file = path.join(projectHistoryDir(projectId), name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof body === "string" ? body : JSON.stringify(body));
  // Distinct mtimes, so a same-size rewrite is still a different stat key.
  clock += 1000;
  fs.utimesSync(file, new Date(clock), new Date(clock));
}
const clips = (count: number, edit = -1, extra: Partial<Clip> = {}) => Array.from({ length: count }, (_, i) => ({
  id: `clip-${i}`, type: i % 2 ? "caption" : "video_clip", timeline_start: i, duration: 1, updated_at: `t${i === edit ? "x" : ""}`,
  props: { text: `word ${i}${i === edit ? " edited" : ""}`, words: Array.from({ length: 6 }, (_, w) => ({ w, s: i + w / 10 })) }, ...(i === edit ? extra : {}),
}));
const snapshot = (op: string, index: number, elements: unknown[], more: Record<string, unknown> = {}) => ({
  op, at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), actor: index % 2 ? "agent" : "human", timeline: { elements, transitions: [] }, metadata: { aspect: "16:9" }, ...more,
});
// JSON comparison also checks key order, which the ledger download and API responses expose.
const same = (projectId: string) => assert.equal(JSON.stringify(editChapters(projectId)), JSON.stringify(referenceChapters(projectId)));

test("incremental chapters match a full rescan through append, rewrite, removal and unreadable snapshots", () => {
  createProject("chapters", "web");
  const proposalId = "20260101T000000-abcdef12";
  fs.mkdirSync(path.dirname(projectProposalPath("chapters", proposalId)), { recursive: true });
  fs.writeFileSync(projectProposalPath("chapters", proposalId), JSON.stringify({ proposal: { summary: "Tighten the intro" } }));
  writeSnapshot("chapters", "0001-trim_clip.json", snapshot("trim_clip", 1, clips(40)));
  writeSnapshot("chapters", "0002-caption_text.json", snapshot("caption_text", 2, clips(40, 3)));
  writeSnapshot("chapters", "0003-frame_tag_add.json", snapshot("frame_tag_add", 3, clips(40, 3), { frame_tags: [{ at: 1 }] }));
  writeSnapshot("chapters", "0004-editor_agent_workshop.json", snapshot("editor_agent_workshop", 4, clips(41, 3), { proposal_ids: [proposalId], label: "Apply" }));
  writeSnapshot("chapters", "0005-noop_before.json", snapshot("frame_tag_add_before", 5, clips(41, 3), { proposal_ids: [proposalId] }));
  same("chapters");
  assert.ok(editChapters("chapters").some(c => c.label.includes("Tighten the intro")));

  // Append: only the new snapshot and its predecessor are diffed.
  writeSnapshot("chapters", "0006-split_clip.json", snapshot("split_clip", 6, clips(41, 7, { duration: 3 })));
  same("chapters");
  // Rewrite a middle snapshot: it and its successor change.
  writeSnapshot("chapters", "0003-frame_tag_add.json", snapshot("frame_tag_add", 3, clips(40, 9), { frame_tags: [{ at: 2 }] }));
  same("chapters");
  // Remove a middle snapshot: its successor now diffs against the one before.
  fs.rmSync(path.join(projectHistoryDir("chapters"), "0002-caption_text.json"));
  same("chapters");
  // An unreadable snapshot is skipped and its successor diffs past it; repairing it restores it.
  writeSnapshot("chapters", "0004-editor_agent_workshop.json", "{not json");
  same("chapters");
  writeSnapshot("chapters", "0004-editor_agent_workshop.json", snapshot("editor_agent_workshop", 4, clips(42, 3), { metadata: { aspect: "9:16" } }));
  same("chapters");
  // Removing the first snapshot makes the next one diff against nothing.
  fs.rmSync(path.join(projectHistoryDir("chapters"), "0001-trim_clip.json"));
  same("chapters");
  // A proposal summary written after the chapter was cached still reaches its label on the next rebuild.
  fs.writeFileSync(projectProposalPath("chapters", proposalId), JSON.stringify({ proposal: { summary: "Retitled" } }));
  writeSnapshot("chapters", "0007-caption_text.json", snapshot("caption_text", 7, clips(42, 1)));
  same("chapters");

  // memoryEvents projects legacy chapters the same way it always has.
  recordMemoryEvent("chapters", { type: "timeline.snapshot", summary: "captured", actor: "human", evidence: "0006-split_clip.json" });
  const legacy = memoryEvents("chapters").filter(e => e.id.startsWith("history:")).map(e => e.evidence);
  assert.deepEqual(legacy, (referenceChapters("chapters") as { id: string }[]).map(c => c.id).filter(id => id !== "0006-split_clip.json"));
});

test("appending a snapshot re-reads only the new snapshot and its predecessor", () => {
  createProject("chapters-speed", "web");
  const count = 30, size = 3000;
  for (let i = 0; i < count; i++) writeSnapshot("chapters-speed", `${String(i).padStart(4, "0")}-trim_clip.json`, snapshot("trim_clip", i, clips(size, i)));
  const cpu = (run: () => void) => { const start = process.cpuUsage(); run(); const used = process.cpuUsage(start); return (used.user + used.system) / 1000; };
  const cold = cpu(() => editChapters("chapters-speed"));
  writeSnapshot("chapters-speed", `${String(count).padStart(4, "0")}-trim_clip.json`, snapshot("trim_clip", count, clips(size, count)));
  const append = cpu(() => editChapters("chapters-speed"));
  const reference = cpu(() => referenceChapters("chapters-speed"));
  same("chapters-speed");
  console.log(`editChapters ${count + 1} snapshots × ${size} clips: reference full rescan ${reference.toFixed(0)} ms CPU, new cold ${cold.toFixed(0)} ms, after one append ${append.toFixed(0)} ms`);
  assert.ok(append * 5 < cold, `append ${append} ms should be far below cold ${cold} ms`);
});

/** Legacy snapshot events as memoryEvents has always built them from full chapters. */
function expectedLegacyEvents(projectId: string) {
  return (referenceChapters(projectId) as EditChapterLike[]).map(c => {
    const body = { id: `history:${c.id}`, time: c.time, type: "timeline.snapshot", summary: c.summary, actor: c.actor ?? "unknown", evidence: c.id,
      data: { initiated_by: c.initiated_by ?? "unknown", attribution_source: c.attribution_source ?? "unknown", responds_to_feedback_ids: c.responds_to_feedback_ids, transaction_id: c.transaction_id, proposal_ids: c.proposal_ids, restores_snapshot_id: c.restores_snapshot_id } };
    return { ...body, hash: memoryHash(body) };
  }).sort((a, b) => a.time.localeCompare(b.time) || a.id.localeCompare(b.id));
}
type EditChapterLike = Record<string, any> & { id: string; time: string; summary: string };
const childScript = path.join(root, "memory-events-child.ts");
fs.writeFileSync(childScript, `import { memoryChapter, memoryChapterPage, memoryEvents } from ${JSON.stringify(path.resolve("src/lib/local-store/editing-memory.ts"))};
const [projectId, mode] = process.argv.slice(2);
const page = () => memoryChapterPage(projectId, { limit: 1000 }).chapters;
process.stdout.write(JSON.stringify(mode === "page" ? page() : mode === "details" ? page().map(c => memoryChapter(projectId, c.id)) : memoryEvents(projectId)));\n`);
/** The same read in a fresh process: the restarted-server case, with only the persisted cache to reuse. */
function restarted(projectId: string, mode: "events" | "page" | "details" = "events") {
  const result = spawnSync(process.execPath, ["--import", "tsx", childScript, projectId, mode], { encoding: "utf8", env: process.env });
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}
const restartedMemoryEvents = (projectId: string) => restarted(projectId);
/** The memory page's newest-first summaries as memoryChapterPage has always built them from full chapters. */
function expectedPage(projectId: string) {
  return (referenceChapters(projectId) as EditChapterLike[]).reverse().map(({ changes, context_changes, ...summary }) => ({ ...summary, change_count: changes.length, context_change_count: context_changes.length }));
}
/** Replace a snapshot's bytes without changing its size or mtime, so only a cache hit can still read it. */
function tamper(projectId: string, name: string) {
  const file = path.join(projectHistoryDir(projectId), name);
  const stat = fs.statSync(file), original = fs.readFileSync(file);
  fs.writeFileSync(file, "x".repeat(stat.size));
  fs.utimesSync(file, stat.atime, stat.mtime);
  return () => { fs.writeFileSync(file, original); fs.utimesSync(file, stat.atime, stat.mtime); };
}

test("persisted chapter heads survive a restart and fall back to the snapshots when stale, corrupt, missing or from another version", () => {
  const id = "chapters-restart";
  createProject(id, "web");
  writeSnapshot(id, "0001-trim_clip.json", snapshot("trim_clip", 1, clips(30)));
  writeSnapshot(id, "0002-caption_text.json", snapshot("caption_text", 2, clips(30, 3), { responds_to_feedback_ids: ["fb-1"], transaction_id: "tx-1" }));
  writeSnapshot(id, "0003-frame_tag_add.json", snapshot("frame_tag_add", 3, clips(30, 3), { frame_tags: [{ at: 1 }], proposal_ids: ["p-1"] }));
  writeSnapshot(id, "0004-noop.json", snapshot("set_volume", 4, clips(30, 3), { frame_tags: [{ at: 1 }] }));
  writeSnapshot(id, "0005-split_clip.json", snapshot("split_clip", 5, clips(31, 8), { restores_snapshot_id: "0001-trim_clip.json", responds_to_feedback_ids: null }));
  const cache = chapterHeadsPath(id);
  const check = () => {
    const expected = JSON.stringify(expectedLegacyEvents(id));
    assert.equal(JSON.stringify(memoryEvents(id)), expected, "in process");
    assert.equal(JSON.stringify(restartedMemoryEvents(id)), expected, "after restart");
  };

  check();
  assert.ok(fs.existsSync(cache));
  // A restart answers from the cache without reading the (unchanged) snapshots.
  let restore = tamper(id, "0002-caption_text.json");
  assert.equal(JSON.stringify(restartedMemoryEvents(id)), JSON.stringify((() => { restore(); return expectedLegacyEvents(id); })()));

  // Corrupt, missing and other-version caches are ignored and rewritten.
  fs.writeFileSync(cache, "{not json");
  check();
  assert.equal(JSON.parse(fs.readFileSync(cache, "utf8")).version, CHAPTER_HEADS_VERSION);
  fs.rmSync(cache);
  check();
  assert.ok(fs.existsSync(cache));
  const saved = JSON.parse(fs.readFileSync(cache, "utf8"));
  for (const entry of Object.values(saved.entries) as { value: { summary: string } | null }[]) if (entry.value) entry.value.summary = "stale";
  fs.writeFileSync(cache, JSON.stringify({ ...saved, version: CHAPTER_HEADS_VERSION + 1 }));
  assert.ok(!JSON.stringify(restartedMemoryEvents(id)).includes("stale"));
  check();

  // Rewritten, removed, appended and unreadable snapshots invalidate their own entry and their successor's.
  writeSnapshot(id, "0003-frame_tag_add.json", snapshot("frame_tag_add", 3, clips(30, 5), { frame_tags: [{ at: 2 }] }));
  check();
  fs.rmSync(path.join(projectHistoryDir(id), "0002-caption_text.json"));
  check();
  writeSnapshot(id, "0006-caption_text.json", snapshot("caption_text", 6, clips(31, 2), { responds_to_feedback_ids: ["fb-2"] }));
  check();
  writeSnapshot(id, "0005-split_clip.json", "{not json");
  check();
  fs.rmSync(path.join(projectHistoryDir(id), "0001-trim_clip.json"));
  check();
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(cache, "utf8")).entries), fs.readdirSync(projectHistoryDir(id)).filter(f => f.endsWith(".json")).sort());
  // Full chapters are unaffected by the heads cache.
  same(id);
});

test("the memory page and chapter detail match full chapters in process and after a restart, without reading unchanged snapshots", () => {
  const id = "chapters-page";
  createProject(id, "web");
  const proposalId = "20260101T000000-abcdef34";
  fs.mkdirSync(path.dirname(projectProposalPath(id, proposalId)), { recursive: true });
  fs.writeFileSync(projectProposalPath(id, proposalId), JSON.stringify({ proposal: { summary: "Tighten the intro" } }));
  writeSnapshot(id, "0001-trim_clip.json", snapshot("trim_clip", 1, clips(30)));
  writeSnapshot(id, "0002-caption_text.json", snapshot("caption_text", 2, clips(30, 3), { label: "Edit caption", history_action: { kind: "undo" } }));
  writeSnapshot(id, "0003-frame_tag_add.json", snapshot("frame_tag_add", 3, clips(30, 3), { frame_tags: [{ at: 1 }] }));
  writeSnapshot(id, "0004-editor_agent_workshop.json", snapshot("editor_agent_workshop", 4, clips(31, 3), { proposal_ids: [proposalId] }));
  writeSnapshot(id, "0005-history_restore.json", snapshot("history_restore", 5, clips(30, 9), { restores_snapshot_id: "0002-caption_text.json" }));
  const cache = chapterHeadsPath(id);
  const check = () => {
    const page = JSON.stringify(expectedPage(id)), details = JSON.stringify((referenceChapters(id) as unknown[]).reverse());
    assert.equal(JSON.stringify(memoryChapterPage(id, { limit: 1000 }).chapters), page, "page in process");
    assert.equal(JSON.stringify(memoryChapterPage(id, { limit: 1000 }).chapters.map(c => memoryChapter(id, c.id))), details, "details in process");
    assert.equal(JSON.stringify(restarted(id, "page")), page, "page after restart");
    assert.equal(JSON.stringify(restarted(id, "details")), details, "details after restart");
  };
  check();
  assert.throws(() => memoryChapter(id, "../timeline.json"), /Chapter not found/);

  // A restart pages from the cache alone; labels still read the current proposal.
  fs.writeFileSync(projectProposalPath(id, proposalId), JSON.stringify({ proposal: { summary: "Retitled" } }));
  const restore = ["0001-trim_clip.json", "0002-caption_text.json", "0003-frame_tag_add.json", "0004-editor_agent_workshop.json", "0005-history_restore.json"].map(name => tamper(id, name));
  const fromCache = JSON.stringify(restarted(id, "page"));
  restore.forEach(undo => undo());
  assert.equal(fromCache, JSON.stringify(expectedPage(id)));
  assert.ok(fromCache.includes("Apply: Retitled"));

  // Corrupt, missing and other-version caches are rebuilt from the snapshots.
  fs.writeFileSync(cache, "{not json");
  check();
  fs.rmSync(cache);
  check();
  const saved = JSON.parse(fs.readFileSync(cache, "utf8"));
  for (const entry of Object.values(saved.entries) as { value: { change_count: number } | null }[]) if (entry.value) entry.value.change_count = 999;
  fs.writeFileSync(cache, JSON.stringify({ ...saved, version: CHAPTER_HEADS_VERSION - 1 }));
  assert.ok(!JSON.stringify(restarted(id, "page")).includes("999"));
  check();

  // Changed, removed and unreadable snapshots.
  writeSnapshot(id, "0003-frame_tag_add.json", snapshot("frame_tag_add", 3, clips(30, 5), { frame_tags: [{ at: 2 }] }));
  check();
  fs.rmSync(path.join(projectHistoryDir(id), "0002-caption_text.json"));
  check();
  writeSnapshot(id, "0004-editor_agent_workshop.json", "{not json");
  check();
  assert.throws(() => memoryChapter(id, "0004-editor_agent_workshop.json"), /Chapter not found/);
  fs.rmSync(path.join(projectHistoryDir(id), "0001-trim_clip.json"));
  check();
  same(id);
});

const fullChild = path.join(root, "memory-full-child.ts");
fs.writeFileSync(fullChild, `import { createExportCheckpoint, editChapters, readMemoryView } from ${JSON.stringify(path.resolve("src/lib/local-store/editing-memory.ts"))};
import { GET } from ${JSON.stringify(path.resolve("src/app/api/projects/[projectId]/memory/route.ts"))};
const [projectId, mode, checkpointId] = process.argv.slice(2);
const view = async () => (await GET(new Request("http://localhost/api/projects/" + projectId + "/memory"), { params: Promise.resolve({ projectId }) })).text();
(async () => process.stdout.write(mode === "chapters" ? JSON.stringify(editChapters(projectId)) : mode === "view" ? await view()
  : mode === "view-local" ? JSON.stringify(readMemoryView(projectId)) : JSON.stringify(createExportCheckpoint(projectId, checkpointId, { trigger: "export" }).checkpoint.chapters)))();\n`);
function restartedFull(projectId: string, mode: "chapters" | "view" | "view-local" | "checkpoint", checkpointId = "") {
  const result = spawnSync(process.execPath, ["--import", "tsx", fullChild, projectId, mode, checkpointId], { encoding: "utf8", env: process.env, maxBuffer: 256 * 1024 * 1024 });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("full chapters, the default memory GET and export checkpoints match after a restart, from persisted changes without reading snapshots", async () => {
  const id = "chapters-full";
  createProject(id, "web");
  const proposalId = "20260101T000000-abcdef56";
  fs.mkdirSync(path.dirname(projectProposalPath(id, proposalId)), { recursive: true });
  fs.writeFileSync(projectProposalPath(id, proposalId), JSON.stringify({ proposal: { summary: "Tighten the intro" } }));
  const names = ["0001-trim_clip.json", "0002-caption_text.json", "0003-frame_tag_add.json", "0004-editor_agent_workshop.json", "0005-set_volume.json"];
  writeSnapshot(id, names[0], snapshot("trim_clip", 1, clips(30)));
  writeSnapshot(id, names[1], snapshot("caption_text", 2, clips(30, 3), { label: "Edit caption", responds_to_feedback_ids: ["fb-1"] }));
  writeSnapshot(id, names[2], snapshot("frame_tag_add", 3, clips(30, 3), { frame_tags: [{ at: 1 }] }));
  writeSnapshot(id, names[3], snapshot("editor_agent_workshop", 4, clips(31, 3), { proposal_ids: [proposalId] }));
  writeSnapshot(id, names[4], snapshot("set_volume", 5, clips(31, 3)));
  const { GET } = await import("../../app/api/projects/[projectId]/memory/route");
  const check = (label: string) => {
    const expected = JSON.stringify(referenceChapters(id));
    assert.equal(JSON.stringify(editChapters(id)), expected, `${label}: in process`);
    assert.equal(restartedFull(id, "chapters"), expected, `${label}: after restart`);
    return expected;
  };
  let expected = check("first build");
  const changes = chapterChangesDir(id);
  // One changes file per snapshot that yields a chapter; the no-change set_volume yields none.
  assert.deepEqual(fs.readdirSync(changes).sort(), (referenceChapters(id) as { id: string }[]).map(c => c.id));

  // The default GET and an export checkpoint are byte-identical in process and after a restart.
  const inProcess = await (await GET(new Request(`http://localhost/api/projects/${id}/memory`), { params: Promise.resolve({ projectId: id }) })).text();
  assert.equal(inProcess, JSON.stringify(readMemoryView(id)));
  assert.equal(JSON.stringify(JSON.parse(restartedFull(id, "view")).chapters), expected);
  assert.equal(JSON.stringify(JSON.parse(restartedFull(id, "view")).feedback), JSON.stringify(JSON.parse(inProcess).feedback));
  assert.equal(restartedFull(id, "checkpoint", "export-restart"), expected);
  assert.equal(JSON.stringify(createExportCheckpoint(id, "export-live", { trigger: "export" }).checkpoint.chapters), expected);

  // A restart reads only the persisted heads and changes: tampered snapshots are never parsed.
  const restore = names.map(name => tamper(id, name));
  const fromCache = restartedFull(id, "chapters");
  const viewFromCache = JSON.parse(restartedFull(id, "view-local"));
  restore.forEach(undo => undo());
  assert.equal(fromCache, expected);
  assert.equal(JSON.stringify(viewFromCache.chapters), expected);

  // Corrupt, missing, mismatched and other-version files fall back to the snapshots and are rewritten.
  fs.writeFileSync(path.join(changes, names[1]), "{not json");
  check("corrupt file");
  const saved = JSON.parse(fs.readFileSync(path.join(changes, names[3]), "utf8"));
  fs.writeFileSync(path.join(changes, names[3]), JSON.stringify({ ...saved, key: "0:0", chapter: { ...saved.chapter, summary: "stale" } }));
  assert.ok(!restartedFull(id, "chapters").includes("stale"));
  fs.writeFileSync(path.join(changes, names[3]), JSON.stringify({ ...saved, version: CHAPTER_HEADS_VERSION + 1, chapter: { ...saved.chapter, summary: "stale" } }));
  assert.ok(!restartedFull(id, "chapters").includes("stale"));
  fs.rmSync(changes, { recursive: true });
  check("missing directory");
  assert.equal(fs.readdirSync(changes).length, (referenceChapters(id) as unknown[]).length);

  // Rewritten, removed and appended snapshots; labels follow the current proposal.
  writeSnapshot(id, names[2], snapshot("frame_tag_add", 3, clips(30, 5), { frame_tags: [{ at: 2 }] }));
  check("rewrite");
  fs.rmSync(path.join(projectHistoryDir(id), names[1]));
  expected = check("removal");
  assert.ok(!fs.existsSync(path.join(changes, names[1])), "a removed snapshot's changes are removed");
  writeJsonFileAtomic(projectProposalPath(id, proposalId), { proposal: { summary: "Retitled" } });
  writeSnapshot(id, "0006-split_clip.json", snapshot("split_clip", 6, clips(31, 7, { duration: 3 })));
  assert.ok(check("append").includes("Apply: Retitled"));
  assert.deepEqual(fs.readdirSync(changes).sort(), (referenceChapters(id) as { id: string }[]).map(c => c.id));
});

test("an unchanged history poll is a 304; a new snapshot, a proposal change or a feedback record returns the new page", async () => {
  const id = "chapters-poll";
  createProject(id, "web");
  const proposalId = "20260101T000000-abcdef78";
  writeJsonFileAtomic(projectProposalPath(id, proposalId), { proposal_id: proposalId, status: "pending", created_at: "2026-01-01T00:00:00.000Z", proposal: { summary: "Tighten the intro" } });
  writeSnapshot(id, "0001-trim_clip.json", snapshot("trim_clip", 1, clips(20)));
  writeSnapshot(id, "0002-editor_agent_workshop.json", snapshot("editor_agent_workshop", 2, clips(20, 3), { proposal_ids: [proposalId] }));
  const { GET } = await import("../../app/api/projects/[projectId]/memory/route");
  const url = `http://localhost/api/projects/${id}/memory?view=page&section=history&chapters_limit=50`;
  let etag = "";
  const poll = async () => {
    const response = await GET(new Request(url, { headers: etag ? { "If-None-Match": etag } : {} }), { params: Promise.resolve({ projectId: id }) });
    if (response.status === 200) {
      const text = await response.text();
      assert.equal(text, JSON.stringify(readMemoryPage(id, "history", { limit: 50 })), "the body is the page as built now");
      assert.equal(response.headers.get("Content-Type"), "application/json");
      etag = response.headers.get("ETag")!;
      return { status: 200, body: JSON.parse(text) };
    }
    return { status: response.status, body: null };
  };
  assert.equal((await poll()).status, 200);
  assert.equal((await poll()).status, 304, "unchanged");
  const first = etag;
  // Another tab without a validator gets the same body and ETag.
  etag = "";
  assert.equal((await poll()).status, 200);
  assert.equal(etag, first);

  writeSnapshot(id, "0003-caption_text.json", snapshot("caption_text", 3, clips(20, 5)));
  const snapshotAdded = await poll();
  assert.equal(snapshotAdded.status, 200, "a new snapshot");
  assert.equal(snapshotAdded.body.chapters.length, 3);
  assert.equal((await poll()).status, 304);

  writeJsonFileAtomic(projectProposalPath(id, proposalId), { proposal_id: proposalId, status: "accepted", created_at: "2026-01-01T00:00:00.000Z", proposal: { summary: "Retitled" } });
  const proposalChanged = await poll();
  assert.equal(proposalChanged.status, 200, "a proposal change");
  assert.ok(proposalChanged.body.chapters.some((c: { label: string }) => c.label === "Apply: Retitled"));
  assert.equal(proposalChanged.body.proposals[0].status, "accepted");
  assert.equal((await poll()).status, 304);

  recordEditingFeedback({ project_id: id, session_id: "s", turn_id: "t", direction: "Tighter captions" });
  const feedback = await poll();
  assert.equal(feedback.status, 200, "a feedback record");
  assert.ok(JSON.stringify(feedback.body.feedback).includes("Tighter captions"));
  assert.equal((await poll()).status, 304);

  const timeline = path.join(path.dirname(projectHistoryDir(id)), "timeline.json");
  const saved = readJsonFile<{ elements: unknown[] }>(timeline, { elements: [] });
  writeJsonFileAtomic(timeline, { ...saved, elements: [...saved.elements, { id: "v1", type: "video_clip", timeline_start: 0, duration: 2, props: { label: "Intro" } }] });
  const sequenced = await poll();
  assert.equal(sequenced.status, 200, "a timeline change");
  assert.ok(sequenced.body.sequences.some((s: { id: string }) => s.id === "v1"));
  assert.equal((await poll()).status, 304);
});
