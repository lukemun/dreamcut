import assert from "node:assert/strict";
import test from "node:test";
import { resolveProposalPreviewHiddenLanes, resolveProposalPreviewLaneOrder, resolveProposalPreviewMutedLanes } from "./proposal-preview-visibility";
import type { TimelineElement } from "./types";

const element = (id: string, lane_key: string) => ({ id, lane_key }) as TimelineElement;

test("temporarily reveals a touched actor that already lived on a muted lane", () => {
  const result = resolveProposalPreviewMutedLanes({
    liveMutedLanes: new Set(["captions_1", "visual_9"]),
    previewMutedLaneKeys: ["captions_1", "visual_9"],
    previewElements: [element("benchmark", "captions_1"), element("other", "visual_9")],
    touchedElementIds: ["benchmark"],
  });
  assert.deepEqual([...result], ["visual_9"]);
});

test("preserves a lane newly muted by the proposal", () => {
  const result = resolveProposalPreviewMutedLanes({
    liveMutedLanes: new Set(),
    previewMutedLaneKeys: ["captions_0"],
    previewElements: [element("caption", "captions_0")],
    touchedElementIds: ["caption"],
  });
  assert.deepEqual([...result], ["captions_0"]);
});

test("temporarily brings the revealed review actor in front of opaque live lanes", () => {
  const result = resolveProposalPreviewLaneOrder({
    liveHiddenLanes: new Set(["captions_1"]),
    previewLaneOrderKeys: ["captions_0", "visual_99", "captions_1"],
    previewElements: [element("benchmark", "captions_1")],
    touchedElementIds: ["benchmark"],
  });
  assert.deepEqual(result, ["captions_1", "captions_0", "visual_99"]);
});

test("temporarily shows a touched actor on a live hidden lane and keeps other hidden lanes", () => {
  const result = resolveProposalPreviewHiddenLanes({
    liveHiddenLanes: new Set(["captions_1", "visual_9"]),
    previewHiddenLaneKeys: ["captions_1", "visual_9"],
    previewElements: [element("title", "captions_1"), element("other", "visual_9")],
    touchedElementIds: ["title"],
  });
  assert.deepEqual([...result], ["visual_9"]);
});
