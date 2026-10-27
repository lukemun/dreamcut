import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createHash } from "node:crypto";

import { GET } from "@/app/api/projects/[projectId]/timeline/route";
import { createProject, readMetadata, readTimeline, readTimelineSnapshot, writeMetadata } from "./store";
import { timelinePayload } from "./timeline-payload";
import { compressedJson } from "./compressed-json";

function element(id: string, start: number, extra: Record<string, unknown> = {}) {
  return { id, type: "text", lane_key: "text_0", lane_index: 0, timeline_start: start, duration: 1, trim_start: 0, trim_end: 0,
    source_url: null, volume: 1, props: { text: `Title ${id}`, keyframes: [{ t: 0, v: 1 }] }, created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z", removed_at: null, removed_reason: null, ...extra };
}

function withProject(run: (filename: string) => Promise<void> | void) {
  return async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-snapshot-cache-"));
    const previous = { projects: process.env.TIMELINE_PROJECTS_DIR, profile: process.env.DREAMCUT_PROFILE_DIR };
    process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
    process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
    try {
      createProject("fixture", "web");
      await run(path.join(root, "projects", "fixture", "timeline.json"));
    } finally {
      if (previous.projects === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous.projects;
      if (previous.profile === undefined) delete process.env.DREAMCUT_PROFILE_DIR; else process.env.DREAMCUT_PROFILE_DIR = previous.profile;
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

async function body(accept = "identity") {
  const response = await GET(new Request("http://localhost/api/projects/fixture/timeline", { headers: { "accept-encoding": accept } }),
    { params: Promise.resolve({ projectId: "fixture" }) });
  assert.equal(response.status, 200);
  return Buffer.from(await response.arrayBuffer());
}

/** The uncached reference: a fresh strict read, hashed from the bytes on disk. */
function expected(filename: string) {
  const revision = createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
  return JSON.stringify({ ...timelinePayload("fixture", readTimeline("fixture")), revision });
}

function writeElements(filename: string, elements: unknown[]) {
  fs.writeFileSync(filename, JSON.stringify({ elements, transitions: [] }, null, 1));
}

test("timeline route answers byte-identical bodies across cached reads, edits and unrelated writes", withProject(async (filename) => {
  writeElements(filename, Array.from({ length: 400 }, (_, index) => element(`e${index}`, index)));
  const first = await body();
  assert.equal(first.toString("utf8"), expected(filename));
  assert.deepEqual(await body(), first, "a repeated read answers the same bytes");

  writeElements(filename, Array.from({ length: 400 }, (_, index) => element(`e${index}`, index + 0.5)));
  const edited = await body();
  assert.notDeepEqual(edited, first);
  assert.equal(edited.toString("utf8"), expected(filename));

  // Same size, rewritten in place: the stat key (mtime/ctime in nanoseconds) still changes.
  const bytes = fs.readFileSync(filename, "utf8");
  fs.writeFileSync(filename, bytes.replace('"Title e7"', '"Title e8"'));
  assert.equal((await body()).toString("utf8"), expected(filename));
  assert.match(readTimelineSnapshot("fixture").timeline.elements[7].props?.text as string, /e8/);

  // An unrelated project write (metadata) still reaches the body; the timeline cache is not stale.
  writeMetadata("fixture", { ...readMetadata("fixture"), lane_order_keys: ["text_0"] }, "test_metadata");
  const afterMetadata = await body();
  assert.equal(afterMetadata.toString("utf8"), expected(filename));
  assert.deepEqual(JSON.parse(afterMetadata.toString("utf8")).lane_order_keys, ["text_0"]);

  // Compressed bodies decode to the same text and repeat byte for byte.
  const br = await body("br");
  assert.equal(zlib.brotliDecompressSync(br).toString("utf8"), expected(filename));
  assert.deepEqual(await body("br"), br);
  const gzip = await body("gzip");
  assert.equal(zlib.gunzipSync(gzip).toString("utf8"), expected(filename));
}));

test("a returned snapshot cannot leak caller mutations into the next read", withProject((filename) => {
  writeElements(filename, [element("a", 0), element("b", 1)]);
  const first = readTimelineSnapshot("fixture");
  const pristine = JSON.stringify(first.timeline);

  first.timeline.elements.push(element("c", 2) as never);
  first.timeline.elements.reverse();
  first.timeline.transitions.push({ id: "t" } as never);
  // Rows are frozen: an edit throws in strict code and is ignored in sloppy code; either way it never lands.
  const attempt = (edit: () => void) => { try { edit(); } catch (error) { assert.ok(error instanceof TypeError); } };
  attempt(() => { (first.timeline.elements.find((row) => row.id === "a")!.props as Record<string, unknown>).text = "changed"; });
  const b = first.timeline.elements.find((row) => row.id === "b")!;
  attempt(() => { ((b.props as { keyframes: unknown[] }).keyframes).push({ t: 1 }); });
  attempt(() => { b.timeline_start = 9; });
  assert.ok(Object.isFrozen(b) && Object.isFrozen(b.props));

  const second = readTimelineSnapshot("fixture");
  assert.equal(second.revision, first.revision);
  assert.equal(JSON.stringify(second.timeline), pristine);
  assert.notEqual(second.timeline.elements, first.timeline.elements);
}));

test("compressedJson reuses an encoding only for an identical body", () => {
  const request = new Request("http://localhost/x", { headers: { "accept-encoding": "br" } });
  const payload = { rows: Array.from({ length: 2000 }, (_, index) => ({ index, label: `row ${index}` })) };
  const encode = async (value: unknown) => Buffer.from(await compressedJson(request, value).arrayBuffer());
  return (async () => {
    const first = await encode(payload);
    assert.deepEqual(await encode(structuredClone(payload)), first);
    assert.equal(zlib.brotliDecompressSync(first).toString("utf8"), JSON.stringify(payload));
    const changed = { rows: payload.rows.map((row) => row.index === 1999 ? { ...row, label: "row 1999!" } : row) };
    assert.equal(zlib.brotliDecompressSync(await encode(changed)).toString("utf8"), JSON.stringify(changed));
    assert.deepEqual(await encode(payload), first);
  })();
});
