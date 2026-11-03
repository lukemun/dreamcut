import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

import { createProject, type TimelineFile } from "./store";
import { timelinePayload } from "./timeline-payload";
import { enqueueMediaPreparation, preparationDir, preparationKey, preparationSourcePath, readPreparation, writePreparation } from "./media-preparation";
import { withPreviewHydrationMemo } from "./preview-proxy-validation";
import { prepareEditorMedia } from "../media-analysis/prepare-editor-media";
import { writeJsonFileAtomic } from "./atomic-json";

const tick = () => new Promise((resolve) => setImmediate(resolve));

function element(id: string, type: string, source: string | null, start: number, props: Record<string, unknown> = {}) {
  return { id, type, lane_key: type === "caption_text" ? "caption_0" : "video_0", lane_index: type === "caption_text" ? 1 : 0, timeline_start: start, duration: 1,
    trim_start: 0, trim_end: 0, source_url: source, volume: 1, props, created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z", removed_at: null, removed_reason: null };
}

async function withPreparedProject(run: (project: { timeline: TimelineFile; proxyFile: () => string; recordFile: string }) => Promise<void>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-hydration-memo-"));
  const previous = { projects: process.env.TIMELINE_PROJECTS_DIR, profile: process.env.DREAMCUT_PROFILE_DIR, autostart: process.env.MEDIA_PREPARATION_AUTOSTART };
  process.env.TIMELINE_PROJECTS_DIR = path.join(root, "projects");
  process.env.DREAMCUT_PROFILE_DIR = path.join(root, "profile");
  process.env.MEDIA_PREPARATION_AUTOSTART = "0";
  try {
    createProject("fixture", "web");
    for (const name of ["a.mp4", "b.mp4"]) {
      const file = preparationSourcePath("fixture", `sources/${name}`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=320x180:r=30:d=0.2", "-f", "lavfi", "-i", "sine=d=0.2",
        "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-c:a", "aac", file]);
      const ready = prepareEditorMedia("fixture", enqueueMediaPreparation("fixture", `sources/${name}`)!);
      assert.equal(ready.state, "ready", ready.error);
    }
    const url = (name: string) => `/api/projects/fixture/media/sources/${name}`;
    // Many clips share two sources, as a long talk's cuts do; captions and an unprepared clip have no proxy.
    const elements = [
      ...Array.from({ length: 12 }, (_, index) => element(`a${index}`, "video_clip", url(index % 3 ? "a.mp4" : "b.mp4"), index)),
      ...Array.from({ length: 6 }, (_, index) => element(`c${index}`, "caption_text", null, index, { text: `word ${index}` })),
      element("missing", "video_clip", url("missing.mp4"), 20),
    ];
    const timeline = { elements, transitions: [] } as unknown as TimelineFile;
    const proxyFile = () => preparationSourcePath("fixture", readPreparation("fixture", "sources/a.mp4")!.preview!);
    await run({ timeline, proxyFile, recordFile: path.join(preparationDir("fixture"), preparationKey("sources/a.mp4") + ".json") });
  } finally {
    for (const [name, value] of [["TIMELINE_PROJECTS_DIR", previous.projects], ["DREAMCUT_PROFILE_DIR", previous.profile], ["MEDIA_PREPARATION_AUTOSTART", previous.autostart]] as const) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

/** Each element hydrated alone in its own task, so nothing can be shared between elements. */
async function unsharedElements(timeline: TimelineFile) {
  const result: unknown[] = [];
  for (const item of timeline.elements) {
    await tick();
    result.push(...timelinePayload("fixture", { ...timeline, elements: [item] }).elements);
  }
  return result.sort((a, b) => String((a as { id: string }).id).localeCompare((b as { id: string }).id));
}
const byId = (elements: unknown[]) => [...elements].sort((a, b) => String((a as { id: string }).id).localeCompare((b as { id: string }).id));

test("one read hydrates shared sources once and answers the same bytes as per-element hydration", async () => {
  await withPreparedProject(async ({ timeline }) => {
    timelinePayload("fixture", timeline); // The missing source's first read settles its (failed) state.
    await tick();
    const shared = JSON.stringify(timelinePayload("fixture", timeline));
    await tick();
    assert.equal(JSON.stringify(timelinePayload("fixture", timeline)), shared);
    const elements = JSON.parse(shared).elements as { id: string; props: Record<string, unknown> }[];
    assert.equal(JSON.stringify(byId(elements)), JSON.stringify(await unsharedElements(timeline)));
    const clip = elements.find((item) => item.id === "a1")!;
    assert.equal((clip.props.preview_proxy_validation as { ok: boolean }).ok, true);
    // Shared lookups are copied per element, never aliased between them.
    const a1 = elements.find((item) => item.id === "a1")!, a2 = elements.find((item) => item.id === "a2")!;
    assert.deepEqual(a1.props.preview_proxy_validation, a2.props.preview_proxy_validation);
  });
});

test("the next read sees a replaced proxy and a preparation record rewritten by another process", async () => {
  await withPreparedProject(async ({ timeline, proxyFile, recordFile }) => {
    const proof = (payload: ReturnType<typeof timelinePayload>, id: string) =>
      (payload.elements.find((item) => item.id === id)!.props as Record<string, unknown>);
    const before = proof(timelinePayload("fixture", timeline), "a1");
    const width = (before.preview_proxy_validation as { width: number }).width;
    // Replace the proxy in place with a different size.
    execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=160x90:r=30:d=0.2", "-c:v", "libx264", "-preset", "ultrafast", proxyFile()]);
    await tick();
    const replaced = proof(timelinePayload("fixture", timeline), "a1").preview_proxy_validation as { width: number; revision: string };
    assert.notEqual(replaced.width, width);
    assert.equal(replaced.width, 160);
    assert.notEqual(replaced.revision, (before.preview_proxy_validation as { revision: string }).revision);
    // The worker (another process) marks the package failed without an earlier package to keep.
    const record = JSON.parse(fs.readFileSync(recordFile, "utf8"));
    writeJsonFileAtomic(recordFile, { ...record, state: "failed", error: "Worker failed", prepared_preview_quality: undefined, preview: undefined });
    await tick();
    const failed = proof(timelinePayload("fixture", timeline), "a1");
    assert.equal((failed.runtime_preview_preparation as { state: string }).state, "failed");
  });
});

test("inside one read, a written preparation record replaces the shared lookup", async () => {
  await withPreparedProject(async ({ recordFile }) => {
    withPreviewHydrationMemo(() => {
      const ready = readPreparation("fixture", "sources/a.mp4")!;
      assert.equal(ready.state, "ready");
      assert.equal(readPreparation("fixture", "sources/a.mp4"), ready, "shared within the read");
      writePreparation("fixture", { ...ready, state: "failed", error: "Upgrade failed" });
      assert.equal(readPreparation("fixture", "sources/a.mp4")!.state, "failed");
    });
    // Outside a hydration scope every call reads disk.
    writeJsonFileAtomic(recordFile, { ...JSON.parse(fs.readFileSync(recordFile, "utf8")), error: "Rewritten" });
    assert.equal(readPreparation("fixture", "sources/a.mp4")!.error, "Rewritten");
  });
});
