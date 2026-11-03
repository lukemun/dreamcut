import fs from "node:fs";
import path from "node:path";

import { NextResponse } from "next/server";

import {
  applyCanvasSizeToHtml, applyDurationToHtml, authoredSegmentDurations, canvasSizeForValues, injectRuntimeIntoHtml, parseCompositionManifest, resolveManifestValues,
} from "@/lib/hyperframes/composition-manifest";
import { resolveTiming } from "@/lib/hyperframes/composition-timing";
import { buildLookBundle, lookIdFromValues, usesSharedLooks } from "@/lib/hyperframes/look-bundle";
import { projectExists, projectHyperframesDir } from "@/lib/local-store/paths";

type Params = { params: Promise<{ projectId: string; compositionId: string; path: string[] }> };

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".woff2": "font/woff2", ".mp4": "video/mp4", ".webm": "video/webm",
};

/**
 * Fits the composition to the frame it is shown in and seeks its timeline when the editor asks, so
 * the editor can draw a motion graphic live with draft values while its real render catches up.
 * Seeking keeps callbacks on, because canvas compositions draw from the timeline's onUpdate.
 */
const BRIDGE = `<script>(function(){
  function stage(){ return document.querySelector('[data-composition-id]'); }
  function fit(){ var r=stage(); if(!r) return; var w=+r.dataset.width||r.offsetWidth, h=+r.dataset.height||r.offsetHeight; if(!w||!h) return;
    var s=Math.min(innerWidth/w, innerHeight/h); document.documentElement.style.overflow='hidden'; document.body.style.margin='0';
    r.style.position='absolute'; r.style.left='0'; r.style.top='0'; r.style.transformOrigin='0 0';
    r.style.transform='translate('+((innerWidth-w*s)/2)+'px,'+((innerHeight-h*s)/2)+'px) scale('+s+')'; }
  function timeline(){ return window.__timelines&&(window.__timelines.main||Object.values(window.__timelines)[0]); }
  function seek(t){ var tl=timeline(); if(tl&&tl.seek){ tl.seek(Math.max(0,t), false); } }
  addEventListener('resize', fit);
  addEventListener('message', function(e){ var d=e.data; if(d&&d.type==='dreamcut-live-seek') seek(d.t); });
  // A page that never built its timeline draws nothing; the editor keeps the rendered clip and says so.
  addEventListener('load', function(){ fit(); var tl=timeline(); parent.postMessage({type: tl&&tl.seek ? 'dreamcut-live-ready' : 'dreamcut-live-failed'}, '*'); });
})();</script>`;

const TIMELINES = "<script>window.__timelines=window.__timelines||{};</script>";

/**
 * GET a composition's own file. index.html arrives with the draft values (?values=), the bridge and
 * an absolute base, because the editor shows it as a sandboxed srcdoc frame.
 */
export async function GET(request: Request, { params }: Params) {
  const { projectId, compositionId, path: parts } = await params;
  if (!projectExists(projectId) || !/^[A-Za-z0-9._-]{1,128}$/.test(compositionId)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const root = path.join(projectHyperframesDir(projectId), compositionId);
  const relative = parts.join("/");
  const file = path.resolve(root, relative);
  if (!file.startsWith(root + path.sep)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const manifestPath = path.join(root, "dreamcut.controls.json");
  let manifest: ReturnType<typeof parseCompositionManifest> | null = null;
  // An unreadable controls file means no live preview (the rendered picture still shows), not a server error.
  try { manifest = fs.existsSync(manifestPath) ? parseCompositionManifest(JSON.parse(fs.readFileSync(manifestPath, "utf8"))) : null; }
  catch { return NextResponse.json({ error: "Not found" }, { status: 404 }); }
  const url = new URL(request.url);
  let supplied: unknown;
  try { supplied = JSON.parse(url.searchParams.get("values") ?? "{}"); } catch { supplied = {}; }
  const values = manifest ? resolveManifestValues(manifest, supplied) : null;
  const headers = { "Cache-Control": "no-store" };

  // A looks template's look code is supplied by DreamCut, as at render time.
  if (relative === "looks.js" && manifest && values && usesSharedLooks(manifest)) {
    return new NextResponse(buildLookBundle(lookIdFromValues(values)), { headers: { ...headers, "Content-Type": TYPES[".js"] } });
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  if (relative !== "index.html") return new NextResponse(fs.readFileSync(file), { headers: { ...headers, "Content-Type": type } });

  let html = fs.readFileSync(file, "utf8");
  if (manifest && values) {
    // Drawn as the render copy is: the canvas and length these values choose, then the values.
    const size = canvasSizeForValues(manifest, values);
    if (size) html = applyCanvasSizeToHtml(html, size);
    const length = manifest.timing ? resolveTiming(manifest.timing, values).duration : null;
    if (length) html = applyDurationToHtml(html, length);
    html = injectRuntimeIntoHtml(html, { controls: values, segment_durations: authoredSegmentDurations(manifest) });
  }
  // The renderer provides the timeline registry compositions write `main` into; here the page does.
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => `${head}${TIMELINES}`) : `${TIMELINES}${html}`;
  // The shared look code depends on the chosen look, so it is written into the page: the editor shows it
  // as a sandboxed frame, whose own requests back to the editor a browser may refuse.
  if (manifest && values && usesSharedLooks(manifest)) {
    const bundle = buildLookBundle(lookIdFromValues(values)).replace(/<\/(script)/gi, "<\\/$1");
    html = html.replace(/<script\b[^>]*\bsrc=["'](?:\.\/)?looks\.js["'][^>]*>\s*<\/script>/gi, () => `<script>${bundle}</script>`);
  }
  const base = `${url.protocol}//${request.headers.get("host") ?? url.host}/api/projects/${encodeURIComponent(projectId)}/hyperframes/live/${encodeURIComponent(compositionId)}/`;
  html = /<head[^>]*>/i.test(html) ? html.replace(/<head[^>]*>/i, (head) => `${head}<base href="${base}">`) : `<base href="${base}">${html}`;
  html = /<\/body>/i.test(html) ? html.replace(/<\/body>/i, `${BRIDGE}</body>`) : `${html}${BRIDGE}`;
  return new NextResponse(html, { headers: { ...headers, "Content-Type": type } });
}
