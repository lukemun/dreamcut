import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const source = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), "TimelineComposition.tsx"),
  "utf8",
);

test("alpha and ordinary footage share canvas presentation in preview and render", () => {
  assert.match(source, /if \(hasAlphaChannel\(element\)\) \{[\s\S]*?return <AlphaVideo/);
  const alpha = fs.readFileSync(new URL("../frame-runtime/alpha-video.tsx", import.meta.url), "utf8");
  assert.match(alpha, /<Video/);
  assert.match(alpha, /session.draws.set/);
  assert.match(alpha, /context.clearRect/);
  const ordinary=source.slice(source.indexOf('if (!hasChromaKeyData(element.props))'),source.indexOf('const {\n    style,',source.indexOf('if (!hasChromaKeyData(element.props))')));
  assert.match(ordinary, /return <AlphaVideo/);
  assert.doesNotMatch(ordinary, /isRendering|OffthreadVideo/);
  assert.match(source, /<CanvasVideo[\s\S]*?_experimentalInitiallyDrawCachedFrame/);
});

test("paper outline runs around the decoded scene, outside the frozen video source", () => {
  assert.match(source, /<StickerOutlineFilter props=\{element.props\} seconds=\{timeSeconds\}/);
  assert.match(source, /<Freeze frame=\{0\}>\{picture\}<\/Freeze>/);
  assert.doesNotMatch(source.slice(source.indexOf('function mediaDropShadowStyle'), source.indexOf('function chromaKeyEffects')), /stickerOutlineFilterId/);
});

test("preview video premounts with a five-second cut runway without expanding render premount", () => {
  assert.match(source, /DEFAULT_VIDEO_PREMOUNT_SECONDS = 1\.5/);
  assert.match(source, /DEFAULT_VIDEO_PREVIEW_PREMOUNT_SECONDS = 5/);
  assert.match(
    source,
    /isRendering \? DEFAULT_VIDEO_PREMOUNT_SECONDS : DEFAULT_VIDEO_PREVIEW_PREMOUNT_SECONDS/,
  );
});
