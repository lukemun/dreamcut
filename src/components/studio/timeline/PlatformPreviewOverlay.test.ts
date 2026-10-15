import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { getPlatformPreviewGeometry, platformPreviewLabel, PlatformPreviewOverlay, readPlatformPreviewMode } from "./PlatformPreviewOverlay";
import reelsReference from "./reels-reference-zones.json";

test("safe zones are one on/off guide and older platform choices mean on", () => {
  assert.equal(platformPreviewLabel("off"), "Guides");
  assert.equal(platformPreviewLabel("reels"), "Safe zones");
  assert.equal(readPlatformPreviewMode("tiktok"), "reels");
  assert.equal(readPlatformPreviewMode("reels"), "reels");
  assert.equal(readPlatformPreviewMode("off"), "off");
  assert.equal(readPlatformPreviewMode(null), null);
});

test("Reels retains measured bounds but renders merged placement regions", () => {
  const zones = reelsReference.regions;
  for (const zone of zones) {
    assert.ok(zone.x >= 0 && zone.y >= 0);
    assert.ok(zone.x + zone.width <= reelsReference.width);
    assert.ok(zone.y + zone.height <= reelsReference.height);
  }
  const lower = ["template", "creator", "caption", "progress", "navigation"]
    .map((id) => zones.find((zone) => zone.id === id)!);
  for (let i = 1; i < lower.length; i++) {
    assert.ok(lower[i].y > lower[i-1].y + lower[i-1].height);
  }
  const markup = renderToStaticMarkup(createElement(PlatformPreviewOverlay, {
    mode: "reels", compositionWidth: 1080, compositionHeight: 1920,
  }));
  assert.match(markup, /viewBox="0 0 1206 2622"/);
  assert.equal((markup.match(/data-platform-ui-zone=/g) ?? []).length, 2);
  assert.match(markup, /1048,1147 1206,1147 1206,2622 0,2622 0,1914 1048,1914/);
  assert.equal((markup.match(/<rect/g) ?? []).length, 2);
  assert.doesNotMatch(markup, /<text|viewport-crop/);
});

test("Reels always shows full-height side clearance independently of UI polygons", () => {
  for (const [width, height] of [[1080, 1920], [540, 960]]) {
    const geometry = getPlatformPreviewGeometry("reels", width, height)!;
    const markup = renderToStaticMarkup(createElement(PlatformPreviewOverlay, {
      mode: "reels", compositionWidth: width, compositionHeight: height,
    }));
    assert.ok(geometry.leftPct >= 5.9 && geometry.rightPct >= 5.9);
    assert.ok(markup.includes(`d="M ${geometry.leftPct} 0 V 100"`));
    assert.ok(markup.includes(`d="M ${100 - geometry.rightPct} 0 V 100"`));
    assert.match(markup, /data-platform-edge-clearance="reels"/);
    assert.match(markup, /pointer-events:none/);
  }
});

test("safe-area guides use the QC margins and action rail at either resolution", () => {
  const reels = getPlatformPreviewGeometry("reels", 1080, 1920)!;
  assert.equal(reels.topPct, 14.0625);
  assert.equal(reels.bottomPct, 35);
  assert.equal(reels.railRightPct, (193 / 1080) * 100);
  assert.equal(getPlatformPreviewGeometry("reels", 0, 1920), null);
  assert.equal(getPlatformPreviewGeometry("reels", Infinity, 1920), null);
});
