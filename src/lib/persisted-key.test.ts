import test from "node:test";
import assert from "node:assert/strict";
import { getStoredItem, legacyStorageKeys } from "./persisted-key";

function memory(seed: Record<string, string>) {
  const values = new Map(Object.entries(seed));
  return { values, getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}

test("legacy storage keys keep the separator", () => {
  assert.deepEqual(legacyStorageKeys("dreamcut.renderer"), ["openedit.renderer", "open-edit.renderer", "opensequence.renderer"]);
  assert.deepEqual(legacyStorageKeys("dreamcut:asset-draft:p1"), ["openedit:asset-draft:p1", "open-edit:asset-draft:p1", "opensequence:asset-draft:p1"]);
  assert.deepEqual(legacyStorageKeys("timeline.other"), []);
});

test("stored values move from the OpenEdit and OpenSequence keys", () => {
  const storage = memory({ "openedit.renderer": "rust", "opensequence.appearance": "light", "open-edit:beats:p": "{}" });
  assert.equal(getStoredItem(storage, "dreamcut.renderer"), "rust");
  assert.equal(storage.values.get("dreamcut.renderer"), "rust");
  assert.equal(storage.values.has("openedit.renderer"), false, "a later removal cannot resurrect the legacy value");
  assert.equal(getStoredItem(storage, "dreamcut.appearance"), "light");
  assert.equal(getStoredItem(storage, "dreamcut:beats:p"), "{}");
  storage.values.set("dreamcut.renderer", "gpu");
  assert.equal(getStoredItem(storage, "dreamcut.renderer"), "gpu", "the current key wins once written");
  assert.equal(getStoredItem(storage, "dreamcut.missing"), null);
});
