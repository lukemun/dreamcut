import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createProject } from "../local-store/store";
import { ingestMediaBuffer } from "../local-store/media-ingest";
import { readStoryboard } from "../local-store/storyboard";
import { POST as writeCanvas } from "../../app/api/projects/[projectId]/storyboard/canvas/route";
import { addCanvasNode, addMomentText, applyCanvasOps, arrangeCanvasTimeline, canvasGraph, linkMomentEffect, momentEffects, momentLinks, removeMomentLink, unlinkMomentEffect, connectCanvasNodes, disconnectCanvasEdges, markNote, placeCanvasNodes, reconcileCanvas, removeCanvasNodes } from "./canvas";
import { emptyStoryboard, storyboardContentSchema } from "./model";

const mark = (start: number, note?: string) => ({ id: randomUUID(), source: "sources/walk.mp4", label: "", start, end: null, ...(note !== undefined ? { note } : {}) });

test("every mark gets one moment card, placed below the last, and stays put once placed", () => {
  const marks = [mark(1), mark(2), mark(3)];
  const board = reconcileCanvas({ ...emptyStoryboard(), marks });
  const moments = board.canvas!.nodes.filter(n => n.kind === "moment");
  assert.deepEqual(moments.map(n => n.markId), marks.map(m => m.id));
  assert.deepEqual(moments.map(n => n.y), [0, 420, 840], "moments go down the page in order");
  assert.equal(reconcileCanvas(board), board, "nothing to place leaves the board unchanged (no save)");
  storyboardContentSchema.parse(board);
});

test("effects and text connect to moments; the agent reads the graph in reading order", () => {
  const stops = [mark(1, "first stop"), mark(4, "second stop")];
  let board = reconcileCanvas({ ...emptyStoryboard(), marks: stops });
  const effect = randomUUID(), line = randomUUID();
  board = addCanvasNode(board, { id: effect, kind: "effect", template: { id: "FX-SPEED-ENTRANCE-EXIT", title: "Speed Entrance & Exit" }, text: "zoom from each stop" });
  board = addCanvasNode(board, { id: line, kind: "text", text: "Then I say my line" });
  const [m1, m2] = board.canvas!.nodes;
  board = connectCanvasNodes(board, m1.id, effect, randomUUID());
  board = connectCanvasNodes(board, m2.id, effect, randomUUID(), "zoom");
  board = connectCanvasNodes(board, effect, m1.id, randomUUID());
  assert.equal(board.canvas!.edges.length, 2, "joining a joined pair again changes nothing");
  storyboardContentSchema.parse(board);

  const graph = canvasGraph(board, () => "Walk");
  assert.deepEqual(graph.nodes.map(n => n.kind), ["moment", "moment", "effect", "text"]);
  const first = graph.nodes[0] as { number: string; clip: string; note: string; connected_to: string[] };
  assert.equal(first.number, "M1"); assert.equal(first.clip, "Walk"); assert.equal(first.note, "first stop");
  assert.deepEqual(first.connected_to, [effect]);
  const fx = graph.nodes[2] as { template_id: string; note: string; connected_to: string[] };
  assert.equal(fx.template_id, "FX-SPEED-ENTRANCE-EXIT"); assert.equal(fx.note, "zoom from each stop");
  assert.deepEqual([...fx.connected_to].sort(), [m1.id, m2.id].sort());
  assert.equal(graph.edges.find(e => e.from === m2.id)?.label, "zoom");
});

test("removing a moment card removes its mark and its lines; removing a mark removes its card", () => {
  const stops = [mark(1), mark(2)];
  let board = reconcileCanvas({ ...emptyStoryboard(), marks: stops });
  const [m1, m2] = board.canvas!.nodes;
  board = connectCanvasNodes(board, m1.id, m2.id, randomUUID());
  const cut = removeCanvasNodes(board, [m1.id]);
  assert.deepEqual(cut.marks.map(m => m.id), [stops[1].id]);
  assert.deepEqual(cut.canvas!.edges, []);
  const unmarked = reconcileCanvas({ ...board, marks: [stops[0]] });
  assert.deepEqual(unmarked.canvas!.nodes.map(n => n.markId), [stops[0].id]);
  assert.deepEqual(unmarked.canvas!.edges, []);
  assert.deepEqual(disconnectCanvasEdges(board, [board.canvas!.edges[0].id]).canvas!.edges, []);
});

test("moves save together and the schema refuses broken links", () => {
  let board = reconcileCanvas({ ...emptyStoryboard(), marks: [mark(1), mark(2)] });
  const [a, b] = board.canvas!.nodes;
  board = placeCanvasNodes(board, [{ id: a.id, x: 500, y: 90 }, { id: b.id, x: 800, y: 90 }]);
  assert.deepEqual(board.canvas!.nodes.map(n => [n.x, n.y]), [[500, 90], [800, 90]]);
  assert.throws(() => connectCanvasNodes(board, a.id, randomUUID(), randomUUID()), /Both cards/);
  assert.equal(storyboardContentSchema.safeParse({ ...board, canvas: { ...board.canvas!, edges: [{ id: randomUUID(), from: a.id, to: randomUUID() }] } }).success, false);
  assert.equal(storyboardContentSchema.safeParse({ ...board, marks: [] }).success, false, "a moment card needs its mark");
});

test("older marks' names read as notes, generic names as empty", () => {
  assert.equal(markNote({ ...mark(0), label: "Saved moment" }), "");
  assert.equal(markNote({ ...mark(0), label: "Swing closeup" }), "Swing closeup");
  assert.equal(markNote({ ...mark(0, "zoom in"), label: "Swing closeup" }), "zoom in");
});

test("agent changes apply in order, refs join cards added in the same write, and a bad change refuses all", () => {
  const ids = Array.from({ length: 20 }, () => randomUUID());
  let n = 0; const next = () => ids[n++];
  const { board, refs } = applyCanvasOps(emptyStoryboard(), [
    { op: "add_moment", ref: "stop", source: "sources/walk.mp4", start: 2, note: "first stop" },
    { op: "add_effect", ref: "speed", template_id: "FX-SPEED-ENTRANCE-EXIT", title: "Speed Entrance & Exit", note: "" },
    { op: "connect", from: "stop", to: "speed", label: "zoom" },
    { op: "update", id: "speed", note: "zoom from each stop" },
    { op: "add_text", text: "Then I say my line" },
  ], next);
  assert.equal(board.marks.length, 1); assert.equal(board.marks[0].note, "first stop");
  assert.equal(board.canvas!.edges[0].label, "zoom");
  assert.equal(board.canvas!.nodes.find(node => node.id === refs.speed)?.text, "zoom from each stop");
  assert.throws(() => applyCanvasOps(board, [{ op: "connect", from: refs.stop, to: "missing" }]), /No card missing/);
  const arranged = applyCanvasOps(board, [{ op: "arrange" }]).board;
  assert.equal(arranged.canvas!.nodes.find(node => node.id === refs.stop)?.x, 0);
  assert.throws(() => applyCanvasOps(board, [{ op: "update", id: refs.stop, end: 1 }]), /end must follow/);
  const removed = applyCanvasOps(board, [{ op: "remove", id: refs.stop }]).board;
  assert.deepEqual(removed.marks, []); assert.deepEqual(removed.canvas!.edges, []);
});

test("the canvas route saves one revision-checked step and refuses stale or invalid writes", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "storyboard-canvas-")), previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  const post = (body: unknown) => writeCanvas(new Request("http://127.0.0.1:3123/api/projects/fixture/storyboard/canvas", { method: "POST", headers: { host: "127.0.0.1:3123" }, body: JSON.stringify(body) }), { params: Promise.resolve({ projectId: "fixture" }) });
  try {
    createProject("fixture", "web");
    const source = ingestMediaBuffer({ projectId: "fixture", originalFilename: "still.png", buffer: Buffer.from("fixture bytes") }).media_path;
    const saved = await post({ revision: 0, ops: [{ op: "add_moment", ref: "m", source, start: 0, note: "hold here" }, { op: "add_text", ref: "t", text: "say my line" }, { op: "connect", from: "m", to: "t" }] });
    const body = await saved.json();
    assert.equal(saved.status, 200, JSON.stringify(body));
    assert.equal(body.saved.revision, 1);
    assert.deepEqual(body.canvas.nodes.map((node: { kind: string }) => node.kind), ["moment", "text"]);
    assert.equal(readStoryboard("fixture").canUndo, true);
    assert.equal((await post({ revision: 0, ops: [{ op: "add_text", text: "late" }] })).status, 409);
    const invalid = await post({ revision: 1, ops: [{ op: "add_moment", source: "sources/missing.mp4", start: 0 }] });
    assert.ok(invalid.status >= 400);
    assert.equal(readStoryboard("fixture").revision, 1, "a refused write changes nothing");
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("each moment gets its own effect card beside it; detaching it removes an empty card", () => {
  const stops = [mark(1), mark(3), mark(5)];
  const speed = { id: "template:FX-SPEED-ENTRANCE-EXIT", title: "Speed Entrance & Exit" };
  let board = reconcileCanvas({ ...emptyStoryboard(), marks: stops });
  for (const stop of stops) board = linkMomentEffect(board, stop.id, speed);
  board = linkMomentEffect(board, stops[0].id, speed);
  const effects = board.canvas!.nodes.filter(n => n.kind === "effect");
  assert.equal(effects.length, 3); assert.equal(board.canvas!.edges.length, 3, "linking twice changes nothing");
  const moment = board.canvas!.nodes.find(n => n.markId === stops[1].id)!, own = momentEffects(board, stops[1].id)[0].node;
  assert.equal(own.y, moment.y, "the effect sits beside its moment");
  assert.ok(own.x > moment.x);
  storyboardContentSchema.parse(board);
  board = unlinkMomentEffect(board, stops[1].id, own.id);
  assert.equal(board.canvas!.nodes.filter(n => n.kind === "effect").length, 2);
});

test("arranging lays moments down the page in order with their cards beside them, one effect each", () => {
  const stops = [mark(1), mark(3), mark(5)];
  let board = reconcileCanvas({ ...emptyStoryboard(), marks: stops });
  const shared = randomUUID();
  board = addCanvasNode(board, { id: shared, kind: "effect", template: { id: "template:FX-SPEED-ENTRANCE-EXIT", title: "Speed Entrance & Exit" }, text: "zoom", x: 900, y: 900 });
  for (const node of board.canvas!.nodes.filter(n => n.kind === "moment")) board = connectCanvasNodes(board, node.id, shared, randomUUID());
  board = addCanvasNode(board, { id: randomUUID(), kind: "text", text: "loose", x: 5, y: 5 });
  board = arrangeCanvasTimeline(board);
  storyboardContentSchema.parse(board);
  const moments = stops.map(stop => board.canvas!.nodes.find(n => n.markId === stop.id)!);
  assert.deepEqual(moments.map(n => n.x), [0, 0, 0]);
  assert.ok(moments[0].y < moments[1].y && moments[1].y < moments[2].y, "scrolling down follows the order");
  for (const [index, stop] of stops.entries()) {
    const own = momentEffects(board, stop.id);
    assert.equal(own.length, 1); assert.equal(own[0].node.y, moments[index].y); assert.equal(own[0].node.text, "zoom");
  }
  assert.equal(new Set(stops.map(stop => momentEffects(board, stop.id)[0].node.id)).size, 3, "one effect card per moment");
  const loose = board.canvas!.nodes.find(n => n.kind === "text")!;
  assert.ok(loose.y > moments[2].y, "cards joined to no moment line up below");
});

test("text beside a moment is a text card joined to it; removing it from the moment removes the card", () => {
  const stop = mark(2);
  let board = linkMomentEffect(reconcileCanvas({ ...emptyStoryboard(), marks: [stop, mark(4)] }), stop.id, { id: "template:FX-SPEED-ENTRANCE-EXIT", title: "Speed Entrance & Exit" });
  board = addMomentText(board, stop.id, "zoom in until I am at the camera");
  assert.deepEqual(momentLinks(board, stop.id).map(link => link.node.kind), ["effect", "text"]);
  storyboardContentSchema.parse(board);
  const text = momentLinks(board, stop.id).find(link => link.node.kind === "text")!.node;
  board = removeMomentLink(board, stop.id, text.id);
  assert.equal(board.canvas!.nodes.some(n => n.id === text.id), false);
  assert.deepEqual(momentLinks(board, stop.id).map(link => link.node.kind), ["effect"]);
});
