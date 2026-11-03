import test from "node:test";
import assert from "node:assert/strict";
import CanvasKitInit from "canvaskit-wasm";
import { canvasKitBlendMode } from "./canvaskit-blend";
import { MEDIA_BLEND_MODES, mediaBlendStyle, resolveMediaBlendMode } from "../timeline/media-blend";
import { editorAgentCreateVisualSchema } from "../agent/timeline-editor-agent-apply";
import { renderContractCases } from "../render/effect-render-contract";

test("Screen is a native media choice and every nonidentity blend keeps an explicit render case", () => {
  assert.equal(resolveMediaBlendMode("screen"), "screen");
  assert.equal(resolveMediaBlendMode("unknown"), "normal");
  assert.deepEqual(mediaBlendStyle("screen"), { mixBlendMode: "screen" });
  assert.equal(editorAgentCreateVisualSchema.parse({ type: "video_clip", source_url: "/api/projects/example/media/source.mp4", source_duration_seconds: 2, source_start_seconds: 0, source_end_seconds: 2, timeline_start: 0, lane_key: "visual_0", lane_index: 0, media_blend_mode: "screen" }).media_blend_mode, "screen");
  for (const mode of MEDIA_BLEND_MODES.filter(mode => mode !== "normal")) {
    assert.ok(renderContractCases().some(entry => entry.property === "media_blend_mode" && entry.value === mode), mode);
  }
});

test("CanvasKit Screen preserves black and transparent plate regions and applies source opacity", async () => {
  const k = await CanvasKitInit(), surface = k.MakeSurface(2, 1)!;
  const draw = (rgb: [number, number, number], opacity: number) => {
    const c = surface.getCanvas(), outer = new k.Paint(), ink = new k.Paint();
    try {
      c.clear(k.Color(64, 128, 192));
      outer.setBlendMode(canvasKitBlendMode(k, "screen")); outer.setAlphaf(opacity); c.saveLayer(outer);
      ink.setColor(k.Color(...rgb)); c.drawRect(k.LTRBRect(0, 0, 1, 1), ink); c.restore(); surface.flush();
      const image = surface.makeImageSnapshot();
      try { return new Uint8Array(image.readPixels(0, 0, { width: 2, height: 1, colorType: k.ColorType.RGBA_8888, alphaType: k.AlphaType.Unpremul, colorSpace: k.ColorSpace.SRGB })!); }
      finally { image.delete(); }
    } finally { outer.delete(); ink.delete(); }
  };
  try {
    assert.deepEqual([...draw([0, 0, 0], 1)], [64, 128, 192, 255, 64, 128, 192, 255]);
    assert.deepEqual([...draw([255, 255, 255], 1).slice(0, 4)], [255, 255, 255, 255]);
    const actual = draw([128, 64, 32], .5);
    const expected = [64 + .5 * 128 * (1 - 64 / 255), 128 + .5 * 64 * (1 - 128 / 255), 192 + .5 * 32 * (1 - 192 / 255)];
    expected.forEach((value, channel) => assert.ok(Math.abs(actual[channel] - value) <= 1, `${channel}: ${actual[channel]} versus ${value}`));
    assert.deepEqual([...actual.slice(4, 8)], [64, 128, 192, 255]);
  } finally { surface.delete(); }
});
