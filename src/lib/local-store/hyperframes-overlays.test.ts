import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  fingerprintHyperframesSource,
  hyperframesOverlayReceiptsByMediaPath,
  listHyperframesCompositions,
  validateHyperframesOverlayReceipt,
  type HyperframesOverlayReceipt,
} from "./hyperframes-overlays";

const checksum = "a".repeat(64);

function receipt(): HyperframesOverlayReceipt {
  return {
    schema_version: 1,
    composition_id: "hook-title",
    source: {
      project_relative_directory: "hyperframes/hook-title",
      fingerprint_sha256: checksum,
    },
    output: {
      project_relative_path: "media/hyperframes/hook-title/hook-title.webm",
      sha256: checksum,
      duration_seconds: 3,
      width: 1080,
      height: 1920,
      fps: 30,
      codec: "vp9",
      pixel_format: "yuv420p",
      alpha_mode: "1",
    },
    render: {
      hyperframes_version: "0.7.109",
      rendered_at: "2026-08-14T12:00:00.000Z",
      quality: "high",
      format: "webm",
      approved: true,
    },
  };
}

test("validates the linked transparent-overlay receipt", () => {
  assert.doesNotThrow(() => validateHyperframesOverlayReceipt(receipt()));
  assert.throws(() => validateHyperframesOverlayReceipt({
    ...receipt(),
    output: { ...receipt().output, alpha_mode: "0" },
  }));
});

test("indexes only receipts whose rendered media exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-hyperframes-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    const projectRoot = path.join(root, "demo");
    const output = path.join(projectRoot, "media", "hyperframes", "hook-title", "hook-title.webm");
    const receipts = path.join(projectRoot, "preprocess", "hyperframes");
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.mkdirSync(receipts, { recursive: true });
    fs.writeFileSync(output, "fixture");
    fs.writeFileSync(path.join(receipts, "hook-title.json"), JSON.stringify(receipt()));

    const indexed = hyperframesOverlayReceiptsByMediaPath("demo");
    assert.equal(indexed.get("hyperframes/hook-title/hook-title.webm")?.composition_id, "hook-title");

    fs.unlinkSync(output);
    assert.equal(hyperframesOverlayReceiptsByMediaPath("demo").size, 0);
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reports current, changed, and missing-render composition states", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "timeline-hyperframes-state-"));
  const previous = process.env.TIMELINE_PROJECTS_DIR;
  process.env.TIMELINE_PROJECTS_DIR = root;
  try {
    const projectRoot = path.join(root, "demo");
    const source = path.join(projectRoot, "hyperframes", "hook-title");
    const output = path.join(projectRoot, "media", "hyperframes", "hook-title", "hook-title.webm");
    const receipts = path.join(projectRoot, "preprocess", "hyperframes");
    fs.mkdirSync(source, { recursive: true });
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.mkdirSync(receipts, { recursive: true });
    fs.writeFileSync(path.join(source, "index.html"), "<main>Hook</main>");
    fs.writeFileSync(output, "fixture");
    const sourceFingerprint = fingerprintHyperframesSource(source);
    fs.writeFileSync(path.join(receipts, "hook-title.json"), JSON.stringify({
      ...receipt(),
      source: { ...receipt().source, fingerprint_sha256: sourceFingerprint },
    }));

    assert.equal(listHyperframesCompositions("demo")[0]?.state, "current");

    fs.writeFileSync(path.join(source, "index.html"), "<main>Revised hook</main>");
    assert.equal(listHyperframesCompositions("demo")[0]?.state, "source_changed");

    fs.unlinkSync(output);
    assert.equal(listHyperframesCompositions("demo")[0]?.state, "render_missing");
  } finally {
    if (previous === undefined) delete process.env.TIMELINE_PROJECTS_DIR;
    else process.env.TIMELINE_PROJECTS_DIR = previous;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
