import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { renderFontCacheKey, trimRenderFontCache } from "./render-font-cache";

test("stylesheets are kept per browser, font files once for every browser", () => {
  const css = "https://fonts.googleapis.com/css2?family=Anton&display=swap", font = "https://fonts.gstatic.com/s/anton/v1/a.woff2";
  assert.notEqual(renderFontCacheKey(css, "Chrome/155"), renderFontCacheKey(css, "Chrome/156"));
  assert.equal(renderFontCacheKey(font, "Chrome/155"), renderFontCacheKey(font, "Chrome/156"));
});

test("the cache drops its least recently used fonts, with their records, to fit the cap", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "render-fonts-"));
  for (const [name, age] of [["old", 3], ["mid", 2], ["new", 1]] as const) {
    fs.writeFileSync(path.join(dir, `${name}.bin`), Buffer.alloc(100));
    fs.writeFileSync(path.join(dir, `${name}.json`), "{}");
    const when = new Date(Date.now() - age * 60_000);
    fs.utimesSync(path.join(dir, `${name}.bin`), when, when);
  }
  trimRenderFontCache(dir, 200);
  assert.deepEqual(fs.readdirSync(dir).sort(), ["mid.bin", "mid.json", "new.bin", "new.json"]);
});
