import assert from "node:assert/strict";
import test from "node:test";

import type { TimelineElement } from "../../components/studio/timeline/types";
import type { TimelineFile } from "../local-store/store";
import { deriveProposalSpatialScope } from "./proposal-spatial-preflight";

const element = (id: string, type: TimelineElement["type"], start: number, duration: number) => ({
  id,
  project_id: "p",
  type,
  timeline_start: start,
  duration,
  lane_key: id,
  lane_index: 0,
  trim_start: 0,
  trim_end: null,
  volume: 1,
  fade_in: 0,
  fade_out: 0,
  playback_rate: 1,
  position_locked: false,
  removed_at: null,
  removed_reason: null,
  props: {},
  source_url: type === "still" ? "/x.png" : null,
  beat_id: null,
  voice_clip_id: null,
  character_id: null,
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
}) as TimelineElement;

const timeline = (elements: TimelineElement[]): TimelineFile => ({ schema_version: 1, elements, transitions: [] });

test("ordinary proposal scope follows only a changed actor's before and after spans", () => {
  const before = timeline([element("11111111-1111-4111-8111-111111111111", "still", 20, 2), element("audio", "music", 0, 60)]);
  const after = timeline([{ ...before.elements[0]!, timeline_start: 21 }, before.elements[1]!]);
  const scope = deriveProposalSpatialScope(before, after, [before.elements[0]!.id], [{
    element_id: before.elements[0]!.id,
    props: { semanticLayout: { slot: "upper_left", size: "supporting" } },
  } as never]);
  assert.equal(scope.kind, "proposal_changes");
  assert.deepEqual(scope.focus_element_ids, [before.elements[0]!.id]);
  assert.deepEqual(scope.time_ranges, [{ start_seconds: 20, end_seconds: 23 }]);
});

test("audio-only options skip spatial preflight and global geometry expands the scope", () => {
  const before = timeline([element("11111111-1111-4111-8111-111111111111", "still", 10, 5), element("audio", "music", 0, 60)]);
  const audioScope = deriveProposalSpatialScope(before, before, ["audio"], [{ element_id: "audio", patch: { volume: 0.5 } } as never]);
  assert.equal(audioScope.kind, "no_visual_change");
  const globalScope = deriveProposalSpatialScope(before, before, [], [{
    element_id: "22222222-2222-4222-8222-222222222222",
    set_output_format: { aspect_ratio: "9:16" },
  } as never]);
  assert.equal(globalScope.kind, "global_visual_change");
  assert.deepEqual(globalScope.time_ranges, [{ start_seconds: 10, end_seconds: 15 }]);
  assert.equal(globalScope.focus_element_ids, undefined);
});
