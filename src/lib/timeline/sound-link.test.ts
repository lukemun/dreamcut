import assert from "node:assert/strict";
import test from "node:test";
import type { TimelineElement } from "@/components/studio/timeline/types";
import { reconcileSoundLinks, soundLink } from "./sound-link";

const clip = (id: string, start: number, props: Record<string, unknown> = {}): TimelineElement =>
  ({ id, project_id: "p", type: props.follows_visual ? "sound_effect" : "video_clip", source_url: `/${id}`, props, timeline_start: start, duration: 1, lane_key: "visual_0", lane_index: 0, trim_start: 0, trim_end: null, volume: 1 } as unknown as TimelineElement);
const linked = (id: string, start: number, offset: number) => clip(id, start, { follows_visual: { element_id: "pic", offset_seconds: offset } });

test("a linked sound follows its picture when the picture moves", () => {
  const before = [clip("pic", 3), linked("hit", 5.2, 2.2)];
  const after = [clip("pic", 10), linked("hit", 5.2, 2.2)];
  assert.deepEqual(reconcileSoundLinks(before, after), ["hit"]);
  assert.equal(after[1].timeline_start, 12.2);
});

test("a new linked sound starts at its picture plus its offset", () => {
  const after = [clip("pic", 3.466667), linked("hit", 0, 2.2)];
  reconcileSoundLinks([clip("pic", 3.466667)], after);
  assert.equal(after[1].timeline_start, 5.666667);
});

test("a linked sound moved on its own stays linked at its new offset", () => {
  const before = [clip("pic", 3), linked("hit", 5.2, 2.2)];
  const after = [clip("pic", 3), linked("hit", 6, 2.2)];
  assert.deepEqual(reconcileSoundLinks(before, after), ["hit"]);
  assert.equal(after[1].timeline_start, 6);
  assert.equal(soundLink(after[1])?.offset_seconds, 3);
});

test("unlinked sounds and sounds whose picture is gone are left alone", () => {
  const after = [clip("pic", 9, {}), clip("free", 4), linked("orphan", 4, 1)];
  after[0].removed_at = "2026-10-12T00:00:00Z";
  assert.deepEqual(reconcileSoundLinks([clip("pic", 3), clip("free", 4), linked("orphan", 4, 1)], after), []);
  assert.equal(after[2].timeline_start, 4);
});

test("a locked sound stays put when its picture moves", () => {
  const before = [clip("pic", 3), linked("hit", 5.2, 2.2)];
  const after = [clip("pic", 10), { ...linked("hit", 5.2, 2.2), position_locked: true } as TimelineElement];
  assert.deepEqual(reconcileSoundLinks(before, after), []);
  assert.equal(after[1].timeline_start, 5.2);
});

import { refreshMotionTiming } from "./sound-link";
const opener = (start: number, duration: number, url: string, extra: Record<string, unknown> = {}) =>
  ({ ...clip("pic", start, { source_duration_seconds: duration, ripple_after: true, ...extra }), type: "video_clip", source_url: url, duration } as TimelineElement);
const cueSound = (id: string, start: number, cue: string) => clip(id, start, { follows_visual: { element_id: "pic", offset_seconds: 0, cue } });

test("a timing knob re-render moves cue-anchored sounds, lengthens the clip and pushes what follows", () => {
  const timings: Record<string, { duration: number; cues: Record<string, number> }> = {
    "/a.webm": { duration: 7.1, cues: { impact: 2.2, out: 6.4 } },
    "/b.webm": { duration: 9.1, cues: { impact: 2.2, out: 8.4 } },
  };
  const before = [opener(3.5, 7.1, "/a.webm", { motion_timing: timings["/a.webm"] }), cueSound("hit", 5.7, "impact"), cueSound("whoosh", 9.9, "out"), { ...clip("next", 10.6), lane_key: "visual_0" } as TimelineElement];
  const after = structuredClone(before); after[0].source_url = "/b.webm";
  refreshMotionTiming(after, ["pic"], url => timings[url ?? ""] ?? null);
  reconcileSoundLinks(before, after);
  assert.equal(after[0].duration, 9.1, "the clip follows the new render's length");
  assert.equal(after[3].timeline_start, 12.6, "the next shot moves by the 2 s difference");
  assert.equal(after[1].timeline_start, 5.7, "the impact cue did not move");
  assert.equal(after[2].timeline_start, 11.9, "the out whoosh follows its cue");
});

test("a sped-up motion graphic follows a new render at its own speed", () => {
  const after = [{ ...opener(0, 32 / 3, "/b.webm", { motion_timing: { duration: 12.8, cues: {} } }), playback_rate: 1.2 } as TimelineElement, clip("next", 20)];
  refreshMotionTiming(after, ["pic"], () => ({ duration: 12.8, cues: {} }));
  assert.equal(after[0].duration, 32 / 3, "the same render keeps its sped-up length");
  refreshMotionTiming(after, ["pic"], () => ({ duration: 14.4, cues: {} }));
  assert.equal(after[0].duration, 12, "a longer render plays at 1.2× too");
});

test("a trimmed motion graphic keeps its length and does not push the edit", () => {
  const after = [opener(0, 3, "/b.webm", { source_duration_seconds: 7.1 }), clip("next", 3)];
  refreshMotionTiming(after, ["pic"], () => ({ duration: 9.1, cues: {} }));
  assert.equal(after[0].duration, 3);
  assert.equal(after[1].timeline_start, 3);
});

test("a cropped render's window follows the render onto its clip, and clears for a whole-frame render", () => {
  const track = { canvas: { width: 1920, height: 1080 }, size: { width: 480, height: 540 }, fps: 30, keys: [{ t: 0, x: 960, y: 270 }] };
  const clips = [opener(0, 3, "/cropped.webm", { motion_timing: { duration: 3, cues: {} } })];
  refreshMotionTiming(clips, ["pic"], () => ({ duration: 3, cues: {}, canvasTrack: track }));
  assert.deepEqual(clips[0].props?.source_canvas_track, track);
  assert.deepEqual(clips[0].props?.motion_timing, { duration: 3, cues: {} }, "the crop is not part of the clip's timing");
  refreshMotionTiming(clips, ["pic"], () => ({ duration: 3, cues: {}, canvasTrack: null }));
  assert.equal(clips[0].props?.source_canvas_track, undefined);
});

test("a placed motion graphic takes its render length on the frame grid", () => {
  const clip = { id: "graphic", type: "video_clip", source_url: "/render.webm", removed_at: null, timeline_start: 45.5, duration: 52.36666666666667,
    trim_start: 0, trim_end: 0, props: {} } as unknown as TimelineElement;
  refreshMotionTiming([clip], ["graphic"], () => ({ duration: 52.367, cues: {} }) as never, new Set());
  assert.equal(Math.round(clip.duration * 30), clip.duration * 30, "a whole number of frames");
  assert.ok(Math.abs(clip.duration - 52.367) < 1 / 60);
});
