import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject, readTimeline } from "./store";
import { projectHistoryDir } from "./paths";
import { createRetroCheckpoint, editChapters, memoryChapter, memoryChapterPage, memoryViewVersion, readEditingProfile, readMemoryPage, readMemoryView, recordMemoryEvent, retroPath, saveRetro, writeEditingProfile, type RetroRecord } from "./editing-memory";
import { readJsonFile } from "./atomic-json";

const root = fs.mkdtempSync(path.join(os.tmpdir(), "editing-memory-page-test-"));
process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
const route = () => import("../../app/api/projects/[projectId]/memory/route");
const params = (projectId: string) => ({ params: Promise.resolve({ projectId }) });

function writeHistory(projectId: string, count: number) {
  const directory = projectHistoryDir(projectId);
  fs.mkdirSync(directory, { recursive: true });
  for (let index = 0; index < count; index++) {
    const op = index % 3 === 0 ? "caption_text" : "trim_clip";
    fs.writeFileSync(path.join(directory, `${String(index).padStart(5, "0")}-${op}.json`), JSON.stringify({
      op, at: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(), actor: "human",
      timeline: { elements: [{ id: "clip", type: "text", timeline_start: index, duration: 1, props: { text: `take ${index}` } }] },
      metadata: { output_aspect_ratio: index % 2 ? "9:16" : "16:9" },
    }));
  }
}

test("paged chapters are bounded, lightweight and their cursors reach every chapter", () => {
  createProject("paged", "web");
  writeHistory("paged", 123);
  const all = editChapters("paged");
  assert.equal(all.length, 123);
  const seen: string[] = [];
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page = memoryChapterPage("paged", { limit: 50, cursor });
    assert.ok(page.chapters.length <= 50);
    assert.equal(page.chapter_page.total, 123);
    for (const chapter of page.chapters) {
      assert.equal("changes" in chapter, false);
      assert.equal("context_changes" in chapter, false);
      const full = memoryChapter("paged", chapter.id);
      assert.equal(chapter.change_count, full.changes.length);
      assert.equal(chapter.context_change_count, full.context_changes.length);
    }
    seen.push(...page.chapters.map(chapter => chapter.id));
    cursor = page.chapter_page.next_cursor;
    pages++;
  } while (cursor);
  assert.equal(pages, 3);
  assert.deepEqual(seen, all.map(chapter => chapter.id).reverse(), "newest first, no gaps or repeats");

  const captions = memoryChapterPage("paged", { limit: 10, category: "Captions" });
  assert.equal(captions.chapter_page.total, all.filter(chapter => chapter.category === "Captions").length);
  assert.ok(captions.chapters.every(chapter => chapter.category === "Captions"));
  assert.equal(memoryChapterPage("paged", { limit: 5000 }).chapter_page.limit, 1000);

  const history = readMemoryPage("paged", "history", { limit: 50 });
  assert.ok(JSON.stringify(history).length < JSON.stringify(readMemoryView("paged")).length / 2);
  assert.equal(history.chapters.length, 50);
  assert.equal("core_skills" in history, false);
  assert.throws(() => memoryChapter("paged", "missing.json"), /Chapter not found/);
});

test("default memory GET keeps the full view contract for existing callers", async () => {
  createProject("full-view", "web");
  writeHistory("full-view", 4);
  recordMemoryEvent("full-view", { actor: "human", type: "editorial.feedback", summary: "Tighter captions" });
  const { GET } = await route();
  const response = await GET(new Request("http://localhost/api/projects/full-view/memory"), params("full-view"));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(Object.keys(body).sort(), ["chapters", "core_skills", "effective_preferences", "events", "feedback", "profile", "project_id", "proposals", "retros",
    "sequences", "skill_candidates", "skill_maintenance_jobs", "style_document", "user_skills"]);
  assert.deepEqual(body, JSON.parse(JSON.stringify(readMemoryView("full-view"))));
  assert.ok(body.chapters.every((chapter: { changes?: unknown[] }) => Array.isArray(chapter.changes)));
  const etag = response.headers.get("ETag");
  const cached = await GET(new Request("http://localhost/api/projects/full-view/memory", { headers: { "If-None-Match": etag! } }), params("full-view"));
  assert.equal(cached.status, 304);

  const page = await GET(new Request("http://localhost/api/projects/full-view/memory?view=page&section=history&chapters_limit=2"), params("full-view"));
  assert.notEqual(page.headers.get("ETag"), etag, "paged and full responses never share a validator");
  const paged = await page.json();
  assert.equal(paged.chapters.length, 2);
  assert.equal(paged.chapter_page.next_cursor, paged.chapters[1].id);
  const detail = await (await GET(new Request(`http://localhost/api/projects/full-view/memory?chapter=${paged.chapters[0].id}`), params("full-view"))).json();
  assert.deepEqual(detail.chapter, JSON.parse(JSON.stringify(memoryChapter("full-view", paged.chapters[0].id))));
});

test("page and history reads never dispatch retros; the explicit resume action resumes only a started review", async () => {
  createProject("no-side-effect", "web");
  writeEditingProfile({ ...readEditingProfile(), learning: true, agent_retros: true });
  const calls = path.join(root, "worker-calls");
  const executable = path.join(root, "worker.cjs");
  fs.writeFileSync(executable, `#!${process.execPath}\nlet s='';process.stdin.on('data',c=>s+=c);process.stdin.on('end',()=>{require('fs').appendFileSync(${JSON.stringify(calls)},'x');process.stdout.write(JSON.stringify({summary:'Reviewed',findings:[]}))});`);
  fs.chmodSync(executable, 0o755);
  process.env.DREAMCUT_WORKER_EXECUTABLE = executable;
  try {
    // A review a person started that a restart interrupted (it has an attempt) is resumable;
    // a checkpoint nobody started is not (retros are manual).
    const started = createRetroCheckpoint("no-side-effect", "queued-retro", { timeline: readTimeline("no-side-effect"), trigger: "manual" }, false);
    saveRetro("no-side-effect", { ...started, attempt_count: 1 });
    createRetroCheckpoint("no-side-effect", "never-started", { timeline: readTimeline("no-side-effect"), trigger: "manual" }, false);
    const file = retroPath("no-side-effect", "queued-retro");
    const before = fs.readFileSync(file, "utf8");
    const { GET, POST } = await route();
    // Attention/context reads keep the export-retrospective contract's restart recovery; page and full views do not.
    for (const query of ["", "?view=page&section=user", "?view=page&section=history"]) {
      const response = await GET(new Request(`http://localhost/api/projects/no-side-effect/memory${query}`), params("no-side-effect"));
      assert.equal(response.status, 200, query);
    }
    const paged = await (await GET(new Request("http://localhost/api/projects/no-side-effect/memory?view=page&section=user"), params("no-side-effect"))).json();
    assert.deepEqual(paged.retro_outbox, { waiting: 0, queued: 2, running: 0 });
    await new Promise(resolve => setTimeout(resolve, 200));
    assert.equal(fs.readFileSync(file, "utf8"), before, "GET must not start or rewrite the queued retro");
    assert.equal(fs.existsSync(calls), false);

    const resumed = await POST(new Request("http://localhost/api/projects/no-side-effect/memory", { method: "POST", body: JSON.stringify({ action: "resume_retros" }) }), params("no-side-effect"));
    assert.equal(resumed.status, 200);
    const deadline = Date.now() + 10_000;
    while (readJsonFile<RetroRecord>(file, null!).status !== "complete" && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(readJsonFile<RetroRecord>(file, null!).status, "complete");
    assert.ok(fs.existsSync(calls));
    assert.equal(readJsonFile<RetroRecord>(retroPath("no-side-effect", "never-started"), null!).status, "queued");
  } finally { delete process.env.DREAMCUT_WORKER_EXECUTABLE; }
});

test("the cached memory version invalidates when a source file changes", () => {
  createProject("versioned", "web");
  const skills = path.join(root, "skills");
  fs.mkdirSync(path.join(skills, "pacing"), { recursive: true });
  fs.writeFileSync(path.join(skills, "pacing", "SKILL.md"), "---\nname: pacing\ndescription: Pace cuts\n---\nCut on action.\n");
  process.env.DREAMCUT_SKILLS_DIR = skills;
  try {
    const first = memoryViewVersion("versioned");
    assert.equal(memoryViewVersion("versioned"), first, "unchanged inputs reuse the cached version");

    fs.writeFileSync(path.join(skills, "pacing", "SKILL.md"), "---\nname: pacing\ndescription: Pace cuts\n---\nCut on action, then hold the reaction.\n");
    const skillEdited = memoryViewVersion("versioned");
    assert.notEqual(skillEdited, first, "core skill content edits invalidate");

    const personal = path.join(process.env.DREAMCUT_PROFILE_DIR!, "skills", "my-captions");
    fs.mkdirSync(personal, { recursive: true });
    fs.writeFileSync(path.join(personal, "SKILL.md"), "---\ndescription: Mine\n---\nOne line.\n");
    const personalAdded = memoryViewVersion("versioned");
    assert.notEqual(personalAdded, skillEdited, "personal skill changes invalidate");

    recordMemoryEvent("versioned", { actor: "human", type: "note", summary: "Changed" });
    const eventAdded = memoryViewVersion("versioned");
    assert.notEqual(eventAdded, personalAdded, "project memory changes invalidate");

    writeHistory("versioned", 2);
    assert.notEqual(memoryViewVersion("versioned"), eventAdded, "history changes invalidate");
  } finally { delete process.env.DREAMCUT_SKILLS_DIR; }
});
