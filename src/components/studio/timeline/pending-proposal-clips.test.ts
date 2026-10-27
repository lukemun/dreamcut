import assert from "node:assert/strict";
import test from "node:test";
import { pendingProposalClips } from "./pending-proposal-clips";
import type { TimelineElement } from "./types";

const clip = (id: string, removed = false) => ({ id, lane_key: "visual_1", removed_at: removed ? "2026-10-22T00:00:00Z" : null }) as unknown as TimelineElement;

test("checked proposals show the clips they add and the live clips they replace", () => {
  const live = [clip("baked"), clip("music"), clip("old", true)];
  const draft = [clip("baked", true), clip("music"), clip("word"), clip("subline"), clip("old", true)];
  const { added, addedIds, outgoingIds } = pendingProposalClips(live, draft);
  assert.deepEqual(added.map((element) => element.id), ["word", "subline"]);
  assert.deepEqual([...addedIds], ["word", "subline"]);
  assert.deepEqual([...outgoingIds], ["baked"], "an unchanged clip and one already removed are not outgoing");
  assert.deepEqual([...pendingProposalClips(live, [clip("music")]).outgoingIds], ["baked"], "a clip missing from the draft is outgoing");
});
