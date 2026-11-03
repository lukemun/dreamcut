import assert from "node:assert/strict";
import test from "node:test";

import { readTickerSegments } from "./ticker-segments";

test("ticker segments preserve safe per-item color and emphasis", () => {
  assert.deepEqual(readTickerSegments([
    { text: "FACT", color: "#173C67" },
    { text: "CONTROL ROOM", color: "#B4232A", fontWeight: 840 },
    { text: "", color: "#FFFFFF" },
    { text: "BAD COLOR", color: "red" },
  ]), [
    { text: "FACT", color: "#173C67", fontWeight: undefined },
    { text: "CONTROL ROOM", color: "#B4232A", fontWeight: 800 },
    { text: "BAD COLOR", color: undefined, fontWeight: undefined },
  ]);
});

test("non-array ticker segment data is ignored", () => {
  assert.deepEqual(readTickerSegments({ text: "NOPE" }), []);
});
