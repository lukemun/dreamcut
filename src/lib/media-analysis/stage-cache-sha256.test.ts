import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { stableJson, stableJsonSha256 } from "./stage-cache";

/** The reference: a sorted copy built entry by entry, the native serializer, then one hash of the whole text. */
function referenceCanonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(referenceCanonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, referenceCanonicalize(item)]));
  }
  return value;
}
const reference = (value: unknown) => createHash("sha256").update(JSON.stringify(referenceCanonicalize(value))).digest("hex");

test("stableJsonSha256 is the hash of the sorted-copy text, streamed or not", () => {
  const element = (i: number) => ({ type: "caption_text", id: `e${i}`, timeline_start: i / 3, duration: 0.25,
    props: { text: i % 7 ? `word ${i} ✨ 😀 "q" \\ \n` : "\ud800 lone \udfff", z: i, A: null, _x: [1, { b: 2, a: 1 }, undefined, NaN, -0], é: "x", e: "y", E: "z", gone: undefined } });
  const cases: unknown[] = [
    null, 0, "text", true, [], {},
    { b: 1, a: 2 },
    { "10": 1, "2": 2, a: 3, "01": 4, "-1": 5, "4294967295": 6, "4294967294": 7 },
    { a: undefined, b: () => 1, c: Symbol("s"), d: [undefined, () => 1, NaN, Symbol("t")] },
    { date: new Date(0), map: new Map([[1, 2]]), boxed: new String("hi"), typed: new Uint8Array([3, 1]), empty: new Uint8Array(0) },
    JSON.parse('{"__proto__":{"x":1},"a":2}'),
    { nested: { toJSON: () => "custom", z: 1 } },
    // Long enough to cross many chunk boundaries, with multi-byte and escaped text at the edges.
    { version: "v", timeline: { elements: Array.from({ length: 6000 }, (_, i) => element(i)) }, sources: {} },
  ];
  for (const value of cases) {
    assert.equal(stableJsonSha256(value), reference(value), JSON.stringify(referenceCanonicalize(value))?.slice(0, 80));
    assert.equal(stableJsonSha256(value), createHash("sha256").update(stableJson(value)).digest("hex"));
  }
  assert.throws(() => stableJsonSha256({ big: 1n }), TypeError);
});

test("stableJsonSha256 changes with content and not with key order", () => {
  const base = { timeline: { elements: [{ id: "a", props: { x: 1, y: 2 } }] }, scope: undefined };
  const reordered = { scope: undefined, timeline: { elements: [{ props: { y: 2, x: 1 }, id: "a" }] } };
  assert.equal(stableJsonSha256(reordered), stableJsonSha256(base));
  assert.notEqual(stableJsonSha256({ ...base, timeline: { elements: [{ id: "a", props: { x: 1, y: 3 } }] } }), stableJsonSha256(base));
  assert.notEqual(stableJsonSha256({ ...base, scope: { time_ranges: [] } }), stableJsonSha256(base));
});
