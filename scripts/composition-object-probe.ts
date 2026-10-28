/**
 * Count the separable objects a HyperFrames composition shows, frame by frame.
 *
 *   tsx scripts/composition-object-probe.ts <composition dir> [--samples | --errors]
 *
 * Loads index.html in headless Chrome with its default values, seeks the "main" GSAP timeline
 * every 0.2 s, lists the visible text and pictures (clipped by overflow and timed by
 * data-start/data-duration), and prints one JSON line: `frame` is null when every sampled frame
 * shows at most one object, or the first frame that shows more; `most` is the frame with the
 * most objects; `opaque_canvas` is true when a canvas is painted edge to edge. A canvas is read
 * on a coarse grid: each separate drawn region counts as its own picture. With --errors it only
 * loads the page and prints `{ timeline, page_errors }`: whether "main" was registered and the
 * script errors the page threw on the way. Read-only.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";

import { firstMultiObjectFrame, separableObjects, type ContentLeaf } from "@/lib/hyperframes/composition-objects";

const STEP_SECONDS = 0.2;

async function main() {
  const dir = process.argv[2];
  if (!dir) throw new Error("Usage: composition-object-probe <composition dir>");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage();
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    // tsx keeps function names with a __name helper that the page does not define.
    await page.addInitScript("window.__name = (fn) => fn;");
    // The HyperFrames renderer creates the timeline registry before any script runs; so does the probe.
    await page.addInitScript("window.__timelines = window.__timelines || {};");
    await page.goto(pathToFileURL(path.join(path.resolve(dir), "index.html")).href, { waitUntil: "load" });
    const size = await page.evaluate(() => {
      const root = document.querySelector("[data-composition-id]");
      return { width: Number(root?.getAttribute("data-width")) || 1920, height: Number(root?.getAttribute("data-height")) || 1080 };
    });
    await page.setViewportSize(size);
    if (process.argv.includes("--errors")) {
      const timeline = await page.waitForFunction(() => Boolean((window as unknown as { __timelines?: Record<string, unknown> }).__timelines?.main), null, { timeout: 5000 }).then(() => true, () => false);
      console.log(JSON.stringify({ timeline, page_errors: pageErrors }));
      return;
    }
    await page.waitForFunction(() => Boolean((window as unknown as { __timelines?: Record<string, unknown> }).__timelines?.main), null, { timeout: 15000 });
    const duration = await page.evaluate(() => (window as unknown as { __timelines: Record<string, { duration(): number }> }).__timelines.main.duration());
    const samples: { at_seconds: number; leaves: ContentLeaf[] }[] = [];
    for (let t = 0; t <= duration + 1e-6; t += STEP_SECONDS) {
      const at = Math.min(t, Math.max(0, duration - 0.001));
      const leaves = await page.evaluate(({ at, size }) => {
        (window as unknown as { __timelines: Record<string, { seek(t: number, suppress?: boolean): void }> }).__timelines.main.seek(at, false);
        const root = document.querySelector("[data-composition-id]") ?? document.body;
        const canvas = { left: 0, top: 0, right: size.width, bottom: size.height };
        const timedOut = (el: Element) => {
          for (let e: Element | null = el; e; e = e.parentElement) {
            const start = e.getAttribute("data-start"), length = e.getAttribute("data-duration");
            if (start !== null && length !== null && (at < Number(start) || at >= Number(start) + Number(length))) return true;
          }
          return false;
        };
        const visibleBox = (el: Element) => {
          let opacity = 1;
          const r = el.getBoundingClientRect();
          let box = { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
          for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) {
            const style = getComputedStyle(e);
            if (style.display === "none" || style.visibility === "hidden") return null;
            opacity *= Number(style.opacity);
            if (e !== el && style.overflow !== "visible") {
              const c = e.getBoundingClientRect();
              box = { left: Math.max(box.left, c.left), top: Math.max(box.top, c.top), right: Math.min(box.right, c.right), bottom: Math.min(box.bottom, c.bottom) };
            }
          }
          box = { left: Math.max(box.left, canvas.left), top: Math.max(box.top, canvas.top), right: Math.min(box.right, canvas.right), bottom: Math.min(box.bottom, canvas.bottom) };
          if (opacity < 0.05 || box.right - box.left < 2 || box.bottom - box.top < 2) return null;
          return box;
        };
        type Leaf = { kind: "text" | "picture"; left: number; top: number; right: number; bottom: number; font_size?: number; text?: string; opaque?: boolean };
        const out: Leaf[] = [];
        // A canvas is sampled on a coarse grid. Painted edge to edge, it is one opaque picture whose
        // drawings cannot be told apart; otherwise each separate drawn region is its own picture.
        const GRID_W = 96, GRID_H = 54, FILLED_ALPHA = 24, JOIN_ALPHA = 6, MIN_CELLS = 3, OPAQUE_COVERAGE = 0.85;
        const canvasLeaves = (el: HTMLCanvasElement, box: { left: number; top: number; right: number; bottom: number }): Leaf[] => {
          // Each cell takes its strongest pixel, so a thin stroke still joins the shapes it connects.
          const cellAlpha = new Uint8Array(GRID_W * GRID_H);
          try {
            const w = el.width || 1, h = el.height || 1;
            const full = document.createElement("canvas");
            full.width = w; full.height = h;
            const g = full.getContext("2d");
            if (!g) return [{ kind: "picture", ...box }];
            g.drawImage(el, 0, 0);
            const px = g.getImageData(0, 0, w, h).data;
            for (let y = 0; y < h; y++) {
              const row = Math.min(GRID_H - 1, Math.floor((y * GRID_H) / h)) * GRID_W;
              for (let x = 0; x < w; x++) {
                const a = px[(y * w + x) * 4 + 3];
                const cell = row + Math.min(GRID_W - 1, Math.floor((x * GRID_W) / w));
                if (a > cellAlpha[cell]) cellAlpha[cell] = a;
              }
            }
          } catch {
            return [{ kind: "picture", ...box }];
          }
          // Visible cells seed regions; faint cells only join them, so a drawing fading in (its
          // body still faint, its words already bright) stays one region.
          const filled = new Uint8Array(GRID_W * GRID_H);
          let count = 0;
          for (let i = 0; i < filled.length; i++) {
            if (cellAlpha[i] > JOIN_ALPHA) filled[i] = 1;
            if (cellAlpha[i] > FILLED_ALPHA) count++;
          }
          if (count === 0) return [];
          if (count / filled.length >= OPAQUE_COVERAGE) return [{ kind: "picture", ...box, opaque: true }];
          const seen = new Uint8Array(filled.length);
          const regions: Leaf[] = [];
          const sx = (box.right - box.left) / GRID_W, sy = (box.bottom - box.top) / GRID_H;
          for (let start = 0; start < filled.length; start++) {
            if (!filled[start] || seen[start]) continue;
            const stack = [start];
            seen[start] = 1;
            let cells = 0, visible = 0, minX = GRID_W, minY = GRID_H, maxX = 0, maxY = 0;
            while (stack.length) {
              const i = stack.pop() as number;
              const x = i % GRID_W, y = (i - x) / GRID_W;
              cells++; if (cellAlpha[i] > FILLED_ALPHA) visible++; minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
              // Diagonal neighbours count, so a stroke stepping across cells stays one region.
              for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1], [x - 1, y - 1], [x + 1, y - 1], [x - 1, y + 1], [x + 1, y + 1]]) {
                if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
                const n = ny * GRID_W + nx;
                if (filled[n] && !seen[n]) { seen[n] = 1; stack.push(n); }
              }
            }
            if (visible < MIN_CELLS) continue;
            regions.push({ kind: "picture", left: box.left + minX * sx, top: box.top + minY * sy, right: box.left + (maxX + 1) * sx, bottom: box.top + (maxY + 1) * sy });
          }
          return regions;
        };
        for (const el of root.querySelectorAll("*")) {
          const tag = el.tagName.toLowerCase();
          const inSvg = el.closest("svg") !== null && tag !== "svg";
          if (inSvg || tag === "script" || tag === "style" || timedOut(el)) continue;
          const picture = tag === "img" || tag === "svg" || tag === "canvas" || tag === "video";
          const ownText = [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE).map((n) => n.textContent ?? "").join("").trim();
          if (!picture && !ownText) continue;
          const box = visibleBox(el);
          if (!box) continue;
          if (tag === "canvas") out.push(...canvasLeaves(el as HTMLCanvasElement, box));
          else out.push(picture ? { kind: "picture", ...box } : { kind: "text", ...box, font_size: parseFloat(getComputedStyle(el).fontSize), text: ownText });
        }
        return out;
      }, { at, size });
      samples.push({ at_seconds: Math.round(at * 1000) / 1000, leaves });
    }
    // The frame with the most separable objects, so a gap names everything drawn together.
    let most: { at_seconds: number; objects: ReturnType<typeof separableObjects> } | null = null;
    for (const sample of samples) {
      const objects = separableObjects(sample.leaves);
      if (objects.length > 1 && (!most || objects.length > most.objects.length)) most = { at_seconds: sample.at_seconds, objects };
    }
    const opaqueCanvas = samples.some((sample) => sample.leaves.some((leaf) => leaf.opaque));
    // --samples prints every sampled frame's leaves, for diagnosing what the check sees.
    const detail = process.argv.includes("--samples") ? { sampled: samples } : {};
    console.log(JSON.stringify({ frame: firstMultiObjectFrame(samples), most, opaque_canvas: opaqueCanvas, samples: samples.length, ...detail }));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
