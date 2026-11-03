import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  isRenderBundleFresh,
  readRenderBundleReceipt,
  renderBundleCacheDir,
  renderBundleFingerprint,
  writeRenderBundleReceipt,
} from "./render-bundle-cache";

test("render bundle freshness requires matching receipt and bundled index", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "render-bundle-cache-"));
  try {
    const bundleDir = renderBundleCacheDir(root, "abc");
    fs.mkdirSync(bundleDir, { recursive: true });
    assert.equal(isRenderBundleFresh(bundleDir, "abc"), false);

    fs.writeFileSync(path.join(bundleDir, "index.html"), "bundle");
    writeRenderBundleReceipt(bundleDir, "abc", "2026-07-24T00:00:00.000Z");
    assert.equal(isRenderBundleFresh(bundleDir, "abc"), true);
    assert.equal(isRenderBundleFresh(bundleDir, "def"), false);
    assert.equal(readRenderBundleReceipt(bundleDir)?.built_at, "2026-07-24T00:00:00.000Z");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("render bundle fingerprint changes when composition source changes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "render-bundle-fingerprint-"));
  try {
    fs.mkdirSync(path.join(root, "src"), { recursive: true });
    fs.writeFileSync(path.join(root, "package.json"), "{}\n");
    const source = path.join(root, "src", "composition.ts");
    fs.writeFileSync(source, "export const version = 1;\n");
    const before = renderBundleFingerprint(root);
    fs.writeFileSync(source, "export const version = 2;\n");
    assert.notEqual(renderBundleFingerprint(root), before);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
