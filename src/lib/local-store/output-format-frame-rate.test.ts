import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { createProject, readMetadata, readProjectFrameRate, readTimeline, restoreProjectHistorySnapshot, writeTimeline } from "@/lib/local-store/store";
import { GET, PATCH } from "@/app/api/projects/[projectId]/timeline/output-format/route";
import { PATCH as PATCH_ELEMENT } from "@/app/api/projects/[projectId]/timeline/elements/[elementId]/route";

function clip(id: string, timeline_start: number, duration: number): TimelineElement {
  return { id, project_id: "rate-test", type: "still", source_url: null, props: null, beat_id: null, voice_clip_id: null, character_id: null,
    timeline_start, duration, lane_key: "visual_0", lane_index: 0, trim_start: 0, trim_end: null, volume: 1, fade_in: 0, fade_out: 0,
    playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null, created_at: "", updated_at: "" } as TimelineElement;
}

test("a frame-rate change re-snaps the cut in one undoable step", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-frame-rate-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("rate-test", "web", "Rate");
    // A cut at frame 31 of 30 fps (1.0333 s) is not on the 24 fps grid.
    writeTimeline("rate-test", { elements: [clip("a", 0, 31 / 30), clip("b", 31 / 30, 1)], transitions: [] }, "seed");
    const params = { params: Promise.resolve({ projectId: "rate-test" }) };
    const patch = (body: unknown) => PATCH(new Request("http://localhost/api/projects/rate-test/timeline/output-format", {
      method: "PATCH", headers: { "Content-Type": "application/json", "x-dreamcut-client": "editor" }, body: JSON.stringify(body),
    }), params);

    assert.equal((await (await GET(new Request("http://localhost"), params)).json()).frame_rate, 30, "projects default to 30 fps");
    assert.equal((await patch({ frame_rate: 23.976 })).status, 400, "only supported rates are accepted");

    const response = await patch({ frame_rate: 24 });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.frame_rate, 24);
    assert.equal(readMetadata("rate-test").frame_rate, 24);
    assert.equal(readProjectFrameRate("rate-test"), 24, "server routes read the saved rate");
    assert.equal(readProjectFrameRate("missing-project"), 30, "an unreadable project is 30 fps");
    const [a, b] = readTimeline("rate-test").elements;
    assert.equal(a.duration * 24, Math.round(a.duration * 24), "clip ends on the 24 fps grid");
    assert.equal(b.timeline_start, a.timeline_start + a.duration, "the cut still touches");
    assert.equal((await (await GET(new Request("http://localhost"), params)).json()).frame_rate, 24);

    // Edits made after the change snap to the project's new grid, not to 30 fps.
    assert.equal((await patch({ frame_rate: 60 })).status, 200);
    const moved = await PATCH_ELEMENT(new Request("http://localhost/api/projects/rate-test/timeline/elements/b", {
      method: "PATCH", headers: { "Content-Type": "application/json", "x-dreamcut-client": "editor" }, body: JSON.stringify({ timeline_start: 2.01 }),
    }), { params: Promise.resolve({ projectId: "rate-test", elementId: "b" }) });
    assert.equal(moved.status, 200);
    assert.equal(readTimeline("rate-test").elements[1].timeline_start, 121 / 60, "2.01 s snaps to frame 121 at 60 fps");
    await patch({ frame_rate: 24 });

    // Undo restores both the rate and the 30 fps cut together.
    restoreProjectHistorySnapshot("rate-test", body.history.before.id);
    assert.equal(readMetadata("rate-test").frame_rate, undefined);
    assert.equal(readTimeline("rate-test").elements[1].timeline_start, 31 / 30);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
