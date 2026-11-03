import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { previewProxyProbeTesting, validatePreviewProxy } from "./preview-proxy-validation";

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "proxy-receipts-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  const media = path.join(root, "fixture", "media");
  fs.mkdirSync(media, { recursive: true });
  const encode = (name: string, size: string) => execFileSync("ffmpeg", ["-v", "error", "-y", "-f", "lavfi", "-i", `color=red:size=${size}:rate=30:duration=0.1`, "-c:v", "libx264", "-pix_fmt", "yuv420p", path.join(media, name)]);
  const receipts = path.join(root, "fixture", "preprocess", "preview-proxy-probes.json");
  const restore = () => {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR; else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  };
  return { media, encode, receipts, restore, url: "/api/projects/fixture/media/proxy.mp4" };
}

test("a restart reuses the saved probe of an unchanged proxy", () => {
  const f = fixture();
  try {
    f.encode("proxy.mp4", "32x32");
    previewProxyProbeTesting.resetMemory();
    const before = previewProxyProbeTesting.probes();
    const first = validatePreviewProxy(f.url, false);
    assert.equal(first.ok, true);
    assert.equal(previewProxyProbeTesting.probes(), before + 1);
    assert.ok(fs.existsSync(f.receipts));
    // Same process, both hydration paths: no second probe.
    validatePreviewProxy(f.url, false);
    previewProxyProbeTesting.resetMemory();
    const again = validatePreviewProxy(f.url, false);
    assert.equal(previewProxyProbeTesting.probes(), before + 1);
    assert.deepEqual(again, first);
  } finally { f.restore(); }
});

test("a proxy with a changed size or mtime probes again", () => {
  const f = fixture();
  try {
    f.encode("proxy.mp4", "32x32");
    previewProxyProbeTesting.resetMemory();
    const before = previewProxyProbeTesting.probes();
    assert.equal(validatePreviewProxy(f.url, false).width, 32);
    // Replaced with different bytes at the same path.
    f.encode("proxy.mp4", "48x48");
    previewProxyProbeTesting.resetMemory();
    assert.equal(validatePreviewProxy(f.url, false).width, 48);
    assert.equal(previewProxyProbeTesting.probes(), before + 2);
    // Only the mtime changes: still probed again rather than trusted.
    const file = path.join(f.media, "proxy.mp4");
    const later = new Date(Date.now() + 60_000);
    fs.utimesSync(file, later, later);
    previewProxyProbeTesting.resetMemory();
    assert.equal(validatePreviewProxy(f.url, false).width, 48);
    assert.equal(previewProxyProbeTesting.probes(), before + 3);
  } finally { f.restore(); }
});

test("a failed probe is never saved as a success", () => {
  const f = fixture();
  try {
    fs.writeFileSync(path.join(f.media, "proxy.mp4"), "not a video");
    previewProxyProbeTesting.resetMemory();
    const before = previewProxyProbeTesting.probes();
    assert.equal(validatePreviewProxy(f.url, false).ok, false);
    assert.equal(fs.existsSync(f.receipts), false);
    previewProxyProbeTesting.resetMemory();
    assert.equal(validatePreviewProxy(f.url, false).ok, false);
    assert.equal(previewProxyProbeTesting.probes(), before + 2);
    // A receipt from another probe version is ignored.
    f.encode("proxy.mp4", "32x32");
    fs.mkdirSync(path.dirname(f.receipts), { recursive: true });
    fs.writeFileSync(f.receipts, JSON.stringify({ version: "old", entries: { [createHash("sha256").update("proxy.mp4").digest("hex")]: { size: "1", mtime_ns: "1", probe: { width: 9999, height: 9999 } } } }));
    previewProxyProbeTesting.resetMemory();
    assert.equal(validatePreviewProxy(f.url, false).width, 32);
  } finally { f.restore(); }
});
