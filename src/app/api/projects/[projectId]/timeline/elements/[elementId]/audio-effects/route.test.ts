import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import type { TimelineElement } from "@/components/studio/timeline/types";
import { mediaUrl } from "@/lib/local-store/media";
import { createProject, newRowTimestamps, readTimeline, writeTimeline } from "@/lib/local-store/store";

import { POST } from "./route";
import { POST as normalizeAudio } from "../normalize/route";

test("audio effects clean, restore, detach, and reattach without overwriting the source", async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-audio-route-"));
  const previousProjectsRoot = process.env.TIMELINE_PROJECTS_DIR;
  const previousEnhancer = process.env.AUDIO_ENHANCE_EXECUTABLE;
  process.env.TIMELINE_PROJECTS_DIR = temporaryRoot;
  try {
    const projectId = "audio-effects-route";
    const elementId = "11111111-1111-4111-8111-111111111111";
    const secondElementId = "22222222-2222-4222-8222-222222222222";
    createProject(projectId, "reels", "Audio effects route");
    const mediaDir = path.join(temporaryRoot, projectId, "media");
    const sourcePath = path.join(mediaDir, "fixture.mp4");
    execFileSync("ffmpeg", [
      "-y", "-v", "error",
      "-f", "lavfi", "-i", "color=c=black:s=160x284:r=30:d=1",
      "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=1",
      "-c:v", "libx264", "-c:a", "aac", "-shortest",
      sourcePath,
    ]);
    const fakeEnhancer = path.join(temporaryRoot, "fake-deep-filter.sh");
    fs.writeFileSync(fakeEnhancer, [
      "#!/bin/sh",
      "out=''",
      "input=''",
      "while [ \"$#\" -gt 0 ]; do",
      "  if [ \"$1\" = '--output-dir' ]; then out=\"$2\"; shift 2; else input=\"$1\"; shift; fi",
      "done",
      "cp \"$input\" \"$out/original_DeepFilterNet3.wav\"",
      "",
    ].join("\n"));
    fs.chmodSync(fakeEnhancer, 0o755);
    process.env.AUDIO_ENHANCE_EXECUTABLE = fakeEnhancer;
    const sourceUrl = mediaUrl(projectId, "fixture.mp4");
    const video: TimelineElement = {
      id: elementId,
      project_id: projectId,
      type: "video_clip",
      source_url: sourceUrl,
      props: {
        source_duration_seconds: 1,
        rough_cut_source_id: elementId,
        preview_audio_source_url: sourceUrl,
        render_authority_source_url: sourceUrl,
        volume_envelope: [
          { time_seconds: 0, volume: 1 },
          { time_seconds: 1, volume: 0.8 },
        ],
      },
      beat_id: null,
      character_id: null,
      timeline_start: 0,
      duration: 1,
      lane_key: "visual_0",
      lane_index: 0,
      trim_start: 0,
      trim_end: 0,
      volume: 1,
      fade_in: 0,
      fade_out: 0,
      playback_rate: 1,
      position_locked: false,
      removed_at: null,
      removed_reason: null,
      ...newRowTimestamps(),
    };
    const secondVideo: TimelineElement = {
      ...video,
      id: secondElementId,
      timeline_start: 1,
      props: { ...(video.props ?? {}), source_segment_index: 1 },
      ...newRowTimestamps(),
    };
    writeTimeline(projectId, { elements: [video, secondVideo], transitions: [] }, "fixture");

    const call = async (action: string, strength?: number) => {
      const response = await POST(
        new Request("http://localhost/audio-effects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...(strength == null ? {} : { strength }) }),
        }),
        { params: Promise.resolve({ projectId: projectId, elementId }) },
      );
      assert.equal(response.status, 200, await response.text());
      return readTimeline(projectId);
    };

    let timeline = await call("enhance_voice", 40);
    let currentVideo = timeline.elements.find((element) => element.id === elementId)!;
    assert.notEqual(currentVideo.source_url, sourceUrl);
    assert.equal(currentVideo.volume, 1);
    assert.equal(currentVideo.props?.voice_enhancement?.enabled, true);
    assert.equal(currentVideo.props?.voice_enhancement?.strength_percent, 40);
    assert.equal(currentVideo.props?.voice_enhancement?.attenuation_limit_db, 12);
    assert.notEqual(currentVideo.props?.preview_audio_source_url, currentVideo.source_url);
    assert.equal(
      currentVideo.props?.voice_enhancement?.processed_preview_audio_source_url,
      currentVideo.props?.preview_audio_source_url,
    );
    assert.match(String(currentVideo.props?.preview_audio_source_url), /\.preview-audio\.m4a$/);
    const enhancedSource = currentVideo.source_url;
    let secondCurrentVideo = timeline.elements.find((element) => element.id === secondElementId)!;
    assert.equal(secondCurrentVideo.source_url, enhancedSource);
    assert.equal(secondCurrentVideo.props?.preview_audio_source_url, currentVideo.props?.preview_audio_source_url);
    assert.equal(secondCurrentVideo.props?.voice_enhancement?.strength_percent, 40);

    timeline = await call("toggle_voice_enhancement");
    currentVideo = timeline.elements.find((element) => element.id === elementId)!;
    secondCurrentVideo = timeline.elements.find((element) => element.id === secondElementId)!;
    assert.equal(currentVideo.source_url, sourceUrl);
    assert.equal(secondCurrentVideo.source_url, sourceUrl);
    assert.equal(currentVideo.props?.voice_enhancement?.enabled, false);
    assert.equal(secondCurrentVideo.props?.voice_enhancement?.enabled, false);

    timeline = await call("toggle_voice_enhancement");
    currentVideo = timeline.elements.find((element) => element.id === elementId)!;
    assert.equal(currentVideo.source_url, enhancedSource);
    assert.equal(currentVideo.props?.voice_enhancement?.enabled, true);
    assert.equal(
      currentVideo.props?.preview_audio_source_url,
      currentVideo.props?.voice_enhancement?.processed_preview_audio_source_url,
    );

    timeline = await call("restore_original");
    currentVideo = timeline.elements.find((element) => element.id === elementId)!;
    secondCurrentVideo = timeline.elements.find((element) => element.id === secondElementId)!;
    assert.equal(currentVideo.source_url, sourceUrl);
    assert.equal(secondCurrentVideo.source_url, sourceUrl);
    assert.equal(currentVideo.props?.voice_enhancement, undefined);
    assert.equal(secondCurrentVideo.props?.voice_enhancement, undefined);

    timeline = await call("reduce_background_noise");
    currentVideo = timeline.elements.find((element) => element.id === elementId)!;
    assert.notEqual(currentVideo.source_url, sourceUrl);
    assert.equal(currentVideo.props?.audio_cleanup_original_source_url, sourceUrl);
    assert.equal(fs.existsSync(sourcePath), true);

    const normalizedResponse = await normalizeAudio(
      new Request("http://localhost/normalize", { method: "POST" }),
      { params: Promise.resolve({ projectId: projectId, elementId }) },
    );
    assert.equal(normalizedResponse.status, 200, await normalizedResponse.text());
    timeline = readTimeline(projectId);
    currentVideo = timeline.elements.find((element) => element.id === elementId)!;
    assert.equal(currentVideo.volume, 1);
    assert.equal(currentVideo.props?.preview_audio_baked_gain, 1);
    assert.notEqual(currentVideo.props?.preview_audio_source_url, currentVideo.source_url);
    assert.match(String(currentVideo.props?.preview_audio_source_url), /\.preview-audio\.m4a$/);
    assert.equal(currentVideo.props?.render_authority_source_url, currentVideo.source_url);
    assert.equal(currentVideo.props?.loudness_normalization?.target_true_peak_dbtp, -1.5);

    timeline = await call("restore_original");
    currentVideo = timeline.elements.find((element) => element.id === elementId)!;
    assert.equal(currentVideo.source_url, sourceUrl);
    assert.equal(currentVideo.props?.audio_cleanup_original_source_url, undefined);

    timeline = await call("detach_audio");
    currentVideo = timeline.elements.find((element) => element.id === elementId)!;
    const detachedId = currentVideo.props?.detached_audio_element_id;
    const detached = timeline.elements.find((element) => element.id === detachedId);
    assert.equal(currentVideo.volume, 0);
    assert.deepEqual(currentVideo.props?.volume_envelope, [
      { time_seconds: 0, volume: 0 },
      { time_seconds: 1, volume: 0 },
    ]);
    assert.equal(detached?.type, "vo_segment");
    assert.equal(detached?.lane_key, "audio_narrator");
    assert.equal(detached?.timeline_start, currentVideo.timeline_start);
    assert.equal(detached?.duration, currentVideo.duration);
    assert.deepEqual(detached?.props?.volume_envelope, [
      { time_seconds: 0, volume: 1 },
      { time_seconds: 1, volume: 0.8 },
    ]);

    timeline = await call("reattach_audio");
    currentVideo = timeline.elements.find((element) => element.id === elementId)!;
    assert.equal(currentVideo.volume, 1);
    assert.deepEqual(currentVideo.props?.volume_envelope, [
      { time_seconds: 0, volume: 1 },
      { time_seconds: 1, volume: 0.8 },
    ]);
    assert.equal(currentVideo.props?.detached_audio_element_id, undefined);
    assert.equal(timeline.elements.find((element) => element.id === detachedId)?.removed_reason, "reattached_to_video");
  } finally {
    if (previousProjectsRoot == null) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previousProjectsRoot;
    if (previousEnhancer == null) delete process.env.AUDIO_ENHANCE_EXECUTABLE;
    else process.env.AUDIO_ENHANCE_EXECUTABLE = previousEnhancer;
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
