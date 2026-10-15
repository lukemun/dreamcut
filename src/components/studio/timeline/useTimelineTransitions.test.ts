import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTimelineTransitionState,
  selectElementTransitions,
  selectTransitionCreateCandidate,
  timelineElementInspectorLabel,
} from "@/components/studio/timeline/useTimelineTransitions";
import type { BeatMarker, TimelineElement, TimelineTransition } from "@/components/studio/timeline/types";

function buildElement(overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id: overrides.id ?? "el-1",
    project_id: "project-1",
    type: overrides.type ?? "still",
    source_url: overrides.source_url === undefined ? "https://example.com/image.png" : overrides.source_url,
    props: overrides.props ?? null,
    beat_id: overrides.beat_id ?? null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: overrides.timeline_start ?? 0,
    duration: overrides.duration ?? 2,
    lane_key: overrides.lane_key ?? "visual_0",
    lane_index: overrides.lane_index ?? 0,
    trim_start: 0,
    trim_end: null,
    volume: 1,
    fade_in: 0,
    fade_out: 0,
    playback_rate: 1,
    position_locked: false,
    removed_at: overrides.removed_at ?? null,
    removed_reason: overrides.removed_reason ?? null,
    created_at: overrides.created_at ?? "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  };
}

function buildTransition(overrides: Partial<TimelineTransition> = {}): TimelineTransition {
  return {
    id: overrides.id ?? "tr-1",
    project_id: "project-1",
    from_element_id: overrides.from_element_id ?? "el-1",
    to_element_id: overrides.to_element_id ?? "el-2",
    type: overrides.type ?? "fade",
    duration_seconds: overrides.duration_seconds ?? 0.5,
    params: overrides.params ?? null,
    removed_at: overrides.removed_at ?? null,
    removed_reason: overrides.removed_reason ?? null,
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  };
}

function buildBeat(overrides: Partial<BeatMarker> = {}): BeatMarker {
  return {
    id: overrides.id ?? "beat-1",
    sort_order: overrides.sort_order ?? 0,
    beat_label: overrides.beat_label ?? "Beat 1",
    duration_seconds: overrides.duration_seconds ?? 2,
    ...overrides,
  };
}

test("buildTimelineTransitionState exposes active rendered transition ids", () => {
  const elements = [
    buildElement({ id: "a", timeline_start: 0, duration: 2 }),
    buildElement({ id: "b", timeline_start: 2, duration: 2, created_at: "2026-03-20T00:00:01.000Z" }),
  ];
  const transitions = [buildTransition({ id: "tr-1", from_element_id: "a", to_element_id: "b" })];

  const state = buildTimelineTransitionState(elements, transitions);

  assert.deepEqual([...state.activeTransitionIds], ["tr-1"]);
  assert.equal(state.transitionChips.length, 1);
  assert.equal(state.renderedElements.find((element) => element.id === "a")?.transition_out?.id, "tr-1");
});

test("selectElementTransitions ignores removed or inactive transitions", () => {
  const selectedElement = buildElement({ id: "a" });
  const transitions = [
    buildTransition({ id: "tr-active", from_element_id: "a", to_element_id: "b" }),
    buildTransition({ id: "tr-inactive", from_element_id: "c", to_element_id: "a" }),
  ];

  const selected = selectElementTransitions(selectedElement, transitions, new Set(["tr-active"]));

  assert.equal(selected.selectedElementOutgoingTransition?.id, "tr-active");
  assert.equal(selected.selectedElementIncomingTransition, null);
});

test("selectTransitionCreateCandidate returns the next flush clip in the same lane", () => {
  const selectedElement = buildElement({ id: "a", beat_id: "beat-1", timeline_start: 0, duration: 2 });
  const nextElement = buildElement({
    id: "b",
    beat_id: "beat-2",
    timeline_start: 2,
    duration: 2,
    created_at: "2026-03-20T00:00:01.000Z",
  });

  const candidate = selectTransitionCreateCandidate(
    selectedElement,
    null,
    [selectedElement, nextElement],
    [buildBeat({ id: "beat-1", beat_label: "Intro" }), buildBeat({ id: "beat-2", beat_label: "Hook" })],
  );

  assert.deepEqual(candidate, {
    fromElementId: "a",
    toElementId: "b",
    fromLabel: "Intro",
    toLabel: "Hook",
  });
});

test("timelineElementInspectorLabel shows authored names and source names before internal ids", () => {
  assert.equal(
    timelineElementInspectorLabel(buildElement({ props: { timeline_label: "Return bridge" } }), []),
    "Return bridge",
  );
  assert.equal(
    timelineElementInspectorLabel(buildElement({ id: "still-1234", beat_id: null, type: "still" }), []),
    "image.png",
  );
  assert.equal(
    timelineElementInspectorLabel(buildElement({ id: "still-1234", beat_id: null, type: "still", source_url: null }), []),
    "Still stil",
  );
});

test("transition discovery agrees with frame-based adjacency instead of millisecond equality", () => {
  const first = buildElement({id: "a", timeline_start: 0, duration: 2});
  const next = buildElement({id: "b", timeline_start: 2.005, duration: 2});
  assert.equal(selectTransitionCreateCandidate(first, null, [first, next], [])?.toElementId, "b");
});

test("transition discovery excludes gaps, different lanes, missing neighbors and clips too short", () => {
  const first = buildElement({id: "a", timeline_start: 0, duration: 2});
  for (const next of [
    buildElement({id: "b", timeline_start: 3, duration: 2}),
    buildElement({id: "b", timeline_start: 2, duration: 2, lane_key: "visual_2"}),
    buildElement({id: "b", timeline_start: 2, duration: 1 / 30}),
  ]) assert.equal(selectTransitionCreateCandidate(first, null, [first, next], []), null);
  assert.equal(selectTransitionCreateCandidate(first, null, [first], []), null);
});
