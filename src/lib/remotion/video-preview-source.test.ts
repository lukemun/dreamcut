import assert from "node:assert/strict";
import test from "node:test";

import { resolveStillPlaybackSource, resolveVideoPlaybackSource, stillPreviewPremountSeconds } from "./video-preview-source";

test("the player prefers a lightweight preview derivative", () => {
  assert.equal(
    resolveVideoPlaybackSource(
      { props: { preview_source_url: "/preview.webm" } },
      "/render.webm",
      false,
    ),
    "/preview.webm",
  );
});

test("rendering always preserves the full-quality source", () => {
  assert.equal(
    resolveVideoPlaybackSource(
      { props: { preview_source_url: "/preview.webm" } },
      "/render.webm",
      true,
    ),
    "/render.webm",
  );
});

test("elements without a preview derivative keep their source", () => {
  assert.equal(resolveVideoPlaybackSource({}, "/source.mp4", false), "/source.mp4");
});

test("video originals and unverified or oversized proxies never reach preview", () => {
  const resolve = (props: Record<string, unknown>) => resolveVideoPlaybackSource({ type: "video_clip", props }, "/original.mov", false);
  assert.equal(resolve({}), null);
  assert.equal(resolve({ preview_source_url: "/proxy.mp4" }), null);
  const proof = { contract: "preview-proxy-v1", url: "/proxy.mp4", ok: true, width: 1280, height: 720 };
  assert.equal(resolve({ preview_source_url: "/proxy.mp4", preview_proxy_validation: proof }), "/proxy.mp4");
  assert.equal(resolve({ preview_source_url: "/changed.mp4", preview_proxy_validation: proof }), null);
  assert.equal(resolve({ preview_source_url: "/proxy.mp4", preview_proxy_validation: { ...proof, width: 1920, height: 1080 } }), null);
  assert.equal(resolve({ has_alpha: true, preview_source_url: "/proxy.mp4", preview_proxy_validation: proof }), null);
  assert.equal(resolveVideoPlaybackSource({ type: "video_clip", props: {} }, "/original.mov", true), "/original.mov");
});

test("local PNG stills use bounded preview pixels without changing render sources", () => {
  const source = "/api/projects/demo/media/sources/pose-11a.png";
  assert.equal(resolveStillPlaybackSource(source, false, 0.133), `/_next/image?url=${encodeURIComponent(source)}&w=640&q=75`);
  assert.equal(resolveStillPlaybackSource(source, true, 0.133), source);
  assert.equal(resolveStillPlaybackSource(source, false, 4), source);
  assert.equal(resolveStillPlaybackSource("https://example.com/art.png", false, 0.133), "https://example.com/art.png");
  assert.equal(resolveStillPlaybackSource("/api/projects/demo/media/sources/clip.mp4", false, 0.133), "/api/projects/demo/media/sources/clip.mp4");
});

test("rapid local PNG cuts avoid mounting seconds of overlapping decoded images", () => {
  const source = "/api/projects/demo/media/sources/pose.png";
  assert.equal(stillPreviewPremountSeconds(source, 0.133, false), 0.6);
  assert.equal(stillPreviewPremountSeconds(source, 0.133, true), 2);
  assert.equal(stillPreviewPremountSeconds(source, 4, false), 2);
});

 test("encoded contour fields preserve source pixels in live preview", () => {
 const source = "/api/projects/demo/media/field.png";
 assert.equal(resolveStillPlaybackSource(source, false, .1, { edge_aura: { model: "rg-edge-distance-v1" } }), source);
 assert.equal(resolveStillPlaybackSource(source, false, .1, { contour_model: "rg-distance-1024-v1" }), source);
 });

 test("higher resolution requires explicit measured tier evidence and never expands alpha", () => {
   const resolve = (quality: string, width: number, height: number, alpha = false) => resolveVideoPlaybackSource({ type: "video_clip", props: { has_alpha: alpha, preview_source_url: "/prepared.mp4", preview_proxy_validation: { contract: "preview-proxy-v1", url: "/prepared.mp4", ok: true, width, height, quality } } }, "/original.mov", false);
   assert.equal(resolve("hd", 1920, 1080), "/prepared.mp4");
   assert.equal(resolve("hd", 3840, 2160), null);
   assert.equal(resolve("uhd", 2160, 3840), "/prepared.mp4");
   assert.equal(resolve("uhd", 3840, 2160, true), null);
   assert.equal(resolve("unknown", 1920, 1080), null);
 });
