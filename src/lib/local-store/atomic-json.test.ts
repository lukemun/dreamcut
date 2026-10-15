import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { readJsonFile, writeJsonFileAtomic } from "./atomic-json";

test("atomic JSON writer replaces valid data and leaves no temporary files", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "atomic-json-"));
  const filePath = path.join(directory, "state.json");
  try {
    writeJsonFileAtomic(filePath, { version: 1 });
    writeJsonFileAtomic(filePath, { version: 2 });
    assert.deepEqual(readJsonFile(filePath, null), { version: 2 });
    assert.deepEqual(fs.readdirSync(directory), ["state.json"]);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("atomic JSON writer validates before changing disk", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "atomic-json-"));
  const filePath = path.join(directory, "state.json");
  try {
    writeJsonFileAtomic(filePath, { valid: true });
    assert.throws(() => writeJsonFileAtomic(filePath, { valid: false }, (value) => {
      if (!(value as { valid?: boolean }).valid) throw new Error("invalid");
    }), /invalid/);
    assert.deepEqual(readJsonFile(filePath, null), { valid: true });
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
