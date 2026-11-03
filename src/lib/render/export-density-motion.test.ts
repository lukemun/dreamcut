import assert from "node:assert/strict";
import test from "node:test";

import { motionRenderPath, withDensityMotionGraphics } from "./export-density-motion";

const url = (file: string) => `/api/projects/demo/media/hyperframes/intro/${file}`;
const clip = (source_url: string, props: Record<string, unknown> = {}) => ({ type: "video_clip", source_url, props });

test("only motion-graphic renders of this project are re-rendered for a sharper export", () => {
  assert.deepEqual(motionRenderPath("demo", url("intro.0123456789abcdef.webm")), { compositionId: "intro", renderPath: "media/hyperframes/intro/intro.0123456789abcdef.webm" });
  assert.equal(motionRenderPath("demo", "/api/projects/demo/media/sources/street.mp4"), null);
  assert.equal(motionRenderPath("demo", "/api/projects/other/media/hyperframes/intro/intro.0123456789abcdef.webm"), null);
  assert.equal(motionRenderPath("demo", url("intro.0123456789abcdef@2x.webm")), null, "a density render is never re-rendered again");
  assert.equal(motionRenderPath("demo", "/api/projects/demo/media/hyperframes/../sources/x.webm"), null);
});

test("a 2K/4K export swaps each motion graphic for its density render, once per render, keeping its crop in step", async () => {
  const calls: string[] = [];
  const track = { canvas: { width: 2160, height: 3840 }, size: { width: 800, height: 600 }, keys: [{ t: 0, x: 10, y: 20 }] };
  const render = async (_project: string, compositionId: string, renderPath: string) => {
    calls.push(renderPath);
    return { media_path: renderPath.replace(/\.webm$/, "@2x.webm"), width: 800, height: 600, canvas_track: compositionId === "intro" ? track : null };
  };
  const footage = clip("/api/projects/demo/media/sources/street.mp4");
  const graphic = clip(url("intro.0123456789abcdef.webm"), { source_canvas_track: { old: true }, title: "Intro" });
  const { elements, kept } = await withDensityMotionGraphics("demo", [footage, graphic, { ...graphic }], 2, {}, render);
  assert.deepEqual(calls, ["media/hyperframes/intro/intro.0123456789abcdef.webm"]);
  assert.equal(elements[0], footage);
  assert.equal(elements[1].source_url, "/api/projects/demo/media/hyperframes/intro/intro.0123456789abcdef@2x.webm");
  assert.deepEqual(elements[1].props?.source_canvas_track, track);
  assert.equal(elements[1].props?.title, "Intro");
  assert.equal(elements[2].source_url, elements[1].source_url);
  assert.deepEqual(kept, []);
});

test("1080p exports keep the editor renders, and a graphic that cannot be re-rendered keeps its render and is reported", async () => {
  const graphic = clip(url("intro.0123456789abcdef.webm"));
  const unchanged = await withDensityMotionGraphics("demo", [graphic], 1, {}, async () => { throw new Error("should not render"); });
  assert.equal(unchanged.elements[0], graphic);
  const failed = await withDensityMotionGraphics("demo", [graphic], 2, {}, async () => { throw new Error("code changed"); });
  assert.equal(failed.elements[0], graphic);
  assert.deepEqual(failed.kept, ["intro: code changed"]);
});

test("stopping the export stops the motion-graphic renders instead of keeping the old ones, and progress counts each render", async () => {
  const graphic = clip(url("intro.0123456789abcdef.webm")), other = clip("/api/projects/demo/media/hyperframes/outro/outro.fedcba9876543210.webm");
  const steps: string[] = [];
  const done = await withDensityMotionGraphics("demo", [graphic, other], 2, { onStep: (d, t) => steps.push(`${d}/${t}`) },
    async (_p, _c, renderPath) => ({ media_path: renderPath, width: 1, height: 1, canvas_track: null }));
  assert.deepEqual(steps, ["0/2", "1/2", "2/2"]);
  assert.equal(done.kept.length, 0);
  const controller = new AbortController();
  await assert.rejects(withDensityMotionGraphics("demo", [graphic], 2, { signal: controller.signal },
    async () => { controller.abort(); throw new Error("Stopped"); }), /Stopped/);
});
