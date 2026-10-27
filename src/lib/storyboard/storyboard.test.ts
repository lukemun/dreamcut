import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { deselectStoryboardSource, insertStoryboardShot, emptyStoryboard, groupStoryboardShots, moveStoryboardShot, storyboardContentSchema, validateStoryboardAssets, type StoryboardAsset, type StoryboardShot } from "./model";
import { compileStoryboard } from "./compile";
import { readStoryboard, updateStoryboard, selectWorkspaceMedia } from "../local-store/storyboard";
import { createProject, readTimeline } from "../local-store/store";
import { ingestMediaBuffer } from "../local-store/media-ingest";
import { POST } from "../../app/api/projects/[projectId]/storyboard/timeline/route";
import { GET as preview } from "../../app/api/projects/[projectId]/storyboard/preview/route";

const shot = (source = "image.png"): StoryboardShot => ({ id: randomUUID(), source, start: 0, duration: .5, label: source, note: "", text: "" });
test("beats move atomically, reject nonadjacent grouping, and retain source handles", () => {
  const shots = [shot(), shot(), shot(), shot()];
  const board = { ...emptyStoryboard(), sources: ["image.png"], shots };
  assert.throws(() => groupStoryboardShots(board, [shots[0].id, shots[2].id], "Bad", randomUUID()), /adjacent/);
  const grouped = groupStoryboardShots(board, [shots[0].id, shots[1].id], "Food", randomUUID());
  const moved = moveStoryboardShot(grouped, shots[1].id);
  assert.deepEqual(moved.shots.map(s => s.id), [shots[2].id, shots[3].id, shots[0].id, shots[1].id]);
  assert.deepEqual(moved.sources, board.sources);
  assert.equal(storyboardContentSchema.safeParse({ ...grouped, shots: [grouped.shots[0], grouped.shots[2], grouped.shots[1], grouped.shots[3]] }).success, false);
});
test("source windows and frame boundaries agree for preview and appended proposal", () => {
  const assets: StoryboardAsset[] = [{ source: "clip.mp4", name: "Clip", kind: "video", url: "/clip.mp4", ready: true, generated: false, duration: 10 }];
  const board = { ...emptyStoryboard(), sources: ["clip.mp4"], shots: [{ ...shot("clip.mp4"), start: 3, duration: 2 }] };
  const a = compileStoryboard(board, assets)[0].create_visual!, b = compileStoryboard(board, assets, 12)[0].create_visual!;
  assert.equal(a.source_start_seconds, 3); assert.equal(a.source_end_seconds, 5); assert.equal(a.volume, 1);
  assert.deepEqual({ ...b, timeline_start: 0 }, a);
  assert.throws(() => validateStoryboardAssets(board, [{ ...assets[0], ready: false }]), /unavailable/);
  assert.throws(() => compileStoryboard({ ...board, shots: [{ ...board.shots[0], start: 9 }] }, assets), /unavailable/);
});
test("a clip in Media can be marked before it joins Visuals", () => {
  const clip: StoryboardAsset = { source: "clip.mp4", name: "Clip", kind: "video", url: "/clip.mp4", ready: true, generated: false, duration: 10 };
  const board = storyboardContentSchema.parse({ ...emptyStoryboard(), marks: [{ id: randomUUID(), source: clip.source, label: "", start: 2, end: null }] });
  assert.deepEqual(board.sources, []);
  validateStoryboardAssets(board, [clip]);
  assert.throws(() => validateStoryboardAssets(board, []), /unavailable/, "the clip must still be in the project");
  // Shots still need the clip in Visuals.
  assert.equal(storyboardContentSchema.safeParse({ ...board, shots: [shot(clip.source)] }).success, false);
});
test("saved selects support undo/redo, stale protection, preview and a direct timeline build", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "storyboard-test-")), previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    createProject("fixture", "web");
    const imported = ingestMediaBuffer({ projectId: "fixture", originalFilename: "photo.png", buffer: Buffer.from("fixture bytes") });
    const source = imported.media_path, original = JSON.stringify(readTimeline("fixture"));
    await selectWorkspaceMedia("fixture", source);
    assert.equal(readStoryboard("fixture").selection?.source, source);
    assert.equal(readStoryboard("fixture").revision, 0);
    assert.equal(readStoryboard("fixture").canUndo, false);
    assert.equal(JSON.stringify(readTimeline("fixture")), original);
    await assert.rejects(selectWorkspaceMedia("fixture", "missing.wav"), /unavailable/);
    assert.equal(readStoryboard("fixture").selection?.source, source);
    const other = ingestMediaBuffer({ projectId: "fixture", originalFilename: "other.png", buffer: Buffer.from("other fixture bytes") }).media_path;
    await selectWorkspaceMedia("fixture", [source, other, source]);
    assert.deepEqual(readStoryboard("fixture").selection?.sources, [source, other]);
    assert.equal(readStoryboard("fixture").revision, 0);
    await assert.rejects(selectWorkspaceMedia("fixture", [source, "missing.wav"]), /unavailable/);
    assert.deepEqual(readStoryboard("fixture").selection?.sources, [source, other]);
    await selectWorkspaceMedia("fixture", [other]);
    assert.deepEqual(readStoryboard("fixture").selection?.sources, [other]);
    await selectWorkspaceMedia("fixture", []);
    assert.deepEqual(readStoryboard("fixture").selection?.sources, []);
    assert.equal(readStoryboard("fixture").selection?.source, null);
    assert.equal(JSON.stringify(readTimeline("fixture")), original);
    const mark = { id: randomUUID(), source, label: "Full", start: 0, end: null };
    const content = { ...emptyStoryboard(), sources: [source], marks: [mark], shots: [{ ...shot(source), markId: mark.id }] };
    await updateStoryboard("fixture", { action: "save", revision: 0, content });
    await assert.rejects(updateStoryboard("fixture", { action: "save", revision: 0, content }), /another window/);
    await updateStoryboard("fixture", { action: "undo", revision: 1 });
    assert.deepEqual(readStoryboard("fixture").content, emptyStoryboard());
    await updateStoryboard("fixture", { action: "redo", revision: 2 });
    assert.deepEqual(readStoryboard("fixture").content, content);
    const params = Promise.resolve({ projectId: "fixture" });
    const response = await preview(new Request("http://localhost/api/projects/fixture/storyboard/preview"), { params });
    const data = await response.json(); assert.equal(response.status, 200, JSON.stringify(data));
    assert.equal(data.elements.length, 1); assert.equal(data.durationInFrames, 15);
    const stale = await POST(new Request("http://localhost/api/projects/fixture/storyboard/timeline", { method: "POST", body: JSON.stringify({ revision: 2 }) }), { params });
    assert.equal(stale.status, 400, "a changed storyboard is refused");
    assert.equal(JSON.stringify(readTimeline("fixture")), original);
    const built = await POST(new Request("http://localhost/api/projects/fixture/storyboard/timeline", { method: "POST", body: JSON.stringify({ revision: 3 }) }), { params });
    const result = await built.json(); assert.equal(built.status, 201, JSON.stringify(result));
    assert.equal(readTimeline("fixture").elements.filter(e => !e.removed_at).length, 1, "the story lands on the timeline");
    const again = await POST(new Request("http://localhost/api/projects/fixture/storyboard/timeline", { method: "POST", body: JSON.stringify({ revision: 3 }) }), { params });
    assert.equal(again.status, 409, "a timeline with clips asks before adding more");
    assert.equal((await again.json()).needs_confirmation, true);
    const appended = await POST(new Request("http://localhost/api/projects/fixture/storyboard/timeline", { method: "POST", body: JSON.stringify({ revision: 3, append: true }) }), { params });
    assert.equal(appended.status, 201);
    const live = readTimeline("fixture").elements.filter(e => !e.removed_at).sort((a, b) => a.timeline_start - b.timeline_start);
    assert.deepEqual(live.map(e => e.timeline_start), [0, .5], "a confirmed build goes after the existing clips, which are kept");
    assert.equal(fs.readFileSync(path.join(root, "fixture", "media", source), "utf8"), "fixture bytes");
  } finally { if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous; fs.rmSync(root, { recursive: true, force: true }); }
});

test("footage selection is idempotent and deselection preserves source marks and other beats", () => {
  const first = shot("a.png"), other = shot("b.png");
  const board = { ...emptyStoryboard(), sources: ["a.png", "b.png"], shots: [first, other] };
  assert.equal(insertStoryboardShot(board, shot("a.png"), other.id, true), board);
  const extraMoment = insertStoryboardShot(board, shot("a.png"));
  assert.equal(extraMoment.shots.length, 3);
  const removed = deselectStoryboardSource(extraMoment, "a.png");
  assert.deepEqual(removed.shots, [other]);
  assert.deepEqual(removed.sources, board.sources);
  assert.equal(deselectStoryboardSource(removed, "a.png"), removed);
  const restored = insertStoryboardShot(removed, first, undefined, true);
  assert.equal(restored.shots.filter(s => s.source === "a.png").length, 1);
  const group = { id: randomUUID(), name: "A only" };
  const grouped = { ...board, groups: [group], shots: [{ ...first, groupId: group.id }, other] };
  assert.deepEqual(deselectStoryboardSource(grouped, "a.png").groups, []);
});


test("staging full audio never creates timeline operations", () => {
  const audio: StoryboardAsset = { source: "recording.m4a", name: "Recording", kind: "audio", url: "/recording.m4a", ready: true, generated: false, duration: 10 };
  const board = { ...emptyStoryboard(), sources: [audio.source] };
  validateStoryboardAssets(board, [audio]);
  assert.deepEqual(compileStoryboard(board, [audio]), []);
  assert.throws(() => compileStoryboard({ ...board, shots: [shot(audio.source)] }, [audio]), /Audio stays in the media workspace/);
});

test("reference beats can remain empty; output rejects gaps and never substitutes reference footage", () => {
  const reference: StoryboardAsset = { source: "reference.mp4", name: "Reference", kind: "video", url: "/ref.mp4", ready: true, generated: false, duration: 6 };
  const replacement: StoryboardAsset = { source: "photo.png", name: "Replacement", kind: "image", url: "/photo.png", ready: true, generated: false };
  const beat = { id: randomUUID(), label: "Reveal", start: 2, end: 4, originalText: "Original", text: "Our reveal", note: "Keep the pacing", candidates: [] as StoryboardShot[], reviewed: false };
  const board = storyboardContentSchema.parse({ ...emptyStoryboard(), mode: "reference", sources: [reference.source, replacement.source], reference: { source: reference.source, title: "Reference", captions: true, beats: [beat] } });
  validateStoryboardAssets(board, [reference, replacement]);
  assert.throws(() => compileStoryboard(board, [reference, replacement]), /needs footage/);
  board.shots = [shot(replacement.source)]; // A preserved freeform sequence must not leak into reference output.
  const selected = { ...shot(replacement.source), duration: 1.5 };
  board.reference!.beats[0] = { ...beat, candidates: [selected], selectedId: selected.id };
  const ops = compileStoryboard(board, [reference, replacement], 10);
  assert.equal(ops.length, 2);
  assert.equal(ops[0].create_visual!.source_url, replacement.url);
  assert.equal(ops[0].create_visual!.timeline_start, 10);
  assert.equal(ops[1].create_text!.text, "Our reveal");
  assert.equal(ops[1].create_text!.duration_seconds, 1.5);
  assert.equal(ops[1].create_text!.timeline_start, 10);
  assert.deepEqual(compileStoryboard(board, [reference, replacement], 10), ops);
  board.reference!.beats[0].candidates[0].source = reference.source;
  assert.throws(() => compileStoryboard(board, [reference, replacement]), /replacement footage/);
});

test("reference validation rejects overlap, missing selection, source changes and out-of-bounds candidates", () => {
  const asset: StoryboardAsset = { source: "ref.mp4", name: "Reference", kind: "video", url: "/ref.mp4", ready: true, generated: false, duration: 6, sourceHash: "a".repeat(64) };
  const beat = { id: randomUUID(), label: "Intro", start: 0, end: 2, originalText: "", text: "", note: "", candidates: [], reviewed: false };
  const input = { ...emptyStoryboard(), mode: "reference", sources: [asset.source], reference: { source: asset.source, title: "Reference", sourceHash: asset.sourceHash, captions: false, beats: [beat] } };
  const board = storyboardContentSchema.parse(input);
  validateStoryboardAssets(board, [asset]);
  assert.throws(() => validateStoryboardAssets(board, [{ ...asset, sourceHash: "b".repeat(64) }]), /source changed/);
  assert.equal(storyboardContentSchema.safeParse({ ...input, reference: { ...input.reference, beats: [beat, { ...beat, id: randomUUID(), start: 1, end: 3 }] } }).success, false);
  assert.equal(storyboardContentSchema.safeParse({ ...input, reference: { ...input.reference, beats: [{ ...beat, selectedId: randomUUID() }] } }).success, false);
  board.reference!.beats[0].end = 7;
  assert.throws(() => validateStoryboardAssets(board, [asset]), /exceeds/);
});

test("reference plan undo retains alternatives; caption preview and timeline build agree", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "reference-board-test-")), previous = process.env.TIMELINE_PROJECTS_DIR;
  const previousAuto = process.env.MEDIA_PREPARATION_AUTOSTART;
  process.env.TIMELINE_PROJECTS_DIR = root; process.env.MEDIA_PREPARATION_AUTOSTART = "0";
  try {
    createProject("reference-fixture", "web");
    const original = JSON.stringify(readTimeline("reference-fixture"));
    const photo = ingestMediaBuffer({ projectId: "reference-fixture", originalFilename: "photo.png", buffer: Buffer.from("fixture photo") });
    const reference = ingestMediaBuffer({ projectId: "reference-fixture", originalFilename: "reference.mp4", buffer: Buffer.from("fixture video") });
    const { writePreparation, PREPARATION_RECIPE } = await import("../local-store/media-preparation");
    const stat = fs.statSync(path.join(root, "reference-fixture", "media", reference.media_path));
    // Only persistence/compilation is under test; media decoding is exercised in the browser fixture.
    writePreparation("reference-fixture", { recipe: PREPARATION_RECIPE, source: reference.media_path, size: stat.size, mtime: stat.mtimeMs, state: "ready", preview: reference.media_path, render: reference.media_path, duration: 6 });
    const candidate = { ...shot(photo.media_path), duration: 2 };
    const alternative = { ...shot(photo.media_path), duration: 1 };
    const beat = { id: randomUUID(), label: "Reveal", start: 0, end: 2, originalText: "Original", text: "A new reveal", note: "Match the reveal", candidates: [candidate, alternative], selectedId: candidate.id, reviewed: false };
    const content = storyboardContentSchema.parse({ ...emptyStoryboard(), mode: "reference", sources: [reference.media_path, photo.media_path], reference: { source: reference.media_path, title: "Reference", captions: true, beats: [beat] } });
    await updateStoryboard("reference-fixture", { action: "save", revision: 0, content });
    await updateStoryboard("reference-fixture", { action: "save", revision: 1, content: { ...content, reference: { ...content.reference!, beats: [{ ...beat, selectedId: alternative.id }] } } });
    await updateStoryboard("reference-fixture", { action: "undo", revision: 2 });
    assert.deepEqual(readStoryboard("reference-fixture").content, content);
    const params = Promise.resolve({ projectId: "reference-fixture" });
    const rendered = await preview(new Request("http://localhost/api/projects/reference-fixture/storyboard/preview"), { params });
    const data = await rendered.json(); assert.equal(rendered.status, 200, JSON.stringify(data));
    assert.equal(data.elements.length, 2); assert.equal(data.durationInFrames, 60);
    assert.equal(JSON.stringify(readTimeline("reference-fixture")), original);
    const result = await POST(new Request("http://localhost/api/projects/reference-fixture/storyboard/timeline", { method: "POST", body: JSON.stringify({ revision: 3 }) }), { params });
    const body = await result.json(); assert.equal(result.status, 201, JSON.stringify(body));
    assert.equal(readTimeline("reference-fixture").elements.filter(e => !e.removed_at).length, data.elements.length, "the build matches the preview: the shot and its caption");
    const badRange = await preview(new Request(`http://localhost/api/projects/reference-fixture/storyboard/preview?source=${encodeURIComponent(reference.media_path)}&start=5&duration=2`), { params });
    assert.equal(badRange.status, 400);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous;
    if (previousAuto === undefined) delete process.env.MEDIA_PREPARATION_AUTOSTART; else process.env.MEDIA_PREPARATION_AUTOSTART = previousAuto;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("independent story follows its own footage and timing while reference beats remain planning data", () => {
  const assets: StoryboardAsset[] = [
    {source:"ref.mp4",name:"Reference",kind:"video",url:"/ref.mp4",ready:true,generated:false,duration:6},
    {source:"room.mp4",name:"Our room",kind:"video",url:"/room.mp4",ready:true,generated:false,duration:8},
  ];
  const ownShot = {...shot("room.mp4"),start:2,duration:1.5,transitionNote:"Car passes to reveal the room; planned only."};
  const board = storyboardContentSchema.parse({...emptyStoryboard(),mode:"reference",sources:assets.map(a=>a.source),shots:[ownShot],reference:{source:"ref.mp4",title:"Reference",independentStory:true,beats:[{id:randomUUID(),label:"Different activity",start:0,end:3,originalText:"Shopping",text:"",note:"",candidates:[],reviewed:false}]}});
  assert.equal(board.shots[0].transitionNote,ownShot.transitionNote);
  const ops=compileStoryboard(board,assets,4);
  assert.equal(ops.length,1);
  assert.equal(ops[0].create_visual!.source_url,"/room.mp4");
  assert.equal(ops[0].create_visual!.source_start_seconds,2);
  assert.equal(ops[0].create_visual!.source_end_seconds,3.5);
  assert.equal(ops[0].create_visual!.timeline_start,4);
  assert.throws(()=>compileStoryboard({...board,reference:{...board.reference!,independentStory:false}},assets),/needs footage/);
});
