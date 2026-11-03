import assert from "node:assert/strict";
import test from "node:test";

import { motionScriptFailure } from "./motion-script-runner";

test("a failed motion script reports its message without a coloured stack", () => {
  const output = [
    "/repo/scripts/hyperframes-overlay.ts:449",
    "Error: At 0.2s this composition shows 2 separable objects (picture, picture).",
    "\u001b[90m    at Module._compile (node:internal/modules/cjs/loader:1723:14)\u001b[39m",
    "    at Module.load (node:internal/modules/cjs/loader:1458:32)",
    "Node.js v22.12.0",
  ].join("\n");
  assert.equal(motionScriptFailure(output), "At 0.2s this composition shows 2 separable objects (picture, picture).");
  assert.equal(motionScriptFailure("no error here"), undefined);
});
