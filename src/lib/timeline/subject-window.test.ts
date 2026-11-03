import assert from "node:assert/strict";
import test from "node:test";

import { buildCompositionElements } from "../render/composition-adapters";
import type { TimelineElement } from "@/components/studio/timeline/types";
import {
  SUBJECT_WINDOW_RUNTIME_KEY, resolveSubjectWindowBindings, subjectWindowAlpha, subjectWindowBindingIssue,
  subjectWindowEmptyAlpha, subjectWindowPlanAtFrame, type SubjectWindowPlan,
} from "./subject-window";

const mask = { source_url: "/api/projects/p/media/grid-mattes/c", source_start_seconds: 0, fps: 50, frame_count: 314, width: 96, height: 54, source_sha256: "a".repeat(64) };
const now = "2026-10-14T00:00:00.000Z";
function clip(id: string, overrides: Partial<TimelineElement> = {}): TimelineElement {
  return { id, project_id: "p", type: "video_clip", source_url: `/api/projects/p/media/sources/${id}.mp4`, props: {}, beat_id: null,
    character_id: null, timeline_start: 0, duration: 6, lane_key: "visual_1", lane_index: 0, trim_start: 0, trim_end: null,
    volume: 0, fade_in: 0, fade_out: 0, playback_rate: 1, position_locked: false, removed_at: null, removed_reason: null,
    created_at: now, updated_at: now, ...overrides } as TimelineElement;
}
const windowProps = (extra: Record<string, unknown> = {}) => ({ subject_window_parent_id: "subject", subject_window_mask: mask, ...extra });

test("a windowed clip reads its subject's clock, not its own", () => {
  // Subject starts 1 s into the timeline, trimmed 2 s into its footage, at half speed.
  const subject = clip("subject", { timeline_start: 1, trim_start: 2, playback_rate: 0.5, duration: 4 });
  const fills = [0, 1, 2].map(i => clip(`fill-${i}`, { lane_key: "visual_2", timeline_start: 1 + i * 0.6, duration: 0.6, trim_start: 5 + i, props: windowProps() }));
  const [, ...resolved] = buildCompositionElements([subject, ...fills], new Set());
  for (const fill of resolved) assert.equal((fill.props?.[SUBJECT_WINDOW_RUNTIME_KEY] as { id: string }).id, "subject");
  // Timeline 2.2 s → subject local 1.2 s → source 2 + 0.6 = 2.6 s → mask frame 130, whichever fill is on screen.
  const frame = Math.round(2.2 * 30);
  const plans = resolved.map(fill => subjectWindowPlanAtFrame(fill.props, frame, 30, 1920, 1080)!);
  for (const plan of plans) assert.equal(plan.url, `${mask.source_url}/00130.png`);
  assert.equal(subjectWindowPlanAtFrame(resolved[0]!.props, Math.round(1.6 * 30), 30, 1920, 1080)!.url, `${mask.source_url}/00115.png`);
});

test("outside the subject's span the window is closed (inside) or fully open (outside)", () => {
  const [, fill] = buildCompositionElements([clip("subject", { timeline_start: 2, duration: 1 }), clip("fill", { lane_key: "visual_2", props: windowProps() })], new Set());
  const plan = subjectWindowPlanAtFrame(fill!.props, 0, 30, 1920, 1080)!;
  assert.equal(plan.url, null);
  assert.equal(subjectWindowEmptyAlpha(plan), 0);
  assert.equal(subjectWindowEmptyAlpha({ ...plan, mode: "outside" }), 1);
  assert.equal(subjectWindowEmptyAlpha({ ...plan, strength: 0.25 }), 0.75);
  assert.ok(subjectWindowAlpha(plan, null).every(value => value === 0));
});

test("a missing or removed subject closes the window; a hidden subject lane keeps it", () => {
  const fill = clip("fill", { lane_key: "visual_2", props: windowProps() });
  const [missing] = buildCompositionElements([fill], new Set());
  assert.equal(subjectWindowPlanAtFrame(missing!.props, 10, 30, 1920, 1080)!.url, null);
  const hidden = buildCompositionElements([clip("subject"), fill], new Set(["visual_1"]), new Set(["visual_1"]));
  // Muted + hidden removes the subject actor, but the window still follows its clock.
  assert.equal(hidden.length, 1);
  assert.ok(subjectWindowPlanAtFrame(hidden[0]!.props, 10, 30, 1920, 1080)!.url);
  const disabled = buildCompositionElements([clip("subject", { props: { disabled: true } }), fill], new Set());
  assert.equal(subjectWindowPlanAtFrame(disabled[0]!.props, 10, 30, 1920, 1080)!.url, null);
});

test("the window sits where the subject's picture is drawn and follows its scale and position", () => {
  const subject = clip("subject", { props: { media_scale: 0.5, media_offset_x: 0.5, keyframes: { media_offset_y: [{ t: 0, v: 0 }, { t: 2, v: 0.5 }] } } });
  const [, fill] = buildCompositionElements([subject, clip("fill", { lane_key: "visual_2", props: windowProps() })], new Set());
  const start = subjectWindowPlanAtFrame(fill!.props, 0, 30, 1920, 1080)!;
  assert.deepEqual(start.rect, { x: 960, y: 270, width: 960, height: 540 });
  const later = subjectWindowPlanAtFrame(fill!.props, 60, 30, 1920, 1080)!;
  assert.equal(later.rect.y, 270 + 0.5 * 540);
  assert.equal(resolveSubjectWindowBindings([fill!]).length, 1);
});

test("alpha: inside, outside, expand, feather and strength all act on the subject shape", () => {
  // A 96×54 mask with a white block in its middle third, drawn full-frame on 192×108.
  const pixels = { width: 96, height: 54, data: new Uint8ClampedArray(96 * 54 * 4) };
  for (let y = 18; y < 36; y++) for (let x = 32; x < 64; x++) pixels.data[(y * 96 + x) * 4] = 255;
  const base: SubjectWindowPlan = { url: "/m/00000.png", width: 192, height: 108, gridWidth: 96, gridHeight: 54,
    rect: { x: 0, y: 0, width: 192, height: 108 }, crop: { x: 0, y: 0, width: 192, height: 108 },
    mode: "inside", feather: 0, expand: 0, strength: 1 };
  const at = (alpha: Uint8Array, x: number, y: number) => alpha[y * 96 + x]!;
  const inside = subjectWindowAlpha(base, pixels);
  assert.equal(at(inside, 48, 27), 255);
  assert.equal(at(inside, 5, 5), 0);
  const outside = subjectWindowAlpha({ ...base, mode: "outside" }, pixels);
  assert.equal(at(outside, 48, 27), 0);
  assert.equal(at(outside, 5, 5), 255);
  const count = (alpha: Uint8Array) => alpha.reduce((sum, value) => sum + (value > 127 ? 1 : 0), 0);
  // 32×18 block: growing 4 px gives ~40×26 (rounded corners), shrinking gives ~24×10.
  assert.equal(count(inside), 576);
  assert.ok(Math.abs(count(subjectWindowAlpha({ ...base, expand: 4 }, pixels)) - 40 * 26) < 100);
  assert.ok(Math.abs(count(subjectWindowAlpha({ ...base, expand: -4 }, pixels)) - 24 * 10) < 20);
  const soft = subjectWindowAlpha({ ...base, feather: 12 }, pixels);
  assert.ok(at(soft, 32, 27) > 40 && at(soft, 32, 27) < 215, "the edge is soft");
  const faint = subjectWindowAlpha({ ...base, strength: 0.4 }, pixels);
  assert.equal(at(faint, 5, 5), Math.round(0.6 * 255));
  assert.equal(at(faint, 48, 27), 255);
  // The subject's crop limits the window as well.
  const cropped = subjectWindowAlpha({ ...base, crop: { x: 0, y: 0, width: 96, height: 108 } }, pixels);
  assert.equal(at(cropped, 60, 27), 0);
});

test("binding validation: subject type, orientation and mask coverage of the subject's footage", () => {
  const fill = { id: "fill", props: windowProps() };
  assert.equal(subjectWindowBindingIssue(fill, clip("subject"), 30), null);
  assert.match(subjectWindowBindingIssue(fill, undefined, 30)!, /missing/);
  assert.match(subjectWindowBindingIssue(fill, clip("subject", { type: "still" }), 30)!, /video clip/);
  assert.match(subjectWindowBindingIssue(fill, clip("subject", { props: { media_orientation: "clockwise" } }), 30)!, /rotated/);
  assert.match(subjectWindowBindingIssue(fill, clip("subject", { trim_start: 3, duration: 6 }), 30)!, /does not cover/);
  assert.match(subjectWindowBindingIssue(fill, clip("subject", { props: { source_sha256: "b".repeat(64) } }), 30)!, /different footage/);
  assert.match(subjectWindowBindingIssue({ id: "fill", props: { subject_window_parent_id: "subject" } }, clip("subject"), 30)!, /prepared/);
});

test("the window follows the subject's entrance and exit slide and pop, as the renderers pose it", () => {
  const subject = clip("subject", { props: { media_scale: 0.5, animationIn: "slide_left", animationInDuration: 1, animationOut: "pop", animationOutDuration: 1 } });
  const [, fill] = buildCompositionElements([subject, clip("fill", { lane_key: "visual_2", props: windowProps() })], new Set());
  const settled = { x: 480, y: 270, width: 960, height: 540 };
  // Slide left: starts 8% of the width to the right, settled once the entrance ends.
  const first = subjectWindowPlanAtFrame(fill!.props, 0, 30, 1920, 1080)!;
  assert.deepEqual(first.rect, { ...settled, x: settled.x + 1920 * 0.08 });
  assert.deepEqual(first.crop, first.rect);
  const middle = subjectWindowPlanAtFrame(fill!.props, 15, 30, 1920, 1080)!;
  assert.ok(Math.abs(middle.rect.x - (settled.x + 1920 * 0.08 * 0.5)) < 1e-6);
  assert.deepEqual(subjectWindowPlanAtFrame(fill!.props, 60, 30, 1920, 1080)!.rect, settled);
  // Pop out: scales towards 0.92 about the composition centre over the last second (0.96 halfway).
  const leaving = subjectWindowPlanAtFrame(fill!.props, 165, 30, 1920, 1080)!;
  assert.deepEqual(leaving.rect, { x: 499.2, y: 280.8, width: 921.6, height: 518.4 });
  // A transition on the subject suppresses its native entrance, so the window does not slide either.
  const [, withTransition] = buildCompositionElements([
    { ...subject, transition_in: { type: "fade", duration_seconds: 0.5 } } as TimelineElement,
    clip("fill", { lane_key: "visual_2", props: windowProps() }),
  ], new Set());
  assert.deepEqual(subjectWindowPlanAtFrame(withTransition!.props, 0, 30, 1920, 1080)!.rect, settled);
});

test("binding validation rejects subject animations the window cannot follow", () => {
  const fill = { id: "fill", props: windowProps() };
  for (const animationIn of ["slide_up", "pop", "spring_pop", "drop_in", "fade"]) {
    assert.equal(subjectWindowBindingIssue(fill, clip("subject", { props: { animationIn } }), 30), null, animationIn);
  }
  assert.match(subjectWindowBindingIssue(fill, clip("subject", { props: { animationIn: "rotate_in" } }), 30)!, /rotate animation/);
  assert.match(subjectWindowBindingIssue(fill, clip("subject", { props: { animationOut: "focus_settle" } }), 30)!, /focus blur/);
  assert.match(subjectWindowBindingIssue(fill, clip("subject", { props: { animationIn: "write_on" } }), 30)!, /write-on/);
  // A transition replaces the native entrance, so it is not drawn and needs no following.
  assert.equal(subjectWindowBindingIssue(fill, clip("subject", { props: { animationIn: "rotate_in" }, transition_in: { type: "fade", duration_seconds: 0.5 } } as Partial<TimelineElement>), 30), null);
});
