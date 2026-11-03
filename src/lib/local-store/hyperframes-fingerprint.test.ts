import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { fingerprintHyperframesSource } from "./hyperframes-overlays";

test("a cached source fingerprint follows every rewrite, even one that restores size and mtime", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hf-fingerprint-"));
  const file = path.join(dir, "index.html");
  fs.writeFileSync(file, "<p>one</p>");
  const first = fingerprintHyperframesSource(dir);
  assert.equal(fingerprintHyperframesSource(dir), first);
  const { atime, mtime } = fs.statSync(file);
  await new Promise((resolve) => setTimeout(resolve, 20));
  fs.writeFileSync(file, "<p>two</p>");
  fs.utimesSync(file, atime, mtime);
  assert.notEqual(fingerprintHyperframesSource(dir), first);
});
