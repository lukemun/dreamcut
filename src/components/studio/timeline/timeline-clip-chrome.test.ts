import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const timelineDir = path.dirname(fileURLToPath(import.meta.url));
const scene = fs.readFileSync(path.join(timelineDir, "draw-timeline-scene.ts"), "utf8");

test("visual timeline clips use one bounded icon instead of repeated type banners", () => {
  assert.ok(scene.includes("function drawVisualTypeIcon"));
  assert.ok(scene.includes("ctx.clip();"), "The icon must be clipped to its clip bounds");
  assert.ok(scene.includes("Math.min(11, clipHeight - 12, clipWidth - 8)"), "The visual type glyph should stay compact");
  assert.ok(scene.includes("drawVisualTypeIcon(ctx, element.type, x, clipY, width, clipHeight)"));
  assert.ok(scene.includes('return authored ?? beatLabel ?? ""'));
  assert.ok(!scene.includes('const holdLabel = "Still"'));
  assert.ok(!scene.includes('if (element.type === "video_clip" && width >= 56)'));
});

test("timeline uses right-click menus instead of ⋮ buttons, and the track header shows Mute and the eye", () => {
  assert.ok(!scene.includes("menuBtnRegions.push"), "clips draw no ⋮ button");
  assert.ok(!scene.includes("laneMenuBtnRegions.push"), "track headers draw no ⋮ button");
  assert.ok(!scene.includes("beatMenuBtnRegions.push"), "beats draw no ⋮ button");
  assert.ok(!scene.includes('ctx.fillText("S"'), "Solo is a right-click item, not a header letter");
  assert.ok(scene.includes("hideRegions.push") && scene.includes("LANE_ICON_PATHS.hidden"));
  const interactions = fs.readFileSync(path.join(timelineDir, "use-canvas-timeline-interactions.ts"), "utf8");
  assert.ok(interactions.includes('target: "beat", beatId: beat.id'), "right-click on a beat opens its menu");
  const menu = fs.readFileSync(path.join(timelineDir, "TimelineContextMenu.tsx"), "utf8");
  assert.ok(menu.includes('{isHidden ? "Show lane" : "Hide lane"}') && menu.includes("Play only this lane's sound"));
});
