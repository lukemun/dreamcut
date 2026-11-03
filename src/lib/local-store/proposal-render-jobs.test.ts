import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("tracked proposal renders isolate delivery effects and preserve normal export behavior", () => {
  // Module mocks exercise the real job coordinator without launching an encoder
  // or contacting sharing services. The flag is confined to this child process.
  const result = spawnSync(process.execPath, ["--experimental-test-module-mocks", "--import", "tsx",
    "src/lib/local-store/test-support/proposal-render-jobs.mjs"], { encoding: "utf8", timeout: 30_000 });
  assert.equal(result.status, 0, result.stdout + result.stderr);
});
