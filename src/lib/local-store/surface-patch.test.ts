import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { applyPreparedElementPatch } from "./cutout-effects";

const element = (type: string) => ({ id: "e", project_id: "p", type, lane_key: "visual_1", timeline_start: 0, duration: 2, trim_start: 0, trim_end: 0, playback_rate: 1,
  source_url: "/x.png", props: { surface_track: { id: "t" } } }) as unknown as TimelineElement;

test("a picture on a tracked surface takes ordinary prop changes", () => {
  // No new surface_track in the patch: the attachment is kept and other props change.
  const patched = applyPreparedElementPatch(element("still"), { props: { surface_region: [0.1, 0, 0.9, 1] } } as never);
  assert.deepEqual((patched.props as Record<string, unknown>).surface_region, [0.1, 0, 0.9, 1]);
});

test("only text and pictures can attach to a surface", () => {
  assert.throws(() => applyPreparedElementPatch(element("music"), { props: { surface_track: { id: "t" } } } as never), /require text or a picture/);
});
