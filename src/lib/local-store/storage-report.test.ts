import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { buildStorageReport } from "./storage-report";

function write(file: string, content: string | Buffer) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

test("classifies media by the records that name it and changes nothing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "storage-report-"));
  try {
    const a = path.join(root, "alpha"), b = path.join(root, "beta");
    const hash = "a".repeat(64), gen = `.prepared/editor-media-v1/${hash}`;
    write(path.join(a, "timeline.json"), JSON.stringify({ elements: [{ source_url: "/api/projects/alpha/media/cutouts/placed%20one.webm" }] }));
    write(path.join(a, "source-manifest.json"), JSON.stringify({ assets: [{ media_path: "sources/take.mov" }] }));
    write(path.join(a, "media/sources/take.mov"), "source");
    const source = fs.statSync(path.join(a, "media/sources/take.mov"));
    write(path.join(a, "preprocess/media-preparation/p.json"), JSON.stringify({ source: "sources/take.mov", size: source.size, mtime: source.mtimeMs, state: "ready", source_hash: hash,
      preview: `${gen}/new/preview.mp4`, render: `${gen}/old/render.mov`, audio: `${gen}/old/audio.m4a` }));
    for (const file of ["new/preview.mp4", "old/render.mov", "old/audio.m4a", "old/preview.mp4", "older/preview.mp4"]) write(path.join(a, "media", gen, file), "x");
    write(path.join(a, "media/cutouts/placed one.webm"), "x");
    write(path.join(a, "media/cutouts/indexed.webm"), "x");
    write(path.join(a, "instruments/media-index/assets.json"), JSON.stringify({ assets: [{ path: "cutouts/indexed.webm" }] }));
    write(path.join(a, "media/cutouts/forgotten.webm"), "x");
    write(path.join(a, "media/cache/looks-disposable.mp4"), "x");
    fs.symlinkSync(path.join(a, "media/sources/take.mov"), path.join(a, "media/link.mov"));
    // Another project's history still names one superseded preview.
    write(path.join(b, "timeline.json"), "{}");
    write(path.join(b, "history/1.json"), JSON.stringify({ props: { preview_source_url: `/api/projects/alpha/media/${gen}/old/preview.mp4` } }));
    const before = fs.readdirSync(root, { recursive: true }).length;

    const report = buildStorageReport(root, ["alpha"]);
    const byPath = new Map(report.projects[0].files.map(f => [f.path, f]));
    const at = (p: string) => [byPath.get(p)?.bucket, byPath.get(p)?.reason];
    assert.deepEqual(at("sources/take.mov"), ["referenced", "original"]);
    assert.deepEqual(at("cutouts/placed one.webm"), ["referenced", "edit"]);
    assert.deepEqual(at(`${gen}/old/render.mov`), ["referenced", "render-authority"]);
    assert.deepEqual(at(`${gen}/new/preview.mp4`), ["rebuildable", "current-package"]);
    assert.deepEqual(at(`${gen}/old/audio.m4a`), ["rebuildable", "current-package"]);
    assert.deepEqual(at(`${gen}/old/preview.mp4`), ["referenced", "edit"], "a cross-project history reference counts");
    assert.deepEqual(at("cutouts/indexed.webm"), ["referenced", "evidence-only"]);
    assert.deepEqual(at("cutouts/forgotten.webm"), ["orphaned", "unnamed"]);
    assert.equal(byPath.get("cutouts/forgotten.webm")?.regenerable, undefined);
    assert.deepEqual(at(`${gen}/older/preview.mp4`), ["orphaned", "unnamed"]);
    assert.equal(byPath.get(`${gen}/older/preview.mp4`)?.regenerable, true);
    assert.deepEqual(at("cache/looks-disposable.mp4"), ["orphaned", "unnamed"], "a cache-like name earns no rebuildable class");
    assert.equal(byPath.get("cache/looks-disposable.mp4")?.regenerable, undefined);
    assert.deepEqual(report.projects[0].symlinks, ["link.mov"]);
    assert.equal(fs.readdirSync(root, { recursive: true }).length, before, "nothing written or removed");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
