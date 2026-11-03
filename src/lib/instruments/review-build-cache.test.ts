import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  fingerprintReviewBuild,
  isReviewBuildFresh,
  reviewBuildInputFiles,
  writeReviewBuildReceipt,
} from "@/lib/instruments/review-build-cache";

test("review build fingerprint changes with editor source but ignores generated build output", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-review-cache-"));
  try {
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    const build = path.join(root, ".desktop-build", "stable-a", ".next-desktop");
    fs.mkdirSync(build, { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), "{}");
    fs.writeFileSync(path.join(root, "src", "editor.ts"), "export const value = 1;\n");
    fs.writeFileSync(path.join(build, "BUILD_ID"), "build");

    assert.deepEqual(reviewBuildInputFiles(root), ["package.json", "src/editor.ts"]);
    const first = fingerprintReviewBuild(root);
    writeReviewBuildReceipt(build, first, "2026-07-24T12:00:00.000Z");
    assert.equal(isReviewBuildFresh(build, first), true);

    fs.writeFileSync(path.join(build, "generated.js"), "ignored");
    assert.equal(fingerprintReviewBuild(root), first);

    fs.writeFileSync(path.join(root, "src", "editor.ts"), "export const value = 2;\n");
    const second = fingerprintReviewBuild(root);
    assert.notEqual(second, first);
    assert.equal(isReviewBuildFresh(build, second), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
