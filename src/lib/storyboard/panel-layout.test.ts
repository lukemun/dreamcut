import assert from "node:assert/strict";
import test from "node:test";
import { dropPanel, hidePanel, isShown, layoutIds, normalizeLayout, nudgePanel, panelHeight, resizeColumns, resizePanel, resizeRow, showPanel, type PanelLayout } from "./panel-layout";

const base: PanelLayout = { rows: [{ height: 300, panels: [{ id: "media", width: 1 }] }, { height: 500, panels: [{ id: "script", width: 0.5 }, { id: "reference", width: 0.5 }] }] };
const widths = (layout: PanelLayout) => layout.rows.map(row => row.panels.map(p => `${p.id}:${p.width.toFixed(2)}`).join(" "));

test("saved layouts drop unknown, repeated and empty entries and renormalize widths", () => {
  const saved = { rows: [{ height: 50, panels: [{ id: "media", width: 2 }, { id: "gone", width: 1 }, { id: "media", width: 1 }] }, { height: 400, panels: [] }, { height: 9000, panels: [{ id: "script", width: 0 }] }] };
  const layout = normalizeLayout(saved, ["media", "script"])!;
  assert.deepEqual(widths(layout), ["media:1.00", "script:1.00"]);
  assert.deepEqual(layout.rows.map(r => r.height), [200, 1600]);
  assert.equal(normalizeLayout("nonsense", ["media"]), null);
});

test("showing and hiding toggles a panel's own row without disturbing the others", () => {
  const shown = showPanel(base, "story", 420);
  assert.deepEqual(layoutIds(shown), ["media", "script", "reference", "story"]);
  assert.equal(showPanel(shown, "story", 420), shown);
  const hidden = hidePanel(shown, "reference");
  assert.deepEqual(widths(hidden), ["media:1.00", "script:1.00", "story:1.00"]);
  assert.equal(isShown(hidden, "reference"), false);
  assert.deepEqual(widths(base), ["media:1.00", "script:0.50 reference:0.50"]);
});

test("dropping beside a panel shares its width; dropping above or below makes a new row", () => {
  const beside = dropPanel(base, "media", "script", "left");
  assert.deepEqual(widths(beside), ["media:0.25 script:0.25 reference:0.50"]);
  const below = dropPanel(base, "reference", "media", "bottom");
  assert.deepEqual(widths(below), ["media:1.00", "reference:1.00", "script:1.00"]);
  assert.equal(dropPanel(base, "media", "media", "left"), base);
});

test("keyboard moves swap within a row, lift a panel out, or swap rows", () => {
  assert.deepEqual(widths(nudgePanel(base, "reference", "left")), ["media:1.00", "reference:0.50 script:0.50"]);
  assert.deepEqual(widths(nudgePanel(base, "reference", "up")), ["media:1.00", "reference:1.00", "script:1.00"]);
  assert.deepEqual(widths(nudgePanel(base, "media", "down")), ["script:0.50 reference:0.50", "media:1.00"]);
  assert.equal(nudgePanel(base, "media", "up"), base);
});

test("column edges trade width between neighbours within bounds; rows clamp height", () => {
  assert.deepEqual(widths(resizeColumns(base, 1, 0, 0.7, 0.2)), ["media:1.00", "script:0.70 reference:0.30"]);
  assert.deepEqual(widths(resizeColumns(base, 1, 0, 0.95, 0.2)), ["media:1.00", "script:0.80 reference:0.20"]);
  assert.equal(resizeRow(base, 0, 10).rows[0].height, 200);
});

test("each panel keeps its own height through resizing and moves", () => {
  const tall = resizePanel(base, "script", 900);
  assert.equal(panelHeight(tall.rows[1], tall.rows[1].panels[0]), 900);
  assert.equal(panelHeight(tall.rows[1], tall.rows[1].panels[1]), 500);
  const moved = dropPanel(tall, "script", "media", "bottom");
  assert.equal(moved.rows[1].panels[0].height, 900);
  assert.equal(resizePanel(tall, "script", null).rows[1].panels[0].height, undefined);
  assert.equal(normalizeLayout(tall, ["media", "script", "reference"])!.rows[1].panels[0].height, 900);
});
