import assert from "node:assert/strict";
import test from "node:test";

import type { CompositionElement } from "../render/composition-adapters";
import { applyProjective, readSurfaceRegion, regionQuad, surfacePictureMatrix, unitSquareToQuad } from "./surface-placement";
import type { SurfaceQuad, SurfaceTrack } from "./surface-track";

const W = 1080, H = 1920;
const close = (actual: number[], expected: number[], tolerance = 1e-6) =>
  actual.forEach((value, index) => assert.ok(Math.abs(value - expected[index]) < tolerance, `${actual} vs ${expected}`));

// A keystoned screen: narrower at the top, as when looking up at a billboard.
const screen: SurfaceQuad = [[0.3, 0.6], [0.7, 0.6], [0.8, 0.75], [0.2, 0.75]];
const track: SurfaceTrack = {
  version: 1, id: "billboard", parentId: "plate", sourceUrl: "/api/projects/p/media/sources/plate.mp4", sourceSha256: "a".repeat(64),
  width: W, height: H, referenceTime: 0, visibleFrom: 0, visibleTo: 10,
  // Dense samples: gaps over 0.15 s are never interpolated.
  samples: Array.from({ length: 101 }, (_, i) => ({ t: i / 10, quad: screen, visible: true, confidence: 1 })),
};
const plate = { id: "plate", type: "video_clip", lane_key: "visual_0", timeline_start: 0, duration: 10, trim_start: 0, trim_end: 0, playback_rate: 1,
  source_url: track.sourceUrl, props: {} } as unknown as CompositionElement;
const picture = (props: Record<string, unknown>) => ({ id: "pic", type: "still", lane_key: "visual_1", timeline_start: 0, duration: 10, trim_start: 0, trim_end: 0,
  playback_rate: 1, source_url: "/x.png", props: { surface_track: track, ...props } }) as unknown as CompositionElement;

test("the unit square lands exactly on the surface corners", () => {
  const m = unitSquareToQuad(screen)!;
  [[0, 0], [1, 0], [1, 1], [0, 1]].forEach(([u, v], i) => close(applyProjective(m, u, v), screen[i]));
});

test("a region is the matching part of the surface, in perspective", () => {
  const whole = regionQuad(screen, [0, 0, 1, 1])!;
  whole.forEach((corner, i) => close(corner, screen[i]));
  const left = regionQuad(screen, [0, 0, 1 / 3, 1])!;
  close(left[0], screen[0]);
  close(left[3], screen[3]);
  // The top edge is shorter, so a third of it is a shorter step than a third of the bottom.
  assert.ok(left[1][0] - left[0][0] < left[2][0] - left[3][0]);
});

test("an invalid region falls back to the whole surface", () => {
  assert.deepEqual(readSurfaceRegion([0.5, 0, 0.4, 1]), [0, 0, 1, 1]);
  assert.deepEqual(readSurfaceRegion(undefined), [0, 0, 1, 1]);
});

test("the picture's canvas frame is drawn onto its region of the surface", () => {
  const placed = surfacePictureMatrix(picture({ surface_region: [0.05, 0.05, 0.95, 0.95] }), [plate], 30, W, H, 30)!;
  assert.equal(placed.hidden, false);
  const inset = regionQuad(screen, [0.05, 0.05, 0.95, 0.95])!;
  close(applyProjective(placed.matrix, 0, 0), [inset[0][0] * W, inset[0][1] * H], 1e-3);
  close(applyProjective(placed.matrix, W, H), [inset[2][0] * W, inset[2][1] * H], 1e-3);
});

test("the picture follows the camera its footage follows", () => {
  const camera = { id: "cam", type: "shape", lane_key: "visual_5", timeline_start: 0, duration: 10, trim_start: 0, trim_end: 0, playback_rate: 1, source_url: null,
    props: { shape_kind: "camera", media_scale: 2 } } as unknown as CompositionElement;
  const followed = { ...plate, props: { camera_id: "cam" } } as CompositionElement;
  const still = surfacePictureMatrix(picture({}), [plate], 30, W, H, 30)!;
  const zoomed = surfacePictureMatrix(picture({}), [followed, camera], 30, W, H, 30)!;
  const [x, y] = applyProjective(still.matrix, 0, 0), [zx, zy] = applyProjective(zoomed.matrix, 0, 0);
  close([zx, zy], [W / 2 + 2 * (x - W / 2), H / 2 + 2 * (y - H / 2)], 1e-3);
});

test("prepared playback's proxy footage still carries the picture", () => {
  const proxied = { ...plate, source_url: "/api/projects/p/media/.prepared/plate/preview.mp4",
    props: { preview_source_url: "/api/projects/p/media/.prepared/plate/preview.mp4" } } as unknown as CompositionElement;
  assert.equal(surfacePictureMatrix(picture({}), [proxied], 30, W, H, 30)!.hidden, false);
  const other = { ...proxied, id: "other" } as CompositionElement;
  assert.equal(surfacePictureMatrix(picture({}), [other], 30, W, H, 30)!.hidden, true);
});

test("a picture whose surface is out of view is hidden", () => {
  const gone = { ...track, visibleTo: 0.5 };
  assert.equal(surfacePictureMatrix(picture({ surface_track: gone }), [plate], 60, W, H, 30)!.hidden, true);
});
