import assert from "node:assert/strict";
import test from "node:test";

import { PREVIEW_SPEEDS, formatPreviewSpeed, readPreviewSpeed, writePreviewSpeed } from "./preview-speed";

test("the preview speed is remembered and only offered speeds are read back", () => {
  const store = new Map<string, string>();
  (globalThis as { window?: unknown }).window = { localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => store.set(key, value) } };
  try {
    assert.equal(readPreviewSpeed(), 1);
    writePreviewSpeed(2);
    assert.equal(readPreviewSpeed(), 2);
    store.set("dreamcut:preview-speed", "7");
    assert.equal(readPreviewSpeed(), 1, "an unknown stored value falls back to normal speed");
    writePreviewSpeed(0.5);
    assert.equal(readPreviewSpeed(), 0.5, "half speed is offered for checking a moment closely");
    assert.deepEqual(PREVIEW_SPEEDS.map(formatPreviewSpeed), ["0.5×", "1×", "1.25×", "1.5×", "2×"]);
  } finally { delete (globalThis as { window?: unknown }).window; }
  assert.equal(readPreviewSpeed(), 1, "without storage it plays at normal speed");
});
