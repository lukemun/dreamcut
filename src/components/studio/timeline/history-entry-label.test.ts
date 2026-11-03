import assert from "node:assert/strict";
import test from "node:test";

import { HISTORY_ACTION_HEADER, HISTORY_LABEL_HEADER } from "@/lib/timeline/history-label";
import { historyEntryLabel } from "./history-entry-label";
import { historyReplayRequestInit, runHistoryReplay } from "./history-replay-request";
import { createTimelineClient } from "./timeline-client";
import type { TimelineElement } from "./types";

const cat = { id: "cat", type: "video_clip", source_url: "/m/cat.mp4", props: { timeline_label: "Cat" } } as unknown as TimelineElement;
const title = { id: "t", type: "caption_text", source_url: null, props: { text: "The Long Way Home" } } as unknown as TimelineElement;
const lookup = (id: string) => (id === "cat" ? cat : null);

test("in-session steps are named from their patch and the clip name", () => {
  assert.equal(historyEntryLabel({ type: "patch", elementId: "cat", before: { props: { media_mirror: "none" } }, after: { props: { media_mirror: "horizontal" } } }, lookup), "Flip Cat");
  assert.equal(historyEntryLabel({ type: "patch", elementId: "cat", before: { playback_rate: 1 }, after: { playback_rate: 2 } }, lookup), "Change speed of Cat");
  assert.equal(historyEntryLabel({ type: "patch", elementId: "gone", before: { timeline_start: 0 }, after: { timeline_start: 1 } }, lookup), "Move clip");
  assert.equal(historyEntryLabel({ type: "create", element: title }), "Add title 'The Long Way Home'");
  assert.equal(historyEntryLabel({ type: "delete", element: cat }), "Remove Cat");
  assert.equal(historyEntryLabel({ type: "snapshot", beforeSnapshotId: "a", afterSnapshotId: "b", label: "agent edit" }), "Apply proposal");
  assert.equal(historyEntryLabel(undefined), "nothing in this session");
});

test("only writes made during an Undo/Redo replay carry the replay marker", async () => {
  assert.equal(historyReplayRequestInit({ method: "PATCH" })?.headers, undefined);
  const calls: RequestInit[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => { calls.push(init ?? {}); return Response.json({ element: cat }); }) as typeof globalThis.fetch;
  try {
    const client = createTimelineClient("p");
    await runHistoryReplay("undo", "Flip Cat", () => client.patchElement("cat", { props: {} }));
    await client.patchElement("cat", { props: {} });
  } finally { globalThis.fetch = original; }
  const marked = new Headers(calls[0]!.headers);
  assert.equal(marked.get(HISTORY_ACTION_HEADER), "undo");
  assert.equal(decodeURIComponent(marked.get(HISTORY_LABEL_HEADER)!), "Flip Cat");
  assert.equal(marked.get("content-type"), "application/json", "existing headers are preserved");
  assert.equal(new Headers(calls[1]!.headers).get(HISTORY_ACTION_HEADER), null, "ordinary edits are not marked");
});
