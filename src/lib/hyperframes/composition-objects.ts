/**
 * How many separable objects a rendered composition frame shows.
 *
 * A composition becomes one clip on the timeline, so everything it draws moves, trims and
 * restyles together. It may therefore draw only one object a person would want to edit on
 * its own: one picture (overlapping picture pieces such as a logo and the ring drawn around
 * it count as one) or one block of text (same size, reading as one line or paragraph). Text
 * with a picture, or two blocks of text, are separate objects and belong on separate
 * timeline elements.
 */

/** One visible content element in a rendered frame, in canvas pixels. */
export type ContentLeaf = {
  kind: "text" | "picture";
  left: number;
  top: number;
  right: number;
  bottom: number;
  /** Text only: computed font size in pixels. */
  font_size?: number;
  /** Canvas only: painted edge to edge, so the drawings on it cannot be told apart. */
  opaque?: boolean;
  text?: string;
};

export type SeparableObject = { kind: "text" | "picture"; label: string };

const SIZE_RATIO = 1.18; // text within this size ratio can belong to one block
const LINE_GAP = 0.6; // stacked lines further apart than this many font sizes are separate blocks
const WORD_GAP = 1.5; // words on one line further apart than this many font sizes are separate blocks
const PICTURE_TOLERANCE = 8; // pixels; picture pieces this close count as touching

function overlap(a0: number, a1: number, b0: number, b1: number) {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function sameBlock(a: ContentLeaf, b: ContentLeaf): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "picture") {
    return overlap(a.left, a.right, b.left, b.right) > -PICTURE_TOLERANCE
      && overlap(a.top, a.bottom, b.top, b.bottom) > -PICTURE_TOLERANCE;
  }
  const sa = a.font_size ?? 0, sb = b.font_size ?? 0;
  if (sa <= 0 || sb <= 0 || Math.max(sa, sb) / Math.min(sa, sb) > SIZE_RATIO) return false;
  const size = Math.max(sa, sb);
  const vertical = overlap(a.top, a.bottom, b.top, b.bottom);
  const horizontal = overlap(a.left, a.right, b.left, b.right);
  // Same line: words close enough to read together.
  if (vertical > 0) return horizontal > -WORD_GAP * size;
  // Stacked lines of one paragraph: close vertically and sharing some width.
  return vertical > -LINE_GAP * size && horizontal > 0;
}

/** A frame's visible leaves grouped into the objects they form, each with its bounding box. */
function objectGroups(leaves: readonly ContentLeaf[]): ContentLeaf[][] {
  const parent = leaves.map((_, index) => index);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  for (let i = 0; i < leaves.length; i++) {
    for (let j = i + 1; j < leaves.length; j++) {
      if (sameBlock(leaves[i], leaves[j])) parent[find(i)] = find(j);
    }
  }
  const groups = new Map<number, ContentLeaf[]>();
  leaves.forEach((leaf, index) => {
    const root = find(index);
    groups.set(root, [...(groups.get(root) ?? []), leaf]);
  });
  return [...groups.values()];
}

function label(group: ContentLeaf[]): SeparableObject {
  if (group[0].kind === "picture") return { kind: "picture", label: "picture" };
  const reading = [...group].sort((a, b) => a.top - b.top || a.left - b.left);
  const text = reading.map((leaf) => leaf.text ?? "").join(" ").replace(/\s+/g, " ").trim();
  return { kind: "text", label: `"${text.length > 40 ? `${text.slice(0, 39)}…` : text}"` };
}

const box = (group: ContentLeaf[]) => ({
  left: Math.min(...group.map((leaf) => leaf.left)), top: Math.min(...group.map((leaf) => leaf.top)),
  right: Math.max(...group.map((leaf) => leaf.right)), bottom: Math.max(...group.map((leaf) => leaf.bottom)),
});

/** Group a frame's visible leaves into the separable objects they form. */
export function separableObjects(leaves: readonly ContentLeaf[]): SeparableObject[] {
  return objectGroups(leaves).map(label);
}

/**
 * True when every piece of this frame is a picture lying inside one picture of a later frame:
 * a single drawing whose strokes draw on apart (two legs, then the body joining them) and grow
 * into one silhouette, not separate objects.
 */
function growsIntoOnePicture(groups: ContentLeaf[][], later: readonly { leaves: ContentLeaf[] }[]): boolean {
  if (groups.some((group) => group[0].kind !== "picture")) return false;
  const pieces = groups.map(box);
  return later.some((sample) => objectGroups(sample.leaves).some((group) => {
    if (group[0].kind !== "picture") return false;
    const whole = box(group);
    return pieces.every((piece) => piece.left >= whole.left - PICTURE_TOLERANCE && piece.right <= whole.right + PICTURE_TOLERANCE
      && piece.top >= whole.top - PICTURE_TOLERANCE && piece.bottom <= whole.bottom + PICTURE_TOLERANCE);
  }));
}

/** The first sampled frame that shows more than one object, or null when every frame shows at most one. */
export function firstMultiObjectFrame(samples: readonly { at_seconds: number; leaves: ContentLeaf[] }[]) {
  for (const [index, sample] of samples.entries()) {
    const groups = objectGroups(sample.leaves);
    if (groups.length > 1 && !growsIntoOnePicture(groups, samples.slice(index + 1))) return { at_seconds: sample.at_seconds, objects: groups.map(label) };
  }
  return null;
}
