import type { CoverLayoutItem } from "@/lib/layout-proposals/cover-layout";

export type CoverLayoutHistoryEntry = {
  before: CoverLayoutItem[];
  after: CoverLayoutItem[];
};

export type CoverLayoutHistoryStacks = {
  undo: CoverLayoutHistoryEntry[];
  redo: CoverLayoutHistoryEntry[];
};

const MAX_LAYOUT_HISTORY_ENTRIES = 50;

export function coverLayoutItemsFingerprint(items: CoverLayoutItem[]) {
  return JSON.stringify(items.map((item) => [
    item.id,
    Number(item.x.toFixed(3)),
    Number(item.y.toFixed(3)),
    Number(item.width.toFixed(3)),
    Number(item.height.toFixed(3)),
    Number(item.rotation.toFixed(3)),
  ]));
}

export function cloneCoverLayoutItems(items: CoverLayoutItem[]) {
  return items.map((item) => ({ ...item }));
}

export function recordCoverLayoutHistory(
  stacks: CoverLayoutHistoryStacks,
  before: CoverLayoutItem[],
  after: CoverLayoutItem[],
  maxEntries = MAX_LAYOUT_HISTORY_ENTRIES,
): CoverLayoutHistoryStacks {
  if (coverLayoutItemsFingerprint(before) === coverLayoutItemsFingerprint(after)) return stacks;
  return {
    undo: [
      ...stacks.undo.slice(-(maxEntries - 1)),
      {
        before: cloneCoverLayoutItems(before),
        after: cloneCoverLayoutItems(after),
      },
    ],
    redo: [],
  };
}

export function undoCoverLayoutHistory(stacks: CoverLayoutHistoryStacks): {
  stacks: CoverLayoutHistoryStacks;
  items: CoverLayoutItem[] | null;
} {
  const entry = stacks.undo.at(-1);
  if (!entry) return { stacks, items: null };
  return {
    stacks: {
      undo: stacks.undo.slice(0, -1),
      redo: [...stacks.redo, entry],
    },
    items: cloneCoverLayoutItems(entry.before),
  };
}

export function redoCoverLayoutHistory(stacks: CoverLayoutHistoryStacks): {
  stacks: CoverLayoutHistoryStacks;
  items: CoverLayoutItem[] | null;
} {
  const entry = stacks.redo.at(-1);
  if (!entry) return { stacks, items: null };
  return {
    stacks: {
      undo: [...stacks.undo, entry],
      redo: stacks.redo.slice(0, -1),
    },
    items: cloneCoverLayoutItems(entry.after),
  };
}
