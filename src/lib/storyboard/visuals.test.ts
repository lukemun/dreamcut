import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { deselectStoryboardSource, emptyStoryboard, moveShotVisual, storyboardContentSchema, validateStoryboardAssets, type StoryboardAsset, type StoryboardShot, type StoryboardVisual } from "./model";
import { compileStoryboard, STORYBOARD_VISUAL_LANE } from "./compile";
import { applyStoryboardDraft, storyboardAgentSummary, storyboardDraftSchema, StoryboardDraftError } from "./agent-draft";

const assets: StoryboardAsset[] = [
  { source: "talk.mp4", name: "Talk", kind: "video", url: "/talk.mp4", ready: true, generated: false, duration: 30 },
  { source: "shot.png", name: "Screenshot", kind: "image", url: "/shot.png", ready: true, generated: false },
  { source: "broll.mp4", name: "B-roll", kind: "video", url: "/broll.mp4", ready: true, generated: false, duration: 4 },
  { source: "raw.mov", name: "Raw", kind: "video", url: "/raw.mov", ready: false, generated: false, duration: 4 },
  { source: "music.mp3", name: "Music", kind: "audio", url: "/music.mp3", ready: true, generated: false, duration: 60 },
];
const visual = (more: Partial<StoryboardVisual> = {}): StoryboardVisual => ({ id: randomUUID(), source: "shot.png", start: 0, at: 1, duration: 2, label: "Screenshot", note: "", ...more });
const talkShot = (visuals: StoryboardVisual[], more: Partial<StoryboardShot> = {}): StoryboardShot => ({ id: randomUUID(), source: "talk.mp4", start: 3, duration: 6, label: "Point one", note: "", text: "", visuals, ...more });
const board = (shots: StoryboardShot[]) => ({ ...emptyStoryboard(), sources: assets.map(a => a.source), shots });

test("visuals must sit inside their shot, in time order, without overlap, from loaded sources", () => {
  const ok = board([talkShot([visual({ at: 0, duration: 2 }), visual({ at: 2, duration: 4 })])]);
  assert.equal(storyboardContentSchema.safeParse(ok).success, true);
  const issue = (shots: StoryboardShot[], pattern: RegExp, extra: object = {}) => {
    const parsed = storyboardContentSchema.safeParse({ ...board(shots), ...extra });
    assert.equal(parsed.success, false);
    assert.match(JSON.stringify(parsed.error!.issues), pattern);
  };
  issue([talkShot([visual({ at: 5, duration: 2 })])], /runs past the end/);
  issue([talkShot([visual({ at: 1, duration: 2 }), visual({ at: 2, duration: 1 })])], /overlaps/);
  issue([talkShot(Array.from({ length: 21 }, (_, i) => visual({ at: i * .25, duration: .2 })), { duration: 10 })], /too_big|20/);
  const twin = visual();
  issue([talkShot([twin]), talkShot([{ ...twin, at: 0 }])], /Duplicate storyboard identity/);
  issue([talkShot([visual()])], /Load footage/, { sources: ["talk.mp4"] });
  assert.equal(storyboardContentSchema.safeParse(board([talkShot([visual({ duration: 0 })])])).success, false);
});

test("asset checks refuse audio, unprepared video, out-of-range in-points and photo in-points", () => {
  validateStoryboardAssets(board([talkShot([visual(), visual({ source: "broll.mp4", at: 3, start: 1, duration: 3 })])]), assets);
  assert.throws(() => validateStoryboardAssets(board([talkShot([visual({ source: "music.mp3" })])]), assets), /photo or video/);
  assert.throws(() => validateStoryboardAssets(board([talkShot([visual({ source: "raw.mov" })])]), assets), /Visual range unavailable/);
  assert.throws(() => validateStoryboardAssets(board([talkShot([visual({ source: "broll.mp4", start: 2.5, duration: 2 })])]), assets), /Visual range unavailable/);
  assert.throws(() => validateStoryboardAssets(board([talkShot([visual({ start: 1 })])]), assets), /single moment/);
});

test("boards saved before visuals existed still parse unchanged; visuals round trip", () => {
  const legacy = { sources: ["talk.mp4"], marks: [], groups: [], shots: [{ id: randomUUID(), source: "talk.mp4", start: 0, duration: 2, label: "Old", note: "", text: "" }] };
  const parsed = storyboardContentSchema.parse(JSON.parse(JSON.stringify(legacy)));
  assert.deepEqual(parsed, legacy);
  assert.equal(parsed.shots[0].visuals, undefined);
  const withVisual = board([talkShot([{ ...visual(), start: undefined } as unknown as StoryboardVisual])]);
  assert.equal(storyboardContentSchema.parse(withVisual).shots[0].visuals![0].start, 0, "a missing in-point reads as 0");
});

test("compile puts visuals on the lane above while the talking clip and its sound run uninterrupted", () => {
  const still = visual({ at: 1, duration: 2 }), clip = visual({ source: "broll.mp4", at: 3.5, start: 1, duration: 2.5, label: "Demo" });
  const shots = [talkShot([still, clip]), talkShot([], { start: 12, duration: 2 })];
  const ops = compileStoryboard(board(shots), assets, 10);
  const talking = ops.filter(op => op.create_visual?.lane_key === "visual_0").map(op => op.create_visual!);
  const overlays = ops.filter(op => op.create_visual?.lane_key === STORYBOARD_VISUAL_LANE).map(op => op.create_visual!);
  assert.equal(talking.length, 2, "speech stays one continuous clip per shot; visuals add no cuts");
  assert.deepEqual(talking.map(c => [c.timeline_start, c.source_start_seconds, c.source_end_seconds, c.volume]), [[10, 3, 9, 1], [16, 12, 14, 1]]);
  assert.deepEqual(overlays.map(c => [c.type, c.timeline_start, c.lane_index]), [["still", 11, 1], ["video_clip", 13.5, 1]]);
  assert.equal(overlays[0].duration_seconds, 2);
  assert.deepEqual([overlays[1].source_start_seconds, overlays[1].source_end_seconds, overlays[1].volume], [1, 3.5, 0], "B-roll is muted so the speech carries");
  assert.equal(overlays[1].title, "Demo");
  assert.deepEqual(ops.map(op => op.element_id).slice(0, 3), [shots[0].id, still.id, clip.id]);
  const end = (c: NonNullable<typeof overlays[0]>) => c.timeline_start + (c.duration_seconds ?? c.source_end_seconds! - c.source_start_seconds!);
  assert.ok(overlays.every(c => end(c) <= 16 + 1e-9), "visuals end inside their shot");
});

test("reordering visuals swaps their slots, keeping the pair's bounds and gap", () => {
  const a = visual({ at: 1, duration: 1 }), b = visual({ at: 3, duration: 2 });
  const moved = moveShotVisual([a, b], b.id, -1);
  assert.deepEqual(moved.map(v => [v.id, v.at, v.duration]), [[b.id, 1, 2], [a.id, 4, 1]]);
  assert.deepEqual(moveShotVisual(moved, b.id, -1), moved);
  assert.deepEqual(moveShotVisual(moved, b.id, 1).map(v => [v.id, v.at]), [[a.id, 1], [b.id, 3]]);
});

test("agent drafts carry visuals onto the shot and refuse visuals that cannot play there", () => {
  const draft = (visuals: unknown[], extra: object = {}) => storyboardDraftSchema.parse({ revision: 0, beats: [{ name: "Point", shots: [{ source: "talk.mp4", start: 2, end: 8, label: "Point one", visuals, ...extra }] }] });
  const content = applyStoryboardDraft(emptyStoryboard(), draft([
    { source: "broll.mp4", at: 3, duration: 2, start: 1, label: "Demo" },
    { source: "shot.png", at: 0.5, duration: 2, label: "Pricing page", note: "zoom into the price" },
  ]), assets, randomUUID);
  assert.deepEqual(content.sources.sort(), ["broll.mp4", "shot.png", "talk.mp4"]);
  assert.equal(content.shots.length, 1, "visuals never become separate shots");
  assert.deepEqual(content.shots[0].visuals!.map(v => [v.label, v.at, v.duration, v.start]), [["Pricing page", .5, 2, 0], ["Demo", 3, 2, 1]]);
  const summary = storyboardAgentSummary({ revision: 4, content, canUndo: true, canRedo: false }, assets);
  assert.deepEqual(summary.beats[0].shots[0].visuals.map(v => [v.source, v.at, v.duration, v.note]), [["shot.png", .5, 2, "zoom into the price"], ["broll.mp4", 3, 2, ""]]);
  const refuse = (visuals: unknown[], pattern: RegExp) => assert.throws(() => applyStoryboardDraft(emptyStoryboard(), draft(visuals), assets, randomUUID), (e: Error) => e instanceof StoryboardDraftError && pattern.test(e.message));
  refuse([{ source: "missing.png", at: 0, duration: 1, label: "x" }], /Beat 1, shot 1, visual 1: unknown source/);
  refuse([{ source: "music.mp3", at: 0, duration: 1, label: "x" }], /photo or video/);
  refuse([{ source: "raw.mov", at: 0, duration: 1, label: "x" }], /still preparing/);
  refuse([{ source: "shot.png", at: 5, duration: 2, label: "x" }], /6\.00s shot/);
  refuse([{ source: "broll.mp4", at: 0, duration: 2, start: 3, label: "x" }], /4\.00s long/);
  refuse([{ source: "shot.png", at: 0, duration: 1, start: 1, label: "x" }], /omit start/);
  refuse([{ source: "shot.png", at: 0, duration: 2, label: "a" }, { source: "shot.png", at: 1, duration: 2, label: "b" }], /overlap/);
  assert.throws(() => draft([{ source: "shot.png", at: 0, duration: 1, label: "x", lane: 2 }]), /Unrecognized key/);
});

test("drafted visuals save as one Undo step, round trip through the agent routes and build an overlay lane without touching the timeline", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "storyboard-visuals-")), previous = process.env.TIMELINE_PROJECTS_DIR, previousAuto = process.env.MEDIA_PREPARATION_AUTOSTART;
  process.env.TIMELINE_PROJECTS_DIR = root; process.env.MEDIA_PREPARATION_AUTOSTART = "0";
  try {
    const { createProject, readTimeline } = await import("../local-store/store");
    const { ingestMediaBuffer } = await import("../local-store/media-ingest");
    const { writePreparation, PREPARATION_RECIPE } = await import("../local-store/media-preparation");
    const { readStoryboard, updateStoryboard } = await import("../local-store/storyboard");
    const draftRoute = await import("../../app/api/projects/[projectId]/storyboard/draft/route");
    const timelineRoute = await import("../../app/api/projects/[projectId]/storyboard/timeline/route");
    createProject("visuals", "web");
    const talk = ingestMediaBuffer({ projectId: "visuals", originalFilename: "talk.mp4", buffer: Buffer.from("talk bytes") }).media_path;
    const photo = ingestMediaBuffer({ projectId: "visuals", originalFilename: "pricing.png", buffer: Buffer.from("photo bytes") }).media_path;
    const stat = fs.statSync(path.join(root, "visuals", "media", talk));
    writePreparation("visuals", { recipe: PREPARATION_RECIPE, source: talk, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: talk, render: talk, duration: 20 });
    const original = JSON.stringify(readTimeline("visuals"));
    const params = Promise.resolve({ projectId: "visuals" });
    const post = (body: object) => draftRoute.POST(new Request("http://localhost/api/projects/visuals/storyboard/draft", { method: "POST", body: JSON.stringify(body) }), { params });
    const beats = [{ name: "Intro", shots: [{ source: talk, start: 1, end: 7, label: "Why it matters", visuals: [{ source: photo, at: 2, duration: 3, label: "Pricing page" }] }] }];

    const tooLong = await post({ revision: 0, beats: [{ shots: [{ ...beats[0].shots[0], visuals: [{ source: photo, at: 5, duration: 3, label: "x" }] }] }] });
    assert.equal(tooLong.status, 422); assert.match((await tooLong.json()).error, /visual 1: ends 8\.00s into a 6\.00s shot/);
    assert.equal(readStoryboard("visuals").revision, 0, "a refused draft changes nothing");

    const saved = await post({ revision: 0, beats });
    const body = await saved.json(); assert.equal(saved.status, 200, JSON.stringify(body));
    assert.deepEqual(body.beats[0].shots[0].visuals.map((v: StoryboardVisual) => [v.source, v.at, v.duration, v.label]), [[photo, 2, 3, "Pricing page"]]);
    const read = await (await draftRoute.GET(new Request("http://localhost/api/projects/visuals/storyboard/draft"), { params })).json();
    assert.deepEqual(read.beats, body.beats, "storyboard_get returns the visuals the draft wrote");

    const built = await timelineRoute.POST(new Request("http://localhost/api/projects/visuals/storyboard/timeline", { method: "POST", body: JSON.stringify({ revision: read.revision }) }), { params });
    const result = await built.json(); assert.equal(built.status, 201, JSON.stringify(result));
    const placed = readTimeline("visuals").elements.filter(e => !e.removed_at).sort((a, b) => a.timeline_start - b.timeline_start);
    assert.deepEqual(placed.map(e => [e.lane_key, e.type, e.timeline_start]), [["visual_0", "video_clip", 0], [STORYBOARD_VISUAL_LANE, "still", 2]]);
    assert.notEqual(JSON.stringify(readTimeline("visuals")), original, "Build timeline writes the first assembly directly");

    await updateStoryboard("visuals", { action: "undo", revision: read.revision });
    assert.deepEqual(readStoryboard("visuals").content, emptyStoryboard(), "one Undo removes the whole draft, visuals included");
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous;
    if (previousAuto === undefined) delete process.env.MEDIA_PREPARATION_AUTOSTART; else process.env.MEDIA_PREPARATION_AUTOSTART = previousAuto;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("taking a source out of the story removes its visuals over other shots too", () => {
  const kept = visual({ source: "broll.mp4", at: 3, duration: 1 });
  const before = board([talkShot([visual(), kept])]) as Parameters<typeof deselectStoryboardSource>[0];
  const after = deselectStoryboardSource(before, "shot.png");
  assert.deepEqual(after.shots[0].visuals, [kept]);
  assert.equal(after.shots.length, 1, "the talking shot stays");
  assert.equal(deselectStoryboardSource(after, "shot.png"), after, "nothing to remove leaves the board as it was");
});

test("placement: photos float in beside the speaker by default, full covers the frame, motion graphics keep their own layout", () => {
  const motion: StoryboardAsset = { source: "hyperframes/intro/intro.0123456789abcdef.webm", name: "Intro", kind: "video", url: "/api/projects/demo/media/hyperframes/intro/intro.0123456789abcdef.webm", ready: true, generated: false, duration: 5 };
  const floating = visual({ at: 0, duration: 1.5 }), full = visual({ at: 1.5, duration: 1.5, placement: "full" }), graphic = visual({ source: motion.source, at: 3, duration: 2 });
  const ops = compileStoryboard({ ...board([talkShot([floating, full, graphic])]), sources: [...assets.map(a => a.source), motion.source] }, [...assets, motion]);
  const byId = (id: string) => ops.find(op => op.element_id === id)!.create_visual!;
  assert.equal(byId(floating.id).media_scale, 0.4);
  assert.ok(byId(floating.id).media_offset_x! < -0.2, "floats in the left third, beside a centred speaker");
  assert.equal(byId(floating.id).animationIn, "slide_up");
  assert.equal(byId(full.id).media_scale, undefined);
  assert.equal(byId(full.id).animationIn, "fade");
  assert.deepEqual([byId(graphic.id).has_alpha, byId(graphic.id).media_scale, byId(graphic.id).animationIn], [true, undefined, undefined]);
  const draft = storyboardDraftSchema.parse({ revision: 0, beats: [{ shots: [{ source: "talk.mp4", start: 0, end: 4, label: "Talk", visuals: [{ source: "shot.png", at: 0, duration: 1, label: "Card", placement: "full" }] }] }] });
  assert.equal(applyStoryboardDraft(emptyStoryboard(), draft, assets).shots[0].visuals![0].placement, "full");
});
