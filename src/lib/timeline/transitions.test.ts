import assert from "node:assert/strict";
import test from "node:test";

import {
  buildTimelineTransitionLayout,
  deriveTransitionWindow,
  remapTransitionProgressAfterHold,
  resolveCubeTransitionVisualStyle,
  resolvePageTurnCurl,
  resolvePageTurnOrigin,
  resolvePageTurnTransitionVisualStyle,
  resolveSlideMotionBlurPx,
  resolveTransitionAudioMultiplier,
  resolveWhipTransitionVisualStyle,
  resolveIncomingTransitionPreroll,
  validateTransitionAdjacency,
} from "@/lib/timeline/transitions";
import { toVisualFrame } from "@/lib/timeline/frame-quantization";
import type { TimelineElement, TimelineTransition } from "@/components/studio/timeline/types";

test("moving incoming overlap uses handles and lands on the main source head without replaying motion", () => {
  const window = resolveIncomingTransitionPreroll(72, 12, 2);
  assert.deepEqual(window, { trimBefore: 48, trimAfter: 72 });
  assert.equal(window!.trimBefore + (12 - 1) * 2, 70);
  assert.equal(window!.trimBefore + 12 * 2, 72);
  assert.deepEqual(resolveIncomingTransitionPreroll(30, 15, 1), { trimBefore: 15, trimAfter: 30 });
  assert.equal(resolveIncomingTransitionPreroll(0, 12, 2), null);
  assert.equal(resolveIncomingTransitionPreroll(20, 12, 2), null);
});

function buildElement(overrides: Partial<TimelineElement>): TimelineElement {
  return {
    id: overrides.id ?? "el-1",
    project_id: "project-1",
    type: overrides.type ?? "still",
    source_url: "https://example.com/image.png",
    props: overrides.props ?? null,
    beat_id: null,
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
    removed_at: null,
    removed_reason: null,
    created_at: overrides.created_at ?? "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  };
}

function buildTransition(overrides: Partial<TimelineTransition>): TimelineTransition {
  return {
    id: overrides.id ?? "tr-1",
    project_id: "project-1",
    from_element_id: overrides.from_element_id ?? "el-1",
    to_element_id: overrides.to_element_id ?? "el-2",
    type: overrides.type ?? "fade",
    duration_seconds: overrides.duration_seconds ?? 0.5,
    params: overrides.params ?? null,
    removed_at: null,
    removed_reason: null,
    created_at: "2026-03-20T00:00:00.000Z",
    updated_at: "2026-03-20T00:00:00.000Z",
  };
}

test("validateTransitionAdjacency requires flush adjacent clips", () => {
  const elements = [
    buildElement({ id: "a", timeline_start: 0, duration: 2 }),
    buildElement({ id: "b", timeline_start: 2, duration: 2, created_at: "2026-03-20T00:00:01.000Z" }),
  ];

  const valid = validateTransitionAdjacency(elements, "a", "b", 0.5);
  assert.equal(valid.ok, true);

  const invalid = validateTransitionAdjacency(
    [elements[0]!, buildElement({ id: "c", timeline_start: 2.5, duration: 2 })],
    "a",
    "c",
    0.5,
  );
  assert.deepEqual(invalid, { ok: false, reason: "Transitions require clips to touch." });
});

test("two-frame blends fit three-frame clips without lengthening either clip", () => {
  const elements = [
    buildElement({id: "a", timeline_start: 0, duration: 3 / 30}),
    buildElement({id: "b", timeline_start: 3 / 30, duration: 3 / 30}),
  ];
  assert.deepEqual(validateTransitionAdjacency(elements, "a", "b", 2 / 30),
    {ok: true, durationSeconds: 2 / 30});
  const layout = buildTimelineTransitionLayout(elements, [buildTransition({from_element_id: "a", to_element_id: "b", duration_seconds: 2 / 30})]);
  assert.equal(layout.transitionChips[0]?.start_frame, 1);
  assert.equal(layout.transitionChips[0]?.duration_frames, 2);
  assert.equal(layout.transitionChips[0]?.end_frame, 3);
});

test("short clips can devote all but one frame to a transition", () => {
  const elements = [
    buildElement({ id: "a", timeline_start: 0, duration: 9 / 30 }),
    buildElement({
      id: "b",
      timeline_start: 9 / 30,
      duration: 9 / 30,
      created_at: "2026-03-20T00:00:01.000Z",
    }),
  ];

  const result = validateTransitionAdjacency(
    elements,
    "a",
    "b",
    8 / 30,
  );

  assert.deepEqual(result, { ok: true, durationSeconds: 8 / 30 });
});

test("buildTimelineTransitionLayout keeps clip bounds fixed and marks the outgoing tail region", () => {
  const elements = [
    buildElement({ id: "a", timeline_start: 0, duration: 2 }),
    buildElement({ id: "b", timeline_start: 2, duration: 2, created_at: "2026-03-20T00:00:01.000Z" }),
  ];
  const transitions = [
    buildTransition({ id: "tr-1", from_element_id: "a", to_element_id: "b", duration_seconds: 0.5 }),
  ];

  const layout = buildTimelineTransitionLayout(elements, transitions);
  const first = layout.renderedElements.find((element) => element.id === "a");
  const second = layout.renderedElements.find((element) => element.id === "b");

  assert.equal(first?.timeline_start, 0);
  assert.equal(first?.duration, 2);
  assert.equal(first?.transition_out?.id, "tr-1");
  assert.equal(second?.timeline_start, 2);
  assert.equal(second?.duration, 2);
  assert.equal(second?.transition_in?.id, "tr-1");
  assert.equal(layout.transitionChips.length, 1);
  assert.equal(layout.transitionChips[0]?.timeline_start, 1.5);
  assert.equal(layout.transitionChips[0]?.start_frame, 45);
  assert.equal(layout.transitionChips[0]?.duration_frames, 15);
  assert.equal(layout.transitionChips[0]?.end_frame, 60);
  assert.equal(layout.effectiveDurationSeconds, 4);
});

test("consecutive long transitions keep their authored duration", () => {
  const elements = [
    buildElement({ id: "a", timeline_start: 0, duration: 2 }),
    buildElement({
      id: "b",
      timeline_start: 2,
      duration: 2,
      created_at: "2026-03-20T00:00:01.000Z",
    }),
    buildElement({
      id: "c",
      timeline_start: 4,
      duration: 2,
      created_at: "2026-03-20T00:00:02.000Z",
    }),
  ];
  const transitions = [
    buildTransition({
      id: "tr-1",
      from_element_id: "a",
      to_element_id: "b",
      duration_seconds: 1.8,
    }),
    buildTransition({
      id: "tr-2",
      from_element_id: "b",
      to_element_id: "c",
      duration_seconds: 1.8,
    }),
  ];

  const layout = buildTimelineTransitionLayout(elements, transitions);
  const first = layout.renderedElements.find((element) => element.id === "a");
  const middle = layout.renderedElements.find((element) => element.id === "b");

  assert.equal(first?.transition_out?.duration_seconds, 1.8);
  assert.equal(middle?.transition_in?.duration_seconds, 1.8);
  assert.equal(middle?.transition_out?.duration_seconds, 1.8);
  assert.deepEqual(
    layout.transitionChips.map((chip) => chip.duration_frames),
    [54, 54],
  );
});

test("deriveTransitionWindow is anchored to the source clip end in frame space", () => {
  const fromElement = buildElement({
    id: "a",
    timeline_start: 1.233,
    duration: 2.367,
  });
  const transition = buildTransition({
    id: "tr-1",
    duration_seconds: 0.47,
  });

  const window = deriveTransitionWindow(fromElement, transition);
  const expectedEndFrame = toVisualFrame(fromElement.timeline_start + fromElement.duration);
  const expectedDurationFrames = Math.max(1, toVisualFrame(transition.duration_seconds));

  assert.equal(window.endFrame, expectedEndFrame);
  assert.equal(window.durationFrames, expectedDurationFrames);
  assert.equal(window.startFrame, expectedEndFrame - expectedDurationFrames);
  assert.equal(window.endSeconds, fromElement.timeline_start + fromElement.duration);
});

test("buildTimelineTransitionLayout keeps fixed bounds with trimmed video clips", () => {
  const elements = [
    buildElement({
      id: "a",
      type: "video_clip",
      source_url: "https://example.com/a.mp4",
      timeline_start: 3,
      duration: 2,
      trim_start: 0.6,
      trim_end: 2.6,
    }),
    buildElement({
      id: "b",
      type: "video_clip",
      source_url: "https://example.com/b.mp4",
      timeline_start: 5,
      duration: 2.2,
      trim_start: 1.1,
      trim_end: 3.3,
      created_at: "2026-03-20T00:00:01.000Z",
    }),
  ];
  const transitions = [
    buildTransition({
      id: "tr-1",
      from_element_id: "a",
      to_element_id: "b",
      duration_seconds: 0.4,
    }),
  ];

  const layout = buildTimelineTransitionLayout(elements, transitions);
  const first = layout.renderedElements.find((element) => element.id === "a");
  const second = layout.renderedElements.find((element) => element.id === "b");
  const chip = layout.transitionChips[0];

  assert.equal(first?.timeline_start, 3);
  assert.equal(first?.duration, 2);
  assert.equal(second?.timeline_start, 5);
  assert.equal(second?.duration, 2.2);
  assert.equal(chip?.timeline_start, 4.6);
  assert.equal(chip?.duration, 0.4);
  assert.equal(layout.effectiveDurationSeconds, 7.2);
});

test("buildTimelineTransitionLayout suppresses clip animations on transitioned sides at render time", () => {
  const elements = [
    buildElement({
      id: "a",
      timeline_start: 0,
      duration: 2,
      props: {
        animationIn: "fade",
        animationOut: "slide_left",
      },
    }),
    buildElement({
      id: "b",
      timeline_start: 2,
      duration: 2,
      created_at: "2026-03-20T00:00:01.000Z",
      props: {
        animationIn: "slide_right",
        animationOut: "pop",
      },
    }),
  ];
  const transitions = [
    buildTransition({ id: "tr-1", from_element_id: "a", to_element_id: "b", duration_seconds: 0.5 }),
  ];

  const layout = buildTimelineTransitionLayout(elements, transitions);
  const first = layout.renderedElements.find((element) => element.id === "a");
  const second = layout.renderedElements.find((element) => element.id === "b");

  assert.equal((first?.props as Record<string, unknown> | null)?.animationIn, "fade");
  assert.equal((first?.props as Record<string, unknown> | null)?.animationOut, "none");
  assert.equal((second?.props as Record<string, unknown> | null)?.animationIn, "none");
  assert.equal((second?.props as Record<string, unknown> | null)?.animationOut, "pop");
});

test("left whip carries one motion direction across the seam", () => {
  const outgoingStart = resolveWhipTransitionVisualStyle(0, "out", "from-right");
  const outgoingEnd = resolveWhipTransitionVisualStyle(1, "out", "from-right");
  const incomingStart = resolveWhipTransitionVisualStyle(0, "in", "from-right");
  const incomingEnd = resolveWhipTransitionVisualStyle(1, "in", "from-right");

  assert.equal(outgoingStart.translateXPercent, 0);
  assert.equal(outgoingStart.translateYPercent, 0);
  assert.equal(outgoingEnd.translateXPercent, -32);
  assert.equal(incomingStart.translateXPercent, 32);
  assert.equal(incomingEnd.translateXPercent, 0);
  assert.equal(outgoingEnd.blurPx, incomingStart.blurPx);
  assert.equal(outgoingEnd.scale, incomingStart.scale);
  assert.equal(outgoingEnd.rotateYDeg, incomingStart.rotateYDeg);
  assert.equal(incomingEnd.blurPx, 0);
  assert.equal(incomingEnd.scale, 1);
  assert.equal(incomingEnd.rotateYDeg, 0);
});

test("vertical whip uses the same covered motion contract", () => {
  const outgoingEnd = resolveWhipTransitionVisualStyle(1, "out", "from-bottom");
  const incomingStart = resolveWhipTransitionVisualStyle(0, "in", "from-bottom");

  assert.equal(outgoingEnd.translateXPercent, 0);
  assert.equal(outgoingEnd.translateYPercent, -32);
  assert.equal(incomingStart.translateYPercent, 32);
  assert.equal(outgoingEnd.blurPx, incomingStart.blurPx);
});

test("whip blur strength scales blur without changing travel geometry", () => {
  const normal = resolveWhipTransitionVisualStyle(0.5, "out", "from-bottom", 1);
  const stronger = resolveWhipTransitionVisualStyle(0.5, "out", "from-bottom", 1.8);

  assert.equal(stronger.blurPx, normal.blurPx * 1.8);
  assert.equal(stronger.translateXPercent, normal.translateXPercent);
  assert.equal(stronger.translateYPercent, normal.translateYPercent);
  assert.equal(stronger.scale, normal.scale);
});

test("travelling slide blur is opt-in, peaks during travel, and resolves sharp", () => {
  assert.equal(resolveSlideMotionBlurPx(0.5, {}), 0);
  assert.equal(resolveSlideMotionBlurPx(0, { whip_blur_strength: 1.8 }), 0);
  assert.ok(resolveSlideMotionBlurPx(0.5, { whip_blur_strength: 1.8 }) > 50);
  assert.ok(resolveSlideMotionBlurPx(1, { whip_blur_strength: 1.8 }) < 0.000001);
});

test("cube turns both rigid faces around a common centre", () => {
  const outgoingStart = resolveCubeTransitionVisualStyle(0, "out", "from-left");
  const outgoingMiddle = resolveCubeTransitionVisualStyle(0.5, "out", "from-left");
  const outgoingEnd = resolveCubeTransitionVisualStyle(1, "out", "from-left");
  const incomingStart = resolveCubeTransitionVisualStyle(0, "in", "from-left");
  const incomingMiddle = resolveCubeTransitionVisualStyle(0.5, "in", "from-left");
  const incomingEnd = resolveCubeTransitionVisualStyle(1, "in", "from-left");

  assert.equal(outgoingStart.rotateYDeg, 0);
  assert.equal(outgoingMiddle.rotateYDeg, 45);
  assert.equal(outgoingEnd.rotateYDeg, 90);
  assert.equal(outgoingStart.transformOrigin, "center");
  assert.equal(incomingStart.rotateYDeg, -90);
  assert.equal(incomingMiddle.rotateYDeg, -45);
  assert.equal(incomingEnd.rotateYDeg, 0);
  assert.equal(incomingStart.transformOrigin, "center");
  assert.equal(outgoingMiddle.rotateYDeg, -incomingMiddle.rotateYDeg);
});

test("right cube turn mirrors the shared rotation", () => {
  const outgoing = resolveCubeTransitionVisualStyle(0.5, "out", "from-right");
  const incoming = resolveCubeTransitionVisualStyle(0.5, "in", "from-right");

  assert.equal(outgoing.rotateYDeg, -45);
  assert.equal(outgoing.transformOrigin, "center");
  assert.equal(incoming.rotateYDeg, 45);
  assert.equal(incoming.transformOrigin, "center");
});

test("page turn keeps the incoming page flat while the outgoing sheet hinges away", () => {
  const outgoingStart = resolvePageTurnTransitionVisualStyle(0, "out", "from-right");
  const outgoingMiddle = resolvePageTurnTransitionVisualStyle(0.5, "out", "from-right");
  const outgoingEnd = resolvePageTurnTransitionVisualStyle(1, "out", "from-right");
  const incomingMiddle = resolvePageTurnTransitionVisualStyle(0.5, "in", "from-right");

  assert.equal(outgoingStart.rotateYDeg, 0);
  assert.equal(outgoingMiddle.rotateYDeg, -82.5);
  assert.equal(outgoingEnd.rotateYDeg, -165);
  assert.equal(outgoingMiddle.transformOrigin, "left center");
  assert.ok(outgoingMiddle.shadowOpacity > 0.5);
  assert.ok(outgoingMiddle.pageShadeOpacity > 0.4);
  assert.equal(incomingMiddle.rotateYDeg, 0);
  assert.equal(incomingMiddle.revealPercent, 100);
});

test("page turn curl defaults safely and clamps authored strength", () => {
  assert.equal(resolvePageTurnCurl(undefined), 0.55);
  assert.equal(resolvePageTurnCurl({ page_curl: 0.9 }), 0.9);
  assert.equal(resolvePageTurnCurl({ page_curl: 1.4 }), 1.4);
  assert.equal(resolvePageTurnCurl({ page_curl: -1 }), 0);
  assert.equal(resolvePageTurnCurl({ page_curl: 4 }), 2);
});

test("page turn origin defaults to the right edge and accepts the diagonal corner mode", () => {
  assert.equal(resolvePageTurnOrigin(undefined), "right-edge");
  assert.equal(resolvePageTurnOrigin({ page_turn_origin: "right-edge" }), "right-edge");
  assert.equal(resolvePageTurnOrigin({ page_turn_origin: "bottom-right" }), "bottom-right");
});

test("narration-owned whip stays neutral until its delayed motion start", () => {
  assert.equal(remapTransitionProgressAfterHold(0, 1 / 3), 0);
  assert.equal(remapTransitionProgressAfterHold(1 / 3, 1 / 3), 0);
  assert.ok(Math.abs(remapTransitionProgressAfterHold(2 / 3, 1 / 3) - 0.5) < 1e-9);
  assert.equal(remapTransitionProgressAfterHold(1, 1 / 3), 1);
});

test("narration-owned whip keeps full audio through the aligned word then releases", () => {
  const transition = buildTransition({
    duration_seconds: 0.4,
    params: {
      direction: "from-left",
      motion: "travel",
      audio_fade_start_progress: 1 / 3,
      audio_fade_duration_seconds: 2 / 30,
    },
  });
  assert.equal(resolveTransitionAudioMultiplier(158, 167, transition), 1);
  assert.equal(resolveTransitionAudioMultiplier(159, 167, transition), 1);
  assert.equal(resolveTransitionAudioMultiplier(160, 167, transition), 0.5);
  assert.equal(resolveTransitionAudioMultiplier(161, 167, transition), 0);
  assert.equal(resolveTransitionAudioMultiplier(166, 167, transition), 0);
});

// The inner edge of each rigid face must occupy the same 3D position,
// not merely appear close at the midpoint of a particular aspect ratio.
test("cube faces stay joined throughout all four directions and canvas shapes", () => {
 for (const [width,height] of [[360,640],[640,360]]) {
  for (const direction of ["from-left","from-right","from-top","from-bottom"] as const) {
   const vertical=direction==="from-top"||direction==="from-bottom";
   const sign=direction==="from-left"||direction==="from-top"?-1:1;
   const radius=(vertical?height:width)/2;
   for (const p of [0,.1,.25,.5,.75,.9,1]) {
    const a=resolveCubeTransitionVisualStyle(p,"out",direction,width,height);
    const b=resolveCubeTransitionVisualStyle(p,"in",direction,width,height);
    const edge=(s:typeof a, offset:number)=>{
     const angle=(vertical?-s.rotateXDeg:s.rotateYDeg)*Math.PI/180;
     return [(vertical?s.translateY:s.translateX)+offset*Math.cos(angle),s.translateZ-offset*Math.sin(angle)];
    };
    const ae=edge(a,sign*radius),be=edge(b,-sign*radius);
    assert.ok(Math.abs(ae[0]-be[0])<1e-8,`seam position ${direction} ${p}`);
    assert.ok(Math.abs(ae[1]-be[1])<1e-8,`seam depth ${direction} ${p}`);
   }
  }
 }
});
test("whip overlaps and mixes both shots at peak directional blur",()=>{
 const a=resolveWhipTransitionVisualStyle(.5,"out","from-right");
 const b=resolveWhipTransitionVisualStyle(.5,"in","from-right");
 assert.equal(b.opacity,.5);assert.equal(a.opacity,1);
 assert.ok(a.blurPx>0);assert.equal(a.blurPx,b.blurPx);
 assert.equal(a.scale,1);
 assert.equal(b.scale,1);
 assert.equal(resolveWhipTransitionVisualStyle(0,"in","from-right").opacity,0);
 assert.equal(resolveWhipTransitionVisualStyle(1,"in","from-right").opacity,1);
});

 test("directional blur has no implicit zoom and its optional pulse preserves travel and blur",()=>{
  for(const phase of ["in","out"] as const)for(const p of [0,.1,.5,.9,1]){
   const normal=resolveWhipTransitionVisualStyle(p,phase,"from-right",.65);
   const zoomed=resolveWhipTransitionVisualStyle(p,phase,"from-right",.65,{whip_zoom_percent:50});
   assert.equal(normal.scale,1);
   assert.equal(zoomed.translateXPercent,normal.translateXPercent);
   assert.equal(zoomed.blurPx,normal.blurPx);
   assert.equal(zoomed.opacity,normal.opacity);
   if(p===.5)assert.equal(zoomed.scale,1.5);
   if(p===0||p===1)assert.equal(zoomed.scale,1);
   assert.deepEqual(resolveWhipTransitionVisualStyle(p,phase,"from-right",.65,{whip_zoom_percent:0}),normal);
  }
 });
