import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDurationPatch,
  buildCaptionFontSizeProps,
  buildCaptionPresentationPatches,
  buildCaptionGroupPositionPatches,
  buildFadeInPatch,
  buildFadeOutPatch,
  buildStartPatch,
  buildTrimEndPatch,
  buildTrimStartPatch,
  buildVisualTransformSelectionPatches,
  buildToggleVolumeKeyframePatch,
  buildToggleVolumeKeyframePatchAtPlayhead,
  buildVolumePatch,
  hasVolumeKeyframeAtTime,
  hydrateInspectorDraft,
  preservesFramingDraft,
} from "@/components/studio/timeline/useTimelineInspector";
import type { TimelineElement } from "@/components/studio/timeline/types";

test("caption presentation changes batch without copying cue words, alignment, or unrelated props", () => {
  const a = buildElement({ id: "a", props: { text: "First", custom: "a", wordTimings: [{ word: "First", start: 0, end: 1 }] } });
  const b = buildElement({ id: "b", props: { text: "Second", custom: "b", caption_follow_audio: true } });
  const patches = buildCaptionPresentationPatches([a, b, buildElement({ id: "music", type: "music" })], a, { fontPreset: "inter", textColor: "#ff0000", styleVariant: "plain" });
  assert.equal(patches.length, 2);
  assert.equal(patches[0].patch.props.text, "First");
  assert.equal(patches[1].patch.props.text, "Second");
  assert.equal(patches[1].patch.props.custom, "b");
  assert.equal(patches[1].patch.props.caption_follow_audio, true);
  assert.equal(patches[1].patch.props.textColor, "#ff0000");
  assert.equal(buildCaptionPresentationPatches([a, b], a, { text: "Replacement", wordTimings: [] }).length, 1);
  assert.equal(buildCaptionPresentationPatches([a, b], a, { timingMode: "active_word" }).length, 1);
});

function buildElement(overrides: Partial<TimelineElement> = {}): TimelineElement {
  return {
    id: "el-1",
    project_id: "project-1",
    type: "caption_text",
    source_url: null,
    props: {
      text: "A line",
      positionPreset: "bottom_center",
      animationIn: "fade",
      animationOut: "fade",
      fontPreset: "display_serif",
      fontSizePx: 42,
    },
    beat_id: null,
    voice_clip_id: null,
    character_id: null,
    timeline_start: 1.25,
    duration: 3.5,
    lane_key: "captions_0",
    lane_index: 0,
    trim_start: 0.5,
    trim_end: 1.25,
    volume: 0.85,
    fade_in: 0.2,
    fade_out: 0.4,
    playback_rate: 1,
    position_locked: false,
    removed_at: null,
    removed_reason: null,
    created_at: "2026-03-19T00:00:00.000Z",
    updated_at: "2026-03-19T00:00:00.000Z",
    ...overrides,
  };
}

test("hydrateInspectorDraft returns empty defaults when no element is selected", () => {
  const draft = hydrateInspectorDraft(null);

  assert.equal(draft.editStart, "");
  assert.equal(draft.editDuration, "");
  assert.equal(draft.editVolume, 100);
  assert.equal(draft.editCaptionText, "");
});

test("hydrateInspectorDraft mirrors selected element timing and caption props", () => {
  const draft = hydrateInspectorDraft(buildElement({
    props: {
      text: "A line",
      positionPreset: "bottom_center",
      animationIn: "fade",
      animationOut: "fade",
      fontPreset: "display_serif",
      fontSizePx: 42,
      volume_envelope: [
        { time_seconds: 0, volume: 0.85 },
        { time_seconds: 3.5, volume: 0.85 },
      ],
    },
  }));

  assert.equal(draft.editStart, "1.25");
  assert.equal(draft.editDuration, "3.50");
  assert.equal(draft.editVolume, 85);
  assert.equal(draft.editTrimStart, "0.50");
  assert.equal(draft.editTrimEnd, "1.25");
  assert.equal(draft.editFadeIn, "0.20");
  assert.equal(draft.editFadeOut, "0.40");
  assert.equal(draft.editCaptionText, "A line");
  assert.equal(draft.editCaptionPosition, "bottom_center");
});

test("hydrateInspectorDraft falls back to a finite volume for malformed legacy media", () => {
  const draft = hydrateInspectorDraft(buildElement({
    type: "video_clip",
    duration: Number.NaN,
    volume: Number.NaN,
  }));

  assert.equal(draft.editVolume, 100);
  assert.ok(Number.isFinite(draft.editVolume));
});

test("graphic one-line text grows its box with font size", () => {
  const element = buildElement({
    props: {
      text: "GPT-6 ASTRA",
      singleLine: true,
      maxWidth: 0.42,
      fontPreset: "anton",
      fontSizePx: 78,
    },
  });

  const props = buildCaptionFontSizeProps(element, 117);

  assert.equal(props.fontSizePx, 117);
  assert.ok(Math.abs(props.maxWidth - 0.63) < 0.000001);
});

test("spoken one-line captions keep their fixed semantic text rail", () => {
  const element = buildElement({
    props: {
      text: "nearly all benchmarks",
      singleLine: true,
      caption_follow_audio: true,
      caption_audio_binding: { version: 1 },
      maxWidth: 0.72,
      fontSizePx: 78,
    },
  });

  const props = buildCaptionFontSizeProps(element, 117);

  assert.equal(props.fontSizePx, 117);
  assert.equal(props.maxWidth, 0.72);
});

test("compound framing patches every presenter section while preserving member props", () => {
  const first = buildElement({
    id: "presenter-1",
    type: "video_clip",
    lane_key: "visual_21",
    timeline_start: 0,
    duration: 4,
    props: { compound_clip_id: "presenter", member: "first", media_scale: 0.38, media_offset_y: 0 },
  });
  const second = buildElement({
    id: "presenter-2",
    type: "video_clip",
    lane_key: "visual_21",
    timeline_start: 4,
    duration: 6,
    props: { compound_clip_id: "presenter", member: "second", media_scale: 0.38, media_offset_y: 0 },
  });

  const patches = buildVisualTransformSelectionPatches(
    [first, second],
    first,
    7,
    { scale: 0.31, offsetY: -0.22 },
  );

  assert.deepEqual(patches.map((patch) => patch.elementId), ["presenter-1", "presenter-2"]);
  assert.deepEqual(patches.map((patch) => ({
    member: patch.patch.props.member,
    scale: patch.patch.props.media_scale,
    offsetY: patch.patch.props.media_offset_y,
  })), [
    { member: "first", scale: 0.31, offsetY: -0.22 },
    { member: "second", scale: 0.31, offsetY: -0.22 },
  ]);
});

test("buildVolumePatch clamps and rounds inspector volume commits", () => {
  const element = buildElement({ volume: 0.85 });

  assert.deepEqual(buildVolumePatch(element, 132.7), { volume: 1.33 });
  assert.deepEqual(buildVolumePatch(element, 400), { volume: 4 });
  assert.deepEqual(buildVolumePatch(element, 550), { volume: 4 });
  assert.equal(buildVolumePatch(element, 85), null);
});

test("volume keyframe control adds a point at the playhead and removes it on the next toggle", () => {
  const element = buildElement({ duration: 4, volume: 0.8 });
  const addPatch = buildToggleVolumeKeyframePatch(element, 1.5);

  assert.deepEqual(addPatch?.props.volume_envelope, [
    { time_seconds: 0, volume: 0.8 },
    { time_seconds: 1.5, volume: 0.8 },
    { time_seconds: 4, volume: 0.8 },
  ]);

  const keyedElement = buildElement({
    duration: 4,
    volume: addPatch!.volume,
    props: addPatch!.props,
  });
  assert.equal(hasVolumeKeyframeAtTime(keyedElement, 1.5), true);

  const removePatch = buildToggleVolumeKeyframePatch(keyedElement, 1.5);
  assert.deepEqual(removePatch?.props.volume_envelope, [
    { time_seconds: 0, volume: 0.8 },
    { time_seconds: 4, volume: 0.8 },
  ]);
});

test("volume keyframe button converts the timeline playhead to clip-local time", () => {
  const element = buildElement({
    timeline_start: 17.037,
    duration: 67.163,
    volume: 0.4,
  });

  const patch = buildToggleVolumeKeyframePatchAtPlayhead(element, 23.833);

  assert.deepEqual(patch?.props.volume_envelope, [
    { time_seconds: 0, volume: 0.4 },
    { time_seconds: 6.796, volume: 0.4 },
    { time_seconds: 67.163, volume: 0.4 },
  ]);
  const insertedPoint = patch?.props.volume_envelope?.[1];
  assert.equal(Number((element.timeline_start + insertedPoint!.time_seconds).toFixed(3)), 23.833);
});

test("volume commit edits the keyed playhead point without shifting the rest of the envelope", () => {
  const element = buildElement({
    duration: 4,
    volume: 0.8,
    props: {
      volume_envelope: [
        { time_seconds: 0, volume: 0.8 },
        { time_seconds: 1.5, volume: 0.8 },
        { time_seconds: 4, volume: 0.5 },
      ],
    },
  });

  const patch = buildVolumePatch(element, 125, 1.5);
  assert.ok(patch && "props" in patch);
  assert.deepEqual(patch?.props.volume_envelope, [
    { time_seconds: 0, volume: 0.8 },
    { time_seconds: 1.5, volume: 1.25 },
    { time_seconds: 4, volume: 0.5 },
  ]);
  assert.equal(patch?.volume, 0.8);
});

test("build trim and fade patches preserve null semantics and clamp negatives", () => {
  const element = buildElement({ trim_end: 1.25, fade_in: 0.2, fade_out: 0.4 });

  assert.deepEqual(buildTrimStartPatch(element, "-2"), { trim_start: 0 });
  assert.deepEqual(buildTrimEndPatch(element, ""), { trim_end: null });
  assert.equal(buildTrimEndPatch(buildElement({ trim_end: null }), ""), null);
  assert.deepEqual(buildFadeInPatch(element, "-1"), { fade_in: 0 });
  assert.deepEqual(buildFadeOutPatch(element, "1.75"), { fade_out: 1.75 });
});

test("audio trim patches update duration when source-backed media is untrimmed", () => {
  const element = buildElement({
    type: "music",
    duration: 20,
    trim_start: 10,
    trim_end: 180,
    playback_rate: 1,
    _source_duration: 240,
  });

  assert.deepEqual(buildTrimEndPatch(element, ""), {
    trim_end: null,
    duration: 230,
  });
  assert.deepEqual(buildTrimEndPatch(element, "60"), {
    trim_end: 60,
    duration: 170,
  });
});

test("video trim patches collapse existing overflow metadata back into the real clip", () => {
  const element = buildElement({
    type: "video_clip",
    duration: 6,
    trim_start: 0,
    trim_end: null,
    playback_rate: 1,
    props: {
      source_duration_seconds: 4,
      media_limit_duration_seconds: 4,
    },
  });

  assert.deepEqual(buildTrimStartPatch(element, "1"), {
    timeline_start: 2.25,
    trim_start: 1,
    duration: 5,
    props: {
      source_duration_seconds: 4,
    },
  });
  assert.deepEqual(buildTrimEndPatch(element, "1"), {
    trim_end: 1,
    duration: 3,
    props: {
      source_duration_seconds: 4,
    },
  });
});

test("trim start moves the left timeline edge and preserves the right edge", () => {
  const element = buildElement({
    type: "sound_effect",
    timeline_start: 10,
    duration: 1.8,
    trim_start: 0.6,
    trim_end: 0.8,
    playback_rate: 2,
    props: { source_duration_seconds: 5 },
  });

  assert.deepEqual(buildTrimStartPatch(element, "1"), {
    timeline_start: 10.2,
    trim_start: 1,
    duration: 1.6,
  });
});

test("build start and duration patches enforce editor minimums", () => {
  const element = buildElement({ timeline_start: 1.25, duration: 3.5 });

  assert.deepEqual(buildStartPatch(element, "-4"), { timeline_start: 0 });
  assert.deepEqual(buildDurationPatch(element, "0"), { duration: 1 / 30 });
  assert.equal(buildStartPatch(element, "1.25"), null);
  assert.equal(buildDurationPatch(element, "3.5"), null);
});

test("group caption positioning preserves relative spacing and emits one patch per selected caption", () => {
  const primary = buildElement({
    id: "primary",
    props: {
      text: "96%",
      positionPreset: "top_left",
      absX: 0.08,
      absY: 0.06,
    },
  });
  const label = buildElement({
    id: "label",
    props: {
      text: "HIGH CONTRAST",
      positionPreset: "top_left",
      absX: 0.11,
      absY: 0.16,
      textAlign: "left",
    },
  });

  const patches = buildCaptionGroupPositionPatches(
    [primary, label],
    primary.id,
    0.08,
    0.18,
    "top_left",
  );

  assert.equal(patches.length, 2);
  assert.equal((patches[0]!.patch.props as Record<string, unknown>).absY, 0.18);
  assert.equal((patches[1]!.patch.props as Record<string, unknown>).absY, 0.28);
  assert.equal((patches[1]!.patch.props as Record<string, unknown>).textAlign, "left");
  assert.equal((patches[0]!.patch.props as Record<string, unknown>).groupLayout, null);
  assert.equal((patches[1]!.patch.props as Record<string, unknown>).groupLayout, null);
  assert.equal((patches[0]!.patch.props as Record<string, unknown>).benchmarkStackLayout, null);
  assert.equal((patches[1]!.patch.props as Record<string, unknown>).benchmarkStackLayout, null);
});

test("manual caption positioning detaches semantic paragraph layout", () => {
  const paragraphRow = buildElement({
    id: "paragraph-row",
    props: {
      text: "spent",
      positionPreset: "top_left",
      groupLayout: { kind: "paragraph_panel", row: 1, rows: 4 },
    },
  });

  const patches = buildCaptionGroupPositionPatches(
    [paragraphRow],
    paragraphRow.id,
    0.12,
    0.36,
    "top_left",
  );

  assert.equal((patches[0]!.patch.props as Record<string, unknown>).absX, 0.12);
  assert.equal((patches[0]!.patch.props as Record<string, unknown>).absY, 0.36);
  assert.equal((patches[0]!.patch.props as Record<string, unknown>).groupLayout, null);
});

test("manual benchmark positioning detaches auto-pile layout and permits edge bleed", () => {
  const card = buildElement({
    id: "benchmark-card",
    props: {
      text: "AutomationBench",
      positionPreset: "top_left",
      absX: 0.09,
      absY: 0.43,
      benchmarkStackLayout: { kind: "upper_canvas_cover", index: 0, total: 17 },
    },
  });
  const patches = buildCaptionGroupPositionPatches([card], card.id, -0.18, 1.12, "top_left");
  const props = patches[0]!.patch.props as Record<string, unknown>;
  assert.ok(Math.abs((props.absX as number) - -0.18) < 1e-9);
  assert.ok(Math.abs((props.absY as number) - 1.12) < 1e-9);
  assert.equal(props.benchmarkStackLayout, null);
});


test("timing-only edits preserve a framing draft; new crop authority or selection resets it", () => {
  const still = buildElement({ type: "still", props: { media_scale: 1.35, media_offset_x: 0.03 } });
  assert.equal(preservesFramingDraft(still, { ...still, timeline_start: 63.63, updated_at: "later" }), true);
  assert.equal(preservesFramingDraft(still, { ...still, props: { ...still.props, media_offset_x: -0.35 } }), false);
  assert.equal(preservesFramingDraft(still, { ...still, id: "another" }), false);
  assert.equal(preservesFramingDraft(still, { ...still, source_url: "/replacement.jpg" }), false);
  assert.equal(preservesFramingDraft(still, null), false);
});


test("selecting a caption preserves fractional-percent positions on both axes", () => {
  const props = { text: "FLIGHT CONTROLS", absX: 0.121024763257, absY: 0.666133333333 };
  const draft = hydrateInspectorDraft(buildElement({ type: "caption_text", props }));
  assert.equal(Number(draft.editCaptionAbsX), props.absX);
  assert.equal(Number(draft.editCaptionAbsY), props.absY);
  // Editing Y must not quantize X when both axes are committed together.
  const yEdited = hydrateInspectorDraft(buildElement({ type: "caption_text", props: { ...props, absY: 66.61 / 100 } }));
  assert.equal(Number(yEdited.editCaptionAbsX), props.absX);
  assert.equal(Number(yEdited.editCaptionAbsY), 0.6661);
});
