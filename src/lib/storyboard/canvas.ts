import { z } from "zod";

/**
 * The storyboard canvas: cards placed freely and joined by lines. A moment card shows one mark
 * (marks and moment cards are one-to-one, so marking a clip adds its card and removing either
 * removes both), an effect card names a template, a text card holds anything the creator writes.
 * Nothing here compiles to the timeline; the agent reads the connected graph and assembles from it.
 */
const coordinate = z.number().finite().min(-1e6).max(1e6);
export const CANVAS_MIN_WIDTH = 120, CANVAS_MAX_WIDTH = 900;
export const CANVAS_NODE_KINDS = ["moment", "effect", "text"] as const;
export const storyboardCanvasNodeSchema = z.object({
  id: z.string().uuid(), kind: z.enum(CANVAS_NODE_KINDS), x: coordinate, y: coordinate,
  /** Card width the creator chose; absent uses the kind's default. Height follows the content. */
  width: z.number().finite().min(CANVAS_MIN_WIDTH).max(CANVAS_MAX_WIDTH).optional(),
  markId: z.string().uuid().optional(),
  template: z.object({ id: z.string().min(1).max(200), title: z.string().min(1).max(240) }).passthrough().optional(),
  /** A text card's words, or an effect card's note. Moment notes live on the mark. */
  text: z.string().max(4000).optional(),
}).passthrough().superRefine((node, ctx) => {
  if (node.kind === "moment" && !node.markId) ctx.addIssue({ code: "custom", message: "A moment card needs its mark" });
  if (node.kind === "effect" && !node.template) ctx.addIssue({ code: "custom", message: "An effect card needs a template" });
});
export const storyboardCanvasEdgeSchema = z.object({
  id: z.string().uuid(), from: z.string().uuid(), to: z.string().uuid(), label: z.string().max(120).optional(),
}).passthrough().refine(edge => edge.from !== edge.to, "A line joins two different cards");
export const storyboardCanvasSchema = z.object({
  nodes: z.array(storyboardCanvasNodeSchema).max(2000),
  edges: z.array(storyboardCanvasEdgeSchema).max(5000),
}).passthrough();
export type StoryboardCanvas = z.infer<typeof storyboardCanvasSchema>;
export type CanvasNode = z.infer<typeof storyboardCanvasNodeSchema>;
export type CanvasEdge = z.infer<typeof storyboardCanvasEdgeSchema>;

type Mark = { id: string; source: string; label: string; start: number; end: number | null; note?: string };
type Board = { marks: Mark[]; canvas?: StoryboardCanvas };

/** Default card widths; a moment is narrower so a vertical frame reads without a tall card. */
export const CANVAS_CARD_WIDTH = 240;
export const canvasCardWidth = (node: Pick<CanvasNode, "kind" | "width">) => node.width ?? (node.kind === "moment" ? 170 : CANVAS_CARD_WIDTH);
const GAP = 40, ROW: Record<CanvasNode["kind"], number> = { moment: 0, effect: 420, text: 760 };

/** The canvas reads as a vertical timeline: moments down the left in order, each with its cards to its right. */
export const CANVAS_ROW_HEIGHT = 420, CANVAS_SIDE_X = 280;

/** Where a new card of `kind` goes: a moment below the last moment; other cards after the last of their kind. */
export function nextCanvasPlace(canvas: StoryboardCanvas, kind: CanvasNode["kind"]) {
  const row = canvas.nodes.filter(node => node.kind === kind);
  if (kind === "moment") return { x: 0, y: row.length ? Math.max(...row.map(node => node.y)) + CANVAS_ROW_HEIGHT : 0 };
  return { x: row.length ? Math.max(...row.map(node => node.x)) + CANVAS_CARD_WIDTH + GAP : CANVAS_SIDE_X, y: ROW[kind] };
}
/** Beside a moment, after the cards already joined to it. */
const besideMoment = (board: Board, moment: CanvasNode, markId: string) => ({
  x: moment.x + Math.max(CANVAS_SIDE_X, canvasCardWidth(moment) + GAP) + momentLinks(board, markId).reduce((sum, link) => sum + canvasCardWidth(link.node) + GAP, 0), y: moment.y });

const emptyCanvas = (): StoryboardCanvas => ({ nodes: [], edges: [] });
const withoutDanglingEdges = (canvas: StoryboardCanvas): StoryboardCanvas => {
  const ids = new Set(canvas.nodes.map(node => node.id));
  return { ...canvas, edges: canvas.edges.filter(edge => ids.has(edge.from) && ids.has(edge.to)) };
};

/** Every mark has its moment card and every moment card its mark; lines to removed cards go too.
 *  Returns the board unchanged when nothing needs placing, so callers can skip a save. */
export function reconcileCanvas<B extends Board>(board: B, newId: () => string = () => crypto.randomUUID()): B {
  const canvas = board.canvas ?? emptyCanvas();
  const marks = new Set(board.marks.map(mark => mark.id));
  const placed = new Set(canvas.nodes.flatMap(node => node.kind === "moment" && node.markId ? [node.markId] : []));
  const kept = canvas.nodes.filter(node => node.kind !== "moment" || (node.markId && marks.has(node.markId)));
  const missing = board.marks.filter(mark => !placed.has(mark.id));
  if (!missing.length && kept.length === canvas.nodes.length && board.canvas) return board;
  let next: StoryboardCanvas = { ...canvas, nodes: kept };
  for (const mark of missing) next = { ...next, nodes: [...next.nodes, { id: newId(), kind: "moment", markId: mark.id, ...nextCanvasPlace(next, "moment") }] };
  return { ...board, canvas: withoutDanglingEdges(next) };
}

/** A card to add; position is optional (it then goes after the last card in its row). */
export type NewCanvasNode = { id: string; kind: CanvasNode["kind"]; markId?: string; template?: { id: string; title: string }; text?: string; x?: number; y?: number };
export function addCanvasNode<B extends Board>(board: B, node: NewCanvasNode): B {
  const canvas = board.canvas ?? emptyCanvas();
  const place = node.x === undefined || node.y === undefined ? nextCanvasPlace(canvas, node.kind) : { x: node.x, y: node.y };
  return { ...board, canvas: { ...canvas, nodes: [...canvas.nodes, { ...node, ...place }] } };
}

export function updateCanvasNode<B extends Board>(board: B, id: string, patch: { text?: string; template?: { id: string; title: string } }): B {
  const canvas = board.canvas ?? emptyCanvas();
  if (!canvas.nodes.some(node => node.id === id)) throw new Error("That card is no longer on the canvas");
  return { ...board, canvas: { ...canvas, nodes: canvas.nodes.map(node => node.id === id ? { ...node, ...patch } : node) } };
}

/** Moves (and resizes) cards in one step: a drag of several selected cards is one Undo. */
export function placeCanvasNodes<B extends Board>(board: B, places: { id: string; x: number; y: number; width?: number }[]): B {
  const canvas = board.canvas ?? emptyCanvas(), at = new Map(places.map(place => [place.id, place]));
  return { ...board, canvas: { ...canvas, nodes: canvas.nodes.map(node => {
    const place = at.get(node.id);
    if (!place) return node;
    const width = place.width === undefined ? node.width : Math.round(Math.min(CANVAS_MAX_WIDTH, Math.max(CANVAS_MIN_WIDTH, place.width)));
    return { ...node, x: place.x, y: place.y, ...(width !== undefined ? { width } : {}) };
  }) } };
}

/** Removing a moment card removes its mark, since the two are one thing. */
export function removeCanvasNodes<B extends Board>(board: B, ids: string[]): B {
  const canvas = board.canvas ?? emptyCanvas(), gone = new Set(ids);
  const marks = new Set(canvas.nodes.flatMap(node => gone.has(node.id) && node.kind === "moment" && node.markId ? [node.markId] : []));
  return { ...board, marks: board.marks.filter(mark => !marks.has(mark.id)), canvas: withoutDanglingEdges({ ...canvas, nodes: canvas.nodes.filter(node => !gone.has(node.id)) }) };
}

/** Joins two cards; joining a pair that is already joined (either way round) changes nothing. */
export function connectCanvasNodes<B extends Board>(board: B, from: string, to: string, id: string, label?: string): B {
  const canvas = board.canvas ?? emptyCanvas(), ids = new Set(canvas.nodes.map(node => node.id));
  if (!ids.has(from) || !ids.has(to)) throw new Error("Both cards must be on the canvas");
  if (from === to) throw new Error("A line joins two different cards");
  if (canvas.edges.some(edge => (edge.from === from && edge.to === to) || (edge.from === to && edge.to === from))) return board;
  return { ...board, canvas: { ...canvas, edges: [...canvas.edges, { id, from, to, ...(label ? { label } : {}) }] } };
}

export function disconnectCanvasEdges<B extends Board>(board: B, ids: string[]): B {
  const canvas = board.canvas ?? emptyCanvas(), gone = new Set(ids);
  return { ...board, canvas: { ...canvas, edges: canvas.edges.filter(edge => !gone.has(edge.id)) } };
}

/** Cards joined to a mark's moment card (effects and text), with the line joining each, in canvas order. */
export function momentLinks(board: Board, markId: string) {
  const canvas = board.canvas ?? emptyCanvas();
  const moment = canvas.nodes.find(node => node.kind === "moment" && node.markId === markId);
  if (!moment) return [];
  return canvas.edges.flatMap(edge => {
    const other = edge.from === moment.id ? edge.to : edge.to === moment.id ? edge.from : null;
    const node = other ? canvas.nodes.find(n => n.id === other && n.kind !== "moment") : undefined;
    return node ? [{ edgeId: edge.id, node }] : [];
  });
}

/** Adds a text card joined to a mark (the Timeline's freeform text beside a frame). */
export function addMomentText<B extends Board>(input: B, markId: string, text: string, newId: () => string = () => crypto.randomUUID()): B {
  const board = reconcileCanvas(input, newId);
  const moment = board.canvas!.nodes.find(node => node.kind === "moment" && node.markId === markId);
  if (!moment) throw new Error("That moment is no longer on the storyboard");
  const id = newId();
  return connectCanvasNodes(addCanvasNode(board, { id, kind: "text", text, ...besideMoment(board, moment, markId) }), moment.id, id, newId());
}

/** Takes a card off a mark: a text card joined only to it goes; a shared card (an effect on several marks) just loses this line. */
export function removeMomentLink<B extends Board>(input: B, markId: string, nodeId: string): B {
  const node = input.canvas?.nodes.find(n => n.id === nodeId);
  if (node?.kind === "effect") return unlinkMomentEffect(input, markId, nodeId);
  const lines = input.canvas?.edges.filter(edge => edge.from === nodeId || edge.to === nodeId).length ?? 0;
  return lines <= 1 ? removeCanvasNodes(input, [nodeId]) : disconnectCanvasEdges(input, momentLinks(input, markId).filter(link => link.node.id === nodeId).map(link => link.edgeId));
}

/** Effect cards joined to a mark's moment card, with the line joining each. */
export function momentEffects(board: Board, markId: string) {
  const canvas = board.canvas ?? emptyCanvas();
  const moment = canvas.nodes.find(node => node.kind === "moment" && node.markId === markId);
  if (!moment) return [];
  return canvas.edges.flatMap(edge => {
    const other = edge.from === moment.id ? edge.to : edge.to === moment.id ? edge.from : null;
    const node = other ? canvas.nodes.find(n => n.id === other && n.kind === "effect") : undefined;
    return node ? [{ edgeId: edge.id, node }] : [];
  });
}

/** Gives a mark its own card for a template, beside it, so each moment's effect can be read and tuned on its
 *  own while scrolling. A mark that already has that template keeps the one it has. */
export function linkMomentEffect<B extends Board>(input: B, markId: string, template: { id: string; title: string }, newId: () => string = () => crypto.randomUUID()): B {
  const board = reconcileCanvas(input, newId);
  const moment = board.canvas!.nodes.find(node => node.kind === "moment" && node.markId === markId);
  if (!moment) throw new Error("That moment is no longer on the storyboard");
  if (momentLinks(board, markId).some(link => link.node.kind === "effect" && link.node.template?.id === template.id)) return board;
  const id = newId();
  return connectCanvasNodes(addCanvasNode(board, { id, kind: "effect", template, text: "", ...besideMoment(board, moment, markId) }), moment.id, id, newId());
}

/**
 * Lays the canvas out as a vertical timeline: moments down the left in board order, each with the cards
 * joined to it in a row to its right. An effect shared by several moments becomes one copy per moment (same
 * template and note), so every moment shows its own. Cards joined to no moment line up below. `heights`
 * (measured on screen) keeps tall frames from overlapping the next row.
 */
export function arrangeCanvasTimeline<B extends Board>(input: B, heights: Map<string, number> = new Map(), newId: () => string = () => crypto.randomUUID()): B {
  let board = reconcileCanvas(input, newId);
  let canvas = board.canvas!;
  const moments = board.marks.map(mark => canvas.nodes.find(node => node.kind === "moment" && node.markId === mark.id)!);
  const momentIds = new Set(moments.map(node => node.id));
  // One effect card per moment.
  for (const effect of canvas.nodes.filter(node => node.kind === "effect")) {
    const lines = canvas.edges.filter(edge => (edge.from === effect.id && momentIds.has(edge.to)) || (edge.to === effect.id && momentIds.has(edge.from)));
    for (const line of lines.slice(1)) {
      const copy = { ...effect, id: newId() };
      canvas = { ...canvas, nodes: [...canvas.nodes, copy], edges: canvas.edges.map(edge => edge.id !== line.id ? edge : edge.from === effect.id ? { ...edge, from: copy.id } : { ...edge, to: copy.id }) };
    }
  }
  const place = new Map<string, { x: number; y: number }>();
  let y = 0;
  for (const moment of moments) {
    const beside = canvas.edges.flatMap(edge => edge.from === moment.id ? [edge.to] : edge.to === moment.id ? [edge.from] : [])
      .map(id => canvas.nodes.find(node => node.id === id)!).filter(node => node.kind !== "moment" && !place.has(node.id));
    place.set(moment.id, { x: 0, y });
    let x = Math.max(CANVAS_SIDE_X, canvasCardWidth(moment) + GAP);
    for (const node of beside) { place.set(node.id, { x, y }); x += canvasCardWidth(node) + GAP; }
    const tallest = Math.max(heights.get(moment.id) ?? CANVAS_ROW_HEIGHT - GAP * 2, ...beside.map(node => heights.get(node.id) ?? 0));
    y += tallest + GAP * 2;
  }
  canvas.nodes.filter(node => !place.has(node.id)).forEach((node, index) => place.set(node.id, { x: index * (CANVAS_CARD_WIDTH + GAP), y }));
  board = { ...board, canvas: { ...canvas, nodes: canvas.nodes.map(node => ({ ...node, ...place.get(node.id)! })) } };
  return board;
}

/** Detaches an effect from a mark; an effect card left with no lines and no note goes too. */
export function unlinkMomentEffect<B extends Board>(input: B, markId: string, effectId: string): B {
  const links = momentEffects(input, markId).filter(link => link.node.id === effectId);
  let board = disconnectCanvasEdges(input, links.map(link => link.edgeId));
  const effect = board.canvas?.nodes.find(node => node.id === effectId);
  if (effect && !effect.text && !board.canvas!.edges.some(edge => edge.from === effectId || edge.to === effectId)) board = removeCanvasNodes(board, [effectId]);
  return board;
}

/** Marks are numbered by board order (M1, M2…), the same on the canvas and in a clip's Marks list. */
export const markNumbers = (board: Board) => new Map(board.marks.map((mark, index) => [mark.id, index + 1]));
/** Marks saved before notes existed carry a generic or custom name; a custom name reads as the note. */
export const markNote = (mark: Mark) => mark.note ?? (mark.label === "Saved moment" || mark.label === "Saved range" ? "" : mark.label);

/** The canvas as the agent reads it: each card resolved (moment → clip and time, effect → template),
 *  with its lines, in reading order (rows top to bottom, then left to right). */
export function canvasGraph(board: Board, clipName: (source: string) => string = source => source.split("/").pop() ?? source) {
  let unplaced = 0;
  const view = reconcileCanvas(board, () => `unplaced-${++unplaced}`), canvas = view.canvas ?? emptyCanvas();
  const numbers = markNumbers(board), marks = new Map(board.marks.map(mark => [mark.id, mark]));
  const nodes = [...canvas.nodes].sort((a, b) => a.y - b.y || a.x - b.x).map(node => {
    const base = { id: node.id, kind: node.kind, x: node.x, y: node.y, connected_to: canvas.edges.flatMap(edge => edge.from === node.id ? [edge.to] : edge.to === node.id ? [edge.from] : []) };
    if (node.kind === "moment") {
      const mark = marks.get(node.markId!)!;
      return { ...base, mark_id: mark.id, number: `M${numbers.get(mark.id)}`, source: mark.source, clip: clipName(mark.source), start: mark.start, end: mark.end, note: markNote(mark) };
    }
    if (node.kind === "effect") return { ...base, template_id: node.template!.id, template: node.template!.title, note: node.text ?? "" };
    return { ...base, text: node.text ?? "" };
  });
  return { nodes, edges: canvas.edges.map(edge => ({ id: edge.id, from: edge.from, to: edge.to, ...(edge.label ? { label: edge.label } : {}) })) };
}

const seconds = z.number().finite().min(0);
const cardRef = z.string().min(1).describe("A card id from storyboard_get canvas.nodes[].id, or the `ref` of a card added earlier in this same write");
/** One agent change to the canvas. Cards added in the same write can be joined by their `ref`. */
export const storyboardCanvasOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("add_moment"), ref: z.string().max(80).optional(), source: z.string().min(1), start: seconds, end: seconds.optional(), note: z.string().max(2000).default(""), x: coordinate.optional(), y: coordinate.optional() }).strict(),
  z.object({ op: z.literal("add_effect"), ref: z.string().max(80).optional(), template_id: z.string().min(1).max(200), title: z.string().min(1).max(240), note: z.string().max(4000).default(""), x: coordinate.optional(), y: coordinate.optional() }).strict(),
  z.object({ op: z.literal("add_text"), ref: z.string().max(80).optional(), text: z.string().max(4000), x: coordinate.optional(), y: coordinate.optional() }).strict(),
  z.object({ op: z.literal("update"), id: cardRef, note: z.string().max(4000).optional(), text: z.string().max(4000).optional(), start: seconds.optional(), end: seconds.nullable().optional() }).strict(),
  z.object({ op: z.literal("place"), id: cardRef, x: coordinate, y: coordinate }).strict(),
  z.object({ op: z.literal("connect"), from: cardRef, to: cardRef, label: z.string().max(120).optional() }).strict(),
  z.object({ op: z.literal("disconnect"), edge_id: z.string().min(1) }).strict(),
  z.object({ op: z.literal("remove"), id: cardRef }).strict(),
  z.object({ op: z.literal("arrange") }).strict(),
]);
export const storyboardCanvasWriteSchema = z.object({
  revision: z.number().int().nonnegative(),
  ops: z.array(storyboardCanvasOpSchema).min(1).max(200),
}).strict();
export type StoryboardCanvasOp = z.infer<typeof storyboardCanvasOpSchema>;

/** Applies agent canvas changes in order; any invalid change refuses the whole write. */
export function applyCanvasOps<B extends Board>(input: B, ops: StoryboardCanvasOp[], newId: () => string = () => crypto.randomUUID()): { board: B; refs: Record<string, string> } {
  let board = reconcileCanvas(input, newId);
  const refs: Record<string, string> = {};
  const card = (id: string) => {
    const resolved = refs[id] ?? id;
    const node = board.canvas!.nodes.find(n => n.id === resolved);
    if (!node) throw new Error(`No card ${id} on the canvas`);
    return node;
  };
  const place = (op: { x?: number; y?: number }) => op.x !== undefined && op.y !== undefined ? { x: op.x, y: op.y } : {};
  for (const op of ops) {
    if (op.op === "add_moment") {
      if (op.end !== undefined && op.end <= op.start) throw new Error("A range's end must follow its start");
      const mark = { id: newId(), source: op.source, label: "", start: op.start, end: op.end ?? null, note: op.note };
      const id = newId();
      board = addCanvasNode({ ...board, marks: [...board.marks, mark] }, { id, kind: "moment", markId: mark.id, ...place(op) });
      if (op.ref) refs[op.ref] = id;
    } else if (op.op === "add_effect" || op.op === "add_text") {
      const id = newId();
      board = addCanvasNode(board, op.op === "add_effect" ? { id, kind: "effect", template: { id: op.template_id, title: op.title }, text: op.note, ...place(op) } : { id, kind: "text", text: op.text, ...place(op) });
      if (op.ref) refs[op.ref] = id;
    } else if (op.op === "update") {
      const node = card(op.id);
      if (node.kind === "moment") {
        board = { ...board, marks: board.marks.map(m => m.id !== node.markId ? m : { ...m, ...(op.note !== undefined ? { note: op.note } : {}), ...(op.start !== undefined ? { start: op.start } : {}), ...(op.end !== undefined ? { end: op.end } : {}) }) };
        const mark = board.marks.find(m => m.id === node.markId)!;
        if (mark.end !== null && mark.end <= mark.start) throw new Error("A range's end must follow its start");
      } else board = updateCanvasNode(board, node.id, { text: op.note ?? op.text });
    } else if (op.op === "place") board = placeCanvasNodes(board, [{ id: card(op.id).id, x: op.x, y: op.y }]);
    else if (op.op === "connect") board = connectCanvasNodes(board, card(op.from).id, card(op.to).id, newId(), op.label);
    else if (op.op === "disconnect") {
      if (!board.canvas!.edges.some(e => e.id === op.edge_id)) throw new Error(`No line ${op.edge_id} on the canvas`);
      board = disconnectCanvasEdges(board, [op.edge_id]);
    } else if (op.op === "arrange") board = arrangeCanvasTimeline(board, new Map(), newId);
    else board = removeCanvasNodes(board, [card(op.id).id]);
  }
  return { board, refs };
}
