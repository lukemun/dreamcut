import assert from "node:assert/strict";
import test from "node:test";

import { firstMultiObjectFrame, separableObjects, type ContentLeaf } from "./composition-objects";

const word = (text: string, left: number, top: number, size = 100): ContentLeaf =>
  ({ kind: "text", text, left, top, right: left + text.length * size * 0.55, bottom: top + size * 1.2, font_size: size });
const picture = (left: number, top: number, side: number): ContentLeaf =>
  ({ kind: "picture", left, top, right: left + side, bottom: top + side });

test("words on one line and wrapped lines of one paragraph are one object", () => {
  const leaves = [word("Your", 100, 300), word("agent", 360, 300), word("edits.", 680, 300), word("You", 100, 430), word("approve.", 330, 430)];
  assert.deepEqual(separableObjects(leaves), [{ kind: "text", label: '"Your agent edits. You approve."' }]);
});

test("scramble glyphs stacked in one word stay one object", () => {
  const leaves = [word("D", 500, 400, 210), word("X", 500, 400, 210), word("R", 640, 400, 210), word("7", 640, 400, 210)];
  assert.equal(separableObjects(leaves).length, 1);
});

test("a logo with the ring drawn around it is one picture", () => {
  assert.equal(separableObjects([picture(750, 330, 420), picture(720, 300, 480)]).length, 1);
});

test("a logo beside its name is two objects", () => {
  const objects = separableObjects([picture(400, 390, 300), word("DreamCut", 760, 450, 168)]);
  assert.deepEqual(objects.map((object) => object.kind).sort(), ["picture", "text"]);
});

test("a headline and a smaller subline are two objects", () => {
  const objects = separableObjects([word("DREAMCUT", 500, 400, 210), word("VIDEO EDITING, DIRECTED", 600, 650, 34)]);
  assert.equal(objects.length, 2);
});

test("text far apart on the canvas is two objects even at the same size", () => {
  assert.equal(separableObjects([word("Left", 100, 100), word("Right", 1500, 900)]).length, 2);
});

test("the first frame with more than one object is reported", () => {
  const frame = firstMultiObjectFrame([
    { at_seconds: 0, leaves: [picture(750, 330, 420)] },
    { at_seconds: 1.4, leaves: [picture(400, 390, 300), word("DreamCut", 760, 450, 168)] },
  ]);
  assert.equal(frame?.at_seconds, 1.4);
  assert.equal(frame?.objects.length, 2);
  assert.equal(firstMultiObjectFrame([{ at_seconds: 0, leaves: [] }]), null);
});

test("one drawing whose strokes draw on apart and join into one silhouette is one object", () => {
  // At 0.2 s the back leg and the torso are drawn apart; by 1 s the figure is one region around both.
  const drawOn = [
    { at_seconds: 0.2, leaves: [picture(500, 900, 60), picture(520, 600, 80)] },
    { at_seconds: 1, leaves: [{ kind: "picture", left: 480, top: 560, right: 640, bottom: 1000 } as ContentLeaf] },
  ];
  assert.equal(firstMultiObjectFrame(drawOn), null);
  // Two pictures that stay apart are still two objects, whatever comes before.
  const apart = [{ at_seconds: 0, leaves: [picture(100, 100, 80), picture(1400, 900, 80)] }, { at_seconds: 1, leaves: [picture(100, 100, 80), picture(1400, 900, 80)] }];
  assert.equal(firstMultiObjectFrame(apart)?.at_seconds, 0);
  // Text never counts as part of a later drawing.
  assert.equal(firstMultiObjectFrame([{ at_seconds: 0, leaves: [picture(500, 600, 60), word("Hi", 520, 700, 40)] }, { at_seconds: 1, leaves: [picture(400, 500, 400)] }])?.at_seconds, 0);
});
