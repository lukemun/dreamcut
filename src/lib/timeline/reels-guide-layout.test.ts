import test from "node:test";
import assert from "node:assert/strict";
import { reelsGuideLines, REELS_INTERFACE_BOTTOM } from "./reels-guide-layout";
import { composeCaptionProps, resolveCaptionAnchorLayout } from "./captions";
import { resolveSemanticVisualLayout } from "./semantic-layout";

test("guide lines scale deterministically and caption and presenter use that same bottom", () => {
  const guide = reelsGuideLines(1080, 1920);
  assert.deepEqual(guide, reelsGuideLines(1080, 1920));
  assert.equal(guide.lines.bottom, 1914 / 2622 * 1920);
  assert.equal(reelsGuideLines(540, 960).lines.bottom, guide.lines.bottom / 2);
  const anchor = resolveCaptionAnchorLayout(composeCaptionProps("test", {positionPreset:"reels_interface_bottom_center"}), {left:0,top:0,width:1,height:1});
  assert.equal(anchor.y, REELS_INTERFACE_BOTTOM);
  assert.equal(anchor.anchorY, 1);
  const presenter = resolveSemanticVisualLayout({slot:"bottom_center",size:"micro",packing:"reels_interface_caption_stack"});
  const bottom = (Number(presenter.media_offset_y)/2 + .5 + Number(presenter.media_scale)/2)*1920;
  assert.ok(Math.abs(bottom - (guide.lines.bottom - 92)) < .1);
  assert.throws(() => reelsGuideLines(0, 1920));
});
