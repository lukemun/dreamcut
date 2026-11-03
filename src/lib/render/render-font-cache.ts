import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Page, Route } from "playwright-core";
import { profileDir } from "@/lib/local-store/profile-dir";

/**
 * Rebuildable cache of the Google Fonts an export page asks for. Each export page is a fresh browser with
 * no HTTP cache, so without this every page of every export downloads its caption fonts again (1.5–5 s a
 * page here, and a 25 s timeout on a slow network). Pages get the same bytes Google served the first time.
 * Font files are versioned by URL and kept until trimmed; stylesheets are refetched after a month.
 */
export const RENDER_FONT_CACHE_CAP_BYTES = 64 * 1024 * 1024;
const FREE_SPACE_RESERVE_BYTES = 5 * 1024 ** 3;
const STYLESHEET_FRESH_MS = 30 * 24 * 60 * 60 * 1000;
const GOOGLE_FONTS = /^https:\/\/fonts\.(googleapis|gstatic)\.com\//;

type Saved = { body: Buffer; contentType: string };
const memory = new Map<string, Saved>();

export const renderFontCacheDir = () => path.join(profileDir(), "cache", "render-fonts");

/** Stylesheets differ by browser, so their key includes the user agent; font files do not. */
export function renderFontCacheKey(url: string, userAgent: string) {
  const stylesheet = url.startsWith("https://fonts.googleapis.com/");
  return createHash("sha256").update(stylesheet ? `${url}\n${userAgent}` : url).digest("hex").slice(0, 40);
}

function read(key: string, stylesheet: boolean): Saved | null {
  const known = memory.get(key);
  if (known) return known;
  const dir = renderFontCacheDir();
  try {
    const meta = JSON.parse(fs.readFileSync(path.join(dir, `${key}.json`), "utf8")) as { contentType: string; savedAt: number };
    if (stylesheet && Date.now() - meta.savedAt > STYLESHEET_FRESH_MS) return null;
    const file = path.join(dir, `${key}.bin`), now = new Date();
    const saved = { body: fs.readFileSync(file), contentType: meta.contentType };
    try { fs.utimesSync(file, now, now); } catch { /* use order only */ }
    memory.set(key, saved);
    return saved;
  } catch { return null; }
}

function write(key: string, saved: Saved) {
  memory.set(key, saved);
  const dir = renderFontCacheDir();
  try {
    fs.mkdirSync(dir, { recursive: true });
    const stats = fs.statfsSync(dir);
    if (stats.bavail * stats.bsize < FREE_SPACE_RESERVE_BYTES + saved.body.length) return;
    const file = path.join(dir, `${key}.bin`), partial = `${file}.${process.pid}.part`;
    fs.writeFileSync(partial, saved.body);
    fs.renameSync(partial, file);
    fs.writeFileSync(path.join(dir, `${key}.json`), JSON.stringify({ contentType: saved.contentType, savedAt: Date.now() }));
    trimRenderFontCache(dir);
  } catch { /* The page still has the font from memory; the next export downloads it again. */ }
}

/** Remove the least recently used fonts until the folder fits its cap. */
export function trimRenderFontCache(dir = renderFontCacheDir(), cap = RENDER_FONT_CACHE_CAP_BYTES) {
  const files = fs.readdirSync(dir).filter(name => name.endsWith(".bin")).map(name => {
    const file = path.join(dir, name), stat = fs.statSync(file);
    return { file, size: stat.size, used: stat.mtimeMs };
  }).sort((a, b) => a.used - b.used);
  let total = files.reduce((sum, item) => sum + item.size, 0);
  for (const item of files) {
    if (total <= cap) break;
    fs.rmSync(item.file, { force: true });
    fs.rmSync(item.file.replace(/\.bin$/, ".json"), { force: true });
    total -= item.size;
  }
}

async function serve(route: Route, userAgent: string) {
  const url = route.request().url(), stylesheet = url.startsWith("https://fonts.googleapis.com/");
  const key = renderFontCacheKey(url, userAgent);
  let saved = read(key, stylesheet);
  if (!saved) {
    const response = await route.fetch();
    if (!response.ok()) return route.fulfill({ response });
    saved = { body: await response.body(), contentType: response.headers()["content-type"] ?? (stylesheet ? "text/css" : "font/woff2") };
    write(key, saved);
  }
  // FontFace fetches font files in CORS mode, so the page needs Google's permissive header back.
  return route.fulfill({ status: 200, body: saved.body, headers: { "content-type": saved.contentType, "access-control-allow-origin": "*" } });
}

/** Serve this export page's Google Fonts requests from the cache, downloading only what is missing. */
export async function serveRenderFonts(page: Page) {
  const userAgent = await page.evaluate(() => navigator.userAgent);
  await page.route(GOOGLE_FONTS, route => serve(route, userAgent).catch(() => route.continue()));
}
