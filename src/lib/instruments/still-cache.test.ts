import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createStillDependencyHasher, stillCacheKey, readStillCache, writeStillCache, verifyStillCacheEnvironment, readVerifiedStillEnvironment } from "./still-cache";
import { GET } from "../../app/api/render-cache-environment/route";
import type { BrowserStillOptions } from "../render/browser-renderer";

const request: BrowserStillOptions = { baseUrl: "http://127.0.0.1:3123", output: "out.png", width: 320, height: 180,
  durationInFrames: 60, frame: 15, inputProps: { elements: [] } };
function fixture(t: import("node:test").TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "still-cache-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const dir of ["src", "public/fonts", "scripts"]) fs.mkdirSync(path.join(root, dir), { recursive: true });
  for (const file of ["src/renderer.ts", "public/fonts/test.woff2", "package.json", "pnpm-lock.yaml", "next.config.ts", "scripts/frame-state.ts"]) fs.writeFileSync(path.join(root, file), "initial");
  return root;
}

test("same frame and dependencies share a key across report directories; every render input invalidates", () => {
  const key = stillCacheKey(request, "renderer", "dependencies");
  assert.equal(stillCacheKey({ ...request, output: "another-folder/out.png" }, "renderer", "dependencies"), key);
  for (const change of [{ frame: 16 }, { width: 640 }, { fps: 60 }, { durationInFrames: 61 }, { transparent: true },
    { imageFormat: "jpeg" as const }, { jpegQuality: 50 }, { inputProps: { elements: [{ id: "changed" }] } }, { fixtureId: "different" }]) {
    assert.notEqual(stillCacheKey({ ...request, ...change }, "renderer", "dependencies"), key);
  }
  assert.notEqual(stillCacheKey(request, "new renderer", "dependencies"), key);
  assert.notEqual(stillCacheKey(request, "renderer", "new media"), key);
  assert.equal(stillCacheKey(request, null, "dependencies"), null);
  assert.equal(stillCacheKey(request, "renderer", null), null);
});

test("media bytes, fonts and code invalidate even with restored modification time and unchanged size", t => {
  const root = fixture(t), hash = createStillDependencyHasher(root);
  const original = hash(request);
  assert.ok(original);
  assert.equal(hash(request), original);
  for (const file of ["public/fonts/test.woff2", "src/renderer.ts", "pnpm-lock.yaml"]) {
    const target = path.join(root, file), stat = fs.statSync(target);
    fs.writeFileSync(target, "changed"); // seven bytes, same length as initial
    fs.utimesSync(target, stat.atime, stat.mtime);
    assert.notEqual(hash(request), original);
    assert.equal(hash(request), createStillDependencyHasher(root)(request));
    fs.writeFileSync(target, "initial");
    assert.equal(hash(request), original);
  }
  fs.writeFileSync(path.join(root, "public/picture.png"), "pixels1");
  const mediaRequest = { ...request, inputProps: { source_url: "/picture.png" } };
  const before = hash(mediaRequest);
  fs.writeFileSync(path.join(root, "public/picture.png"), "pixels2");
  assert.notEqual(hash(mediaRequest), before);
  fs.unlinkSync(path.join(root, "public/picture.png"));
  assert.equal(hash(mediaRequest), null);
});

test("unknown remote, dynamic, missing and nested SVG dependencies bypass instead of pretending unchanged", t => {
  const root = fixture(t), hash = createStillDependencyHasher(root);
  for (const source_url of ["https://other.test/video.mp4", "blob:opaque", "/api/unknown", "/missing.png", "/picture.png?v=1", "data:image/svg+xml,<svg/>"]) {
    assert.equal(hash({ ...request, inputProps: { nested: [{ source_url }] } }), null, source_url);
  }
  assert.equal(hash({ ...request, baseUrl: "https://remote.test" }), null);
});

test("directory snapshots reuse listings while additions, deletions, renames and nested replacements invalidate", t => {
  const root = fixture(t), cached = createStillDependencyHasher(root), baseline = createStillDependencyHasher(root, { reuseDirectoryListings: false });
  const initial = cached(request);
  assert.equal(initial, baseline(request));
  const reads = cached.stats.directoryReads;
  assert.equal(cached(request), initial);
  assert.equal(cached.stats.directoryReads, reads);
  assert.ok(cached.stats.directoryReuses > 0);
  fs.mkdirSync(path.join(root, 'src/new'));
  fs.writeFileSync(path.join(root, 'src/new/a.ts'), 'new');
  const added = cached(request);
  assert.notEqual(added, initial); assert.equal(added, baseline(request));
  fs.renameSync(path.join(root, 'src/new/a.ts'), path.join(root, 'src/new/b.ts'));
  const renamed = cached(request);
  assert.notEqual(renamed, added); assert.equal(renamed, baseline(request));
  fs.rmSync(path.join(root, 'src/new'), { recursive: true });
  assert.equal(cached(request), initial);
  fs.mkdirSync(path.join(root, 'src/new'));
  fs.writeFileSync(path.join(root, 'src/new/a.ts'), 'replacement');
  assert.equal(cached(request), baseline(request));
  assert.notEqual(cached(request), added);
});

test("verified cache hits copy exact bytes; corrupt, partial and mismatched entries miss", t => {
  const root = fixture(t), directory = path.join(root, "cache"), output = path.join(root, "output.png"), input = path.join(root, "input.png");
  const key = stillCacheKey(request, "renderer", "dependencies")!;
  fs.writeFileSync(input, "verified pixels");
  assert.equal(readStillCache(directory, key, output), false);
  writeStillCache(directory, key, input);
  assert.equal(readStillCache(directory, key, output), true);
  assert.deepEqual(fs.readFileSync(input), fs.readFileSync(output));
  fs.writeFileSync(path.join(directory, `${key}.png`), "corrupt pixels");
  assert.equal(readStillCache(directory, key, output), false);
  writeStillCache(directory, key, input);
  fs.writeFileSync(path.join(directory, `${key}.json`), "{");
  assert.equal(readStillCache(directory, key, output), false);
  writeStillCache(directory, key, input);
  fs.unlinkSync(path.join(directory, `${key}.json`));
  assert.equal(readStillCache(directory, key, output), false);
  assert.equal(readStillCache(directory, "../unsafe", output), false);
});

test("a different server checkout or missing environment proof disables local dependency reuse", async t => {
  t.mock.method(globalThis, "fetch", async () => GET());
  const first = await readVerifiedStillEnvironment(request.baseUrl, process.cwd());
  assert.ok(first?.runtimeId);
  assert.deepEqual(await readVerifiedStillEnvironment(request.baseUrl, process.cwd()), first);
  assert.equal(await verifyStillCacheEnvironment(request.baseUrl, process.cwd()), true);
  assert.equal(await verifyStillCacheEnvironment(request.baseUrl, "/another/checkout"), false);
  t.mock.method(globalThis, "fetch", async () => new Response("unavailable", { status: 404 }));
  assert.equal(await verifyStillCacheEnvironment(request.baseUrl, process.cwd()), false);
});

test("nested mask directory bytes invalidate still evidence", t => {
  const root=fixture(t), hash=createStillDependencyHasher(root);
  const dir=path.join(root,"public/masks");fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir,"00000.png"),"mask-a");
  const input={...request,inputProps:{props:{grid_matte_mask:{source_url:"/masks"}}}};
  const first=hash(input);assert.ok(first);
  fs.writeFileSync(path.join(dir,"00000.png"),"mask-b");
  assert.notEqual(hash(input),first);
});
