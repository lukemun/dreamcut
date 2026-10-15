import assert from "node:assert/strict";
import test from "node:test";

import type { CoverLayoutItem } from "@/lib/layout-proposals/cover-layout";
import {
  recordCoverLayoutHistory,
  redoCoverLayoutHistory,
  undoCoverLayoutHistory,
} from "./cover-layout-history";

function item(x: number): CoverLayoutItem {
  return {
    id: "cover-1",
    asset_url: "/cover.jpg",
    x,
    y: 20,
    width: 10,
    height: 16,
    rotation: 0,
  };
}

test("layout history records one committed gesture and replays undo then redo", () => {
  const before = [item(10)];
  const after = [item(30)];
  const recorded = recordCoverLayoutHistory({ undo: [], redo: [] }, before, after);

  assert.equal(recorded.undo.length, 1);
  assert.equal(recorded.redo.length, 0);

  const undone = undoCoverLayoutHistory(recorded);
  assert.equal(undone.items?.[0]?.x, 10);
  assert.equal(undone.stacks.undo.length, 0);
  assert.equal(undone.stacks.redo.length, 1);

  const redone = redoCoverLayoutHistory(undone.stacks);
  assert.equal(redone.items?.[0]?.x, 30);
  assert.equal(redone.stacks.undo.length, 1);
  assert.equal(redone.stacks.redo.length, 0);
});

test("new layout changes clear redo and unchanged commits do not add history", () => {
  const first = recordCoverLayoutHistory({ undo: [], redo: [] }, [item(10)], [item(20)]);
  const undone = undoCoverLayoutHistory(first);
  const replacement = recordCoverLayoutHistory(undone.stacks, [item(10)], [item(15)]);
  const unchanged = recordCoverLayoutHistory(replacement, [item(15)], [item(15)]);

  assert.equal(replacement.redo.length, 0);
  assert.equal(unchanged, replacement);
});
