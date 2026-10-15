import assert from "node:assert/strict";
import test from "node:test";
import { LAYOUT_PRESETS, clipAspect, layoutSlotProps } from "./layout-presets";

test("every layout's slots stay on the canvas and grids tile it without overlap", () => {
  assert.equal(LAYOUT_PRESETS.length, 15);
  for (const preset of LAYOUT_PRESETS) {
    for (const slot of preset.slots) {
      assert.ok(slot.x >= 0 && slot.y >= 0 && slot.x + slot.w <= 1 + 1e-9 && slot.y + slot.h <= 1 + 1e-9, preset.id);
    }
    if (preset.id.startsWith("pip")) continue;
    const area = preset.slots.reduce((sum, slot) => sum + slot.w * slot.h, 0);
    assert.ok(Math.abs(area - 1) < 1e-9, `${preset.id} covers the canvas once`);
  }
});

test("a full-frame clip fills the top half of a top-and-bottom split", () => {
  // Same shape as the canvas: cover the 1 x 0.5 slot by staying full width, centred a quarter up.
  assert.deepEqual(layoutSlotProps({ x: 0, y: 0, w: 1, h: .5 }, 16 / 9, 16 / 9),
    { media_scale: 1, media_offset_x: 0, media_offset_y: -.5, mask_inset: [0, 0, .5, 0] });
});

test("a portrait clip scales up to cover a landscape slot, and picture in picture shrinks the inset", () => {
  // 9:16 in 16:9 is contain-fitted to 0.316 of the width; a half-width slot needs 1.58x.
  const left = layoutSlotProps({ x: 0, y: 0, w: .5, h: 1 }, 9 / 16, 16 / 9);
  assert.equal(left.media_scale, 1.5802);
  assert.equal(left.media_offset_x, -.5);
  assert.deepEqual(left.mask_inset, [0, .5, 0, 0]);
  const inset = layoutSlotProps({ x: .66, y: .66, w: .3, h: .3 }, 16 / 9, 16 / 9);
  assert.equal(inset.media_scale, .3);
  assert.deepEqual(inset.mask_inset, [.66, .04, .04, .66]);
});

test("clip aspect comes from the prepared preview or still", () => {
  assert.equal(clipAspect({ preview_proxy_validation: { width: 1920, height: 1080 } }), 16 / 9);
  assert.equal(clipAspect({ runtime_still_preview: { width: 1080, height: 1920 } }), 9 / 16);
  assert.equal(clipAspect({}), null);
});
