import assert from "node:assert/strict";
import test from "node:test";

import { createStageCacheIdentity, stableJson } from "./stage-cache";

/** The reference: a sorted copy built entry by entry, then the native serializer. */
function referenceCanonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(referenceCanonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, referenceCanonicalize(item)]));
  }
  return value;
}
const reference = (value: unknown) => JSON.stringify(referenceCanonicalize(value));

test("stableJson writes exactly what the sorted-copy reference writes", () => {
  const element = (i: number) => ({ type: "shape", id: `e${i}`, props: { shape_kind: "path", z: i, A: null, _x: [1, { b: 2, a: 1 }], é: "x", e: "y", E: "z" }, timeline_start: i });
  const cases: unknown[] = [
    undefined, null, 0, -0, NaN, Infinity, "text", true, [],
    { b: 1, a: 2 },
    { "10": 1, "2": 2, a: 3, "01": 4, "-1": 5, "4294967295": 6, "4294967294": 7 },
    { a: undefined, b: () => 1, c: Symbol("s"), d: [undefined, () => 1, NaN] },
    { date: new Date(0), map: new Map([[1, 2]]), boxed: new String("hi"), typed: new Uint8Array([3, 1]) },
    JSON.parse('{"__proto__":{"x":1},"a":2}'),
    { nested: { toJSON: () => "custom", z: 1 } },
    { elements: Array.from({ length: 50 }, (_, i) => element(i)) },
  ];
  for (const value of cases) assert.equal(stableJson(value), reference(value), JSON.stringify(reference(value))?.slice(0, 80));
  // The same key sequences again, now answered from the cached orders.
  for (const value of cases) assert.equal(stableJson(value), reference(value));
});

test("stableJson stays exact after its key-order memory is reset by many one-off key sets", () => {
  for (let batch = 0; batch < 3; batch++) {
    const record = Object.fromEntries(Array.from({ length: 30_000 }, (_, i) => [`id-${batch}-${(i * 7919) % 30_000}`, { w: i, v: batch }]));
    assert.equal(stableJson(record), reference(record));
  }
  assert.equal(stableJson({ b: 1, a: { d: 1, c: 2 } }), '{"a":{"c":2,"d":1},"b":1}');
});

test("stage cache identities keep their parameters in sorted order", () => {
  const identity = createStageCacheIdentity({ stage: "s", fingerprint: "f", tool: { name: "t", version: "1" } as never,
    parameters: { z: 1, a: { y: 2, b: 3 }, "3": 0 } });
  assert.deepEqual(Object.keys(identity.parameters), ["3", "a", "z"]);
  assert.deepEqual(Object.keys(identity.parameters.a as object), ["b", "y"]);
});
