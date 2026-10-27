import assert from "node:assert/strict";
import test from "node:test";

import type { CompositionElement } from "@/lib/render/composition-adapters";
import { buildPreviewWarmupPlan } from "./preview-warmup-plan";

function element(overrides: Partial<CompositionElement>): CompositionElement {
  const url = overrides.props?.preview_source_url ?? `${overrides.source_url ?? "/render.mp4"}.proxy.mp4`;
  return {
    id: "element",
    type: "video_clip",
    source_url: "/render.mp4",
    props: {},
    timeline_start: 0,
    duration: 10,
    lane_key: "visual_0",
    lane_index: 0,
    volume: 1,
    playback_rate: 1,
    trim_start: 0,
    trim_end: null,
    fade_in: 0,
    fade_out: 0,
    ...overrides,
    props: { ...overrides.props, preview_source_url: url, preview_proxy_validation: { contract: "preview-proxy-v1", url, ok: true, width: 360, height: 640 } },
  };
}

test("active audible video warms its exact preview picture and separate narration clock", () => {
  const plan = buildPreviewWarmupPlan([
    element({
      id: "talking-head",
      timeline_start: 75.8,
      duration: 6.2,
      source_url: "/render-authority.mp4",
      props: {
        preview_source_url: "/preview-picture.mp4",
        preview_audio_source_url: "/preview-clock.m4a",
      },
    }),
  ], 77.8);

  assert.deepEqual(
    plan.map(({ kind, sourceUrl, activeAtPlayhead }) => ({ kind, sourceUrl, activeAtPlayhead })),
    [
      { kind: "audio", sourceUrl: "/preview-clock.m4a", activeAtPlayhead: true },
      { kind: "video", sourceUrl: "/preview-picture.mp4", activeAtPlayhead: true },
    ],
  );
});

test("short stills warm the same resized source mounted by the player", () => {
  const source = "/api/projects/demo/media/sources/cutout.png";
  const plan = buildPreviewWarmupPlan([
    element({ id: "cutout", type: "still", source_url: source, duration: .4, volume: 0 }),
  ], .1);
  assert.equal(plan[0]?.sourceUrl, `/_next/image?url=${encodeURIComponent(source)}&w=640&q=75`);
});

test("active media outranks earlier lookbehind and later lookahead candidates", () => {
  const plan = buildPreviewWarmupPlan([
    element({ id: "earlier", timeline_start: 4, duration: 5, source_url: "/earlier.mp4", volume: 0 }),
    element({ id: "active", timeline_start: 9, duration: 5, source_url: "/active.mp4", volume: 0 }),
    element({ id: "later", timeline_start: 14, duration: 5, source_url: "/later.mp4", volume: 0 }),
  ], 10, { visualLimit: 1 });

  assert.equal(plan.length, 1);
  assert.equal(plan[0]?.elementId, "active");
});

test("deduplicates a shared preview clock", () => {
  const plan = buildPreviewWarmupPlan([
    element({ id: "a", props: { preview_audio_source_url: "/clock.m4a" } }),
    element({ id: "b", lane_key: "visual_1", props: { preview_audio_source_url: "/clock.m4a" } }),
  ], 2);

  assert.equal(plan.filter((candidate) => candidate.sourceUrl === "/clock.m4a").length, 1);
});

test("long-running layers do not crowd imminent word-cut clips out of warmup", () => {
  const plan = buildPreviewWarmupPlan([
    element({ id: "background", type: "still", source_url: "/background.png", duration: 100, volume: 0 }),
    element({ id: "active-picture", source_url: "/active.mp4", duration: 58, volume: 0 }),
    element({ id: "active-alpha", lane_key: "visual_alpha", source_url: "/active-alpha.webm", duration: 58, volume: 0 }),
    element({ id: "retained-word", timeline_start: 57.6, duration: 0.4, source_url: "/retained-word.mp4", volume: 0 }),
    element({ id: "incoming-word", timeline_start: 58, duration: 2.6, source_url: "/incoming-word.mp4", volume: 0 }),
    element({ id: "incoming-alpha", lane_key: "visual_alpha", timeline_start: 58, duration: 2.6, source_url: "/incoming-alpha.webm", volume: 0 }),
  ], 57);

  const warmedIds = new Set(plan.filter(({ kind }) => kind === "video").map(({ elementId }) => elementId));
  assert.equal(warmedIds.has("retained-word"), true);
  assert.equal(warmedIds.has("incoming-word"), true);
  assert.equal(warmedIds.has("incoming-alpha"), true);
});

test("reserves upcoming video cuts throughout the eight-second decode runway", () => {
  const plan = buildPreviewWarmupPlan([
    element({ id: "active-picture", duration: 60, source_url: "/active.mp4", volume: 0 }),
    element({ id: "active-alpha", lane_key: "visual_alpha", duration: 60, source_url: "/active-alpha.webm", volume: 0 }),
    element({ id: "incoming-picture", timeline_start: 17.5, duration: 4, source_url: "/incoming.mp4", volume: 0 }),
  ], 10, { visualLimit: 2 });

  assert.equal(plan.some(({ elementId }) => elementId === "incoming-picture"), true);
});

test("does not reserve a future cut outside the bounded decode runway", () => {
  const plan = buildPreviewWarmupPlan([
    element({ id: "active-picture", duration: 60, source_url: "/active.mp4", volume: 0 }),
    element({ id: "incoming-picture", timeline_start: 18.1, duration: 4, source_url: "/incoming.mp4", volume: 0 }),
  ], 10, { visualLimit: 1 });

  assert.deepEqual(plan.filter(({ kind }) => kind === "video").map(({ elementId }) => elementId), ["active-picture"]);
});
