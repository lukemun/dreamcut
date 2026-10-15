import assert from "node:assert/strict";
import test from "node:test";

import { buildAutoplace } from "@/lib/timeline/autoplace";

test("buildAutoplace inserts multiple slot visuals, audio, and music in sequence", () => {
  const result = buildAutoplace({
    projectId: "project-1",
    beats: [
      {
        id: "beat-1",
        sort_order: 0,
        captionText: null,
        durationSeconds: null,
        visuals: [
          {
            slotId: "slot-1",
            type: "still",
            sourceUrl: "https://example.com/still-1.png",
            durationSeconds: null,
          },
          {
            slotId: "slot-2",
            type: "video_clip",
            sourceUrl: "https://example.com/video-2.mp4",
            durationSeconds: 4,
          },
        ],
      },
      {
        id: "beat-2",
        sort_order: 1,
        captionText: null,
        durationSeconds: null,
        visuals: [],
      },
    ],
    selectedVoiceClips: [
      {
        id: "clip-1",
        beat_id: "beat-1",
        character_id: null,
        duration: 1.25,
        sourceUrl: "https://example.com/voice-1.mp3",
      },
      {
        id: "clip-2",
        beat_id: "beat-2",
        character_id: null,
        duration: 1.5,
        sourceUrl: "https://example.com/voice-2.mp3",
      },
    ],
    selectedMusicTrack: {
      id: "music-1",
      duration_seconds: 12,
      url: "https://example.com/music-1.mp3",
    },
    existingActiveElements: [],
    removedElements: [],
  });

  const visuals = result.inserts.filter((insert) => insert.type === "still" || insert.type === "video_clip");
  const audio = result.inserts.filter((insert) => insert.type === "vo_segment");
  const music = result.inserts.filter((insert) => insert.type === "music");

  assert.equal(visuals.length, 2);
  assert.equal(visuals[0]?.timeline_start, 0);
  assert.equal(visuals[0]?.duration, 5);
  assert.equal(visuals[1]?.timeline_start, 5);
  assert.equal(visuals[1]?.duration, 4);
  assert.equal(audio.length, 2);
  assert.equal(audio[0]?.timeline_start, 0);
  assert.equal(audio[1]?.timeline_start, 9);
  assert.equal(music.length, 1);
  assert.equal(result.warnings.length, 0);
});

test("buildAutoplace splits beat duration evenly across stills", () => {
  const result = buildAutoplace({
    projectId: "project-1",
    beats: [
      {
        id: "beat-1",
        sort_order: 0,
        captionText: null,
        durationSeconds: 6,
        visuals: [
          {
            slotId: "slot-1",
            type: "still",
            sourceUrl: "https://example.com/still-1.png",
            durationSeconds: null,
          },
          {
            slotId: "slot-2",
            type: "still",
            sourceUrl: "https://example.com/still-2.png",
            durationSeconds: null,
          },
        ],
      },
    ],
    selectedVoiceClips: [],
    selectedMusicTrack: null,
    existingActiveElements: [],
    removedElements: [],
  });

  const visuals = result.inserts.filter((insert) => insert.type === "still");
  assert.equal(visuals.length, 2);
  assert.equal(visuals[0]?.timeline_start, 0);
  assert.equal(visuals[0]?.duration, 3);
  assert.equal(visuals[1]?.timeline_start, 3);
  assert.equal(visuals[1]?.duration, 3);
});

test("buildAutoplace keeps video source duration and fits stills to beat", () => {
  const result = buildAutoplace({
    projectId: "project-1",
    beats: [
      {
        id: "beat-1",
        sort_order: 0,
        captionText: null,
        durationSeconds: 6,
        visuals: [
          {
            slotId: "slot-video",
            type: "video_clip",
            sourceUrl: "https://example.com/video-1.mp4",
            durationSeconds: 4,
          },
          {
            slotId: "slot-still-a",
            type: "still",
            sourceUrl: "https://example.com/still-a.png",
            durationSeconds: null,
          },
          {
            slotId: "slot-still-b",
            type: "still",
            sourceUrl: "https://example.com/still-b.png",
            durationSeconds: null,
          },
        ],
      },
    ],
    selectedVoiceClips: [],
    selectedMusicTrack: null,
    existingActiveElements: [],
    removedElements: [],
  });

  const visuals = result.inserts.filter((insert) => insert.type === "still" || insert.type === "video_clip");
  assert.equal(visuals.length, 3);
  assert.equal(visuals[0]?.type, "video_clip");
  assert.equal(visuals[0]?.timeline_start, 0);
  assert.equal(visuals[0]?.duration, 4);
  assert.equal(visuals[1]?.type, "still");
  assert.equal(visuals[1]?.timeline_start, 4);
  assert.equal(visuals[1]?.duration, 3);
  assert.equal(visuals[2]?.type, "still");
  assert.equal(visuals[2]?.timeline_start, 7);
  assert.equal(visuals[2]?.duration, 3);
});

test("buildAutoplace includes still video render props when present", () => {
  const result = buildAutoplace({
    projectId: "project-1",
    beats: [
      {
        id: "beat-1",
        sort_order: 0,
        captionText: null,
        durationSeconds: 4,
        visuals: [
          {
            slotId: "slot-still",
            type: "still",
            sourceUrl: "https://example.com/still-1.png",
            stillVideoUrl: "https://example.com/still-1.mp4",
            stillVideoDurationSeconds: 1,
            durationSeconds: null,
          },
        ],
      },
    ],
    selectedVoiceClips: [],
    selectedMusicTrack: null,
    existingActiveElements: [],
    removedElements: [],
  });

  const visual = result.inserts.find((insert) => insert.type === "still");
  assert.ok(visual);
  assert.deepEqual(visual?.props, {
    intent_key: "visual:slot-still",
    autoplaced: true,
    autoplaced_at: visual?.props.autoplaced_at,
    slot_id: "slot-still",
    render_asset_type: "still_video",
    source_still_video_url: "https://example.com/still-1.mp4",
    source_still_video_duration_seconds: 1,
  });
});

test("buildAutoplace respects slot intent keys and tombstones", () => {
  const result = buildAutoplace({
    projectId: "project-1",
    beats: [
      {
        id: "beat-1",
        sort_order: 0,
        captionText: null,
        durationSeconds: null,
        visuals: [
          {
            slotId: "slot-1",
            type: "still",
            sourceUrl: "https://example.com/still-1.png",
            durationSeconds: null,
          },
          {
            slotId: "slot-2",
            type: "still",
            sourceUrl: "https://example.com/still-2.png",
            durationSeconds: null,
          },
        ],
      },
    ],
    selectedVoiceClips: [],
    selectedMusicTrack: null,
    existingActiveElements: [
      {
        id: "existing-1",
        type: "still",
        beat_id: "beat-1",
        voice_clip_id: null,
        timeline_start: 0,
        duration: 5,
        lane_key: "visual_0",
        lane_index: 0,
        props: { intent_key: "visual:slot-1", slot_id: "slot-1" },
      },
    ],
    removedElements: [
      {
        id: "removed-1",
        type: "still",
        beat_id: "beat-1",
        voice_clip_id: null,
        timeline_start: 5,
        duration: 5,
        lane_key: "visual_0",
        lane_index: 0,
        props: { intent_key: "visual:slot-2", slot_id: "slot-2" },
        removed_at: "2026-03-15T00:00:00.000Z",
        removed_reason: "user",
      },
    ],
  });

  assert.equal(result.inserts.length, 0);
});

test("buildAutoplace narrows legacy beat intent compatibility to single-slot beats", () => {
  const result = buildAutoplace({
    projectId: "project-1",
    beats: [
      {
        id: "beat-single",
        sort_order: 0,
        captionText: null,
        durationSeconds: null,
        visuals: [
          {
            slotId: "slot-single",
            type: "still",
            sourceUrl: "https://example.com/still-single.png",
            durationSeconds: null,
          },
        ],
      },
      {
        id: "beat-multi",
        sort_order: 1,
        captionText: null,
        durationSeconds: null,
        visuals: [
          {
            slotId: "slot-a",
            type: "still",
            sourceUrl: "https://example.com/still-a.png",
            durationSeconds: null,
          },
          {
            slotId: "slot-b",
            type: "still",
            sourceUrl: "https://example.com/still-b.png",
            durationSeconds: null,
          },
        ],
      },
    ],
    selectedVoiceClips: [],
    selectedMusicTrack: null,
    existingActiveElements: [
      {
        id: "existing-legacy",
        type: "still",
        beat_id: "beat-single",
        voice_clip_id: null,
        timeline_start: 0,
        duration: 4,
        lane_key: "visual_0",
        lane_index: 0,
        props: { intent_key: "visual:beat-single" },
      },
      {
        id: "existing-legacy-multi",
        type: "still",
        beat_id: "beat-multi",
        voice_clip_id: null,
        timeline_start: 4,
        duration: 4,
        lane_key: "visual_0",
        lane_index: 0,
        props: { intent_key: "visual:beat-multi" },
      },
    ],
    removedElements: [],
  });

  const visuals = result.inserts.filter((insert) => insert.type === "still");
  assert.equal(visuals.length, 2);
  assert.deepEqual(
    visuals.map((visual) => visual.props.intent_key),
    ["visual:slot-a", "visual:slot-b"],
  );
});

test("buildAutoplace creates secondary visual lane when primary overlaps", () => {
  const result = buildAutoplace({
    projectId: "project-1",
    beats: [
      {
        id: "beat-1",
        sort_order: 0,
        captionText: null,
        durationSeconds: null,
        visuals: [
          {
            slotId: "slot-1",
            type: "still",
            sourceUrl: "https://example.com/still-1.png",
            durationSeconds: null,
          },
        ],
      },
    ],
    selectedVoiceClips: [],
    selectedMusicTrack: null,
    existingActiveElements: [
      {
        id: "existing-1",
        type: "still",
        beat_id: "beat-x",
        voice_clip_id: null,
        timeline_start: 0,
        duration: 10,
        lane_key: "visual_0",
        lane_index: 0,
        props: {},
      },
    ],
    removedElements: [],
  });

  const visualInsert = result.inserts.find((insert) => insert.type === "still");
  assert.ok(visualInsert);
  assert.equal(visualInsert?.lane_key, "visual_1");
  assert.equal(result.warnings.length, 1);
});

test("buildAutoplace inserts caption elements onto the captions lane", () => {
  const result = buildAutoplace({
    projectId: "project-1",
    beats: [
      {
        id: "beat-1",
        sort_order: 0,
        captionText: "The house remembered her.",
        durationSeconds: 3,
        visuals: [
          {
            slotId: "slot-1",
            type: "still",
            sourceUrl: "https://example.com/still-1.png",
            durationSeconds: null,
          },
        ],
      },
    ],
    selectedVoiceClips: [],
    selectedMusicTrack: null,
    existingActiveElements: [],
    removedElements: [],
  });

  const caption = result.inserts.find((insert) => insert.type === "caption_text");
  assert.ok(caption);
  assert.equal(caption?.lane_key, "captions_0");
  assert.equal(caption?.source_url, null);
  assert.equal(caption?.props.text, "The house remembered her.");
  assert.equal(caption?.props.animationIn, "none");
});
