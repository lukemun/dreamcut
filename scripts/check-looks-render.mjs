// Draw every motion-graphic look in Explainer Sequence's title scene in headless Chrome and report the
// looks that cannot ship: the page throws, the "main" timeline never builds (HyperFrames then
// fails with "Could not determine composition duration"), or the words read below 3:1 against
// what is drawn behind them (HyperFrames' contrast pass refuses that render). Static checks
// (pnpm check:looks) only parse each bundle, so a look that throws when it runs passes them.
//
//   pnpm check:looks --render [--palettes] [--look <id>] [--root <checkout>]
//
// --palettes also draws each look's palettes (Light, Dark, Mono). Read-only; needs Chrome.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { chromium } from "playwright-core";
import sharp from "sharp";

const TEMPLATE_DIR = ".agents/skills/motion-graphics/templates/explainer-sequence";
const LOOKS_DIR = ".agents/skills/motion-graphics/looks";
const MIN_CONTRAST = 3;
const PHRASE = "Hello, welcome to DreamCut";
const KICKER = "DreamCut";
/** The title has landed (entrance plus its stagger) and the scene has not yet changed. */
const TITLE_LANDED = 1.8;
/** The title scene's type sits straight on the backdrop: the kicker in the accent, the title in display ink. */
const TYPE = "#title-scene #kicker, #title-scene #title";
const SHAPES = { wide: { width: 1920, height: 1080 }, tall: { width: 1080, height: 1920 } };

function luminance([r, g, b]) {
  const lin = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio of two sRGB colours. */
export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function parseRgb(css) {
  const m = String(css).match(/rgba?\(([^)]+)\)/);
  return m ? m[1].split(/[ ,/]+/).slice(0, 3).map(Number) : null;
}

/** The median colour of the pixels in a box of a raw RGBA screenshot. */
function medianColor({ data, info }, box) {
  const channels = [[], [], []];
  const x0 = Math.max(0, Math.floor(box.x)), y0 = Math.max(0, Math.floor(box.y));
  const x1 = Math.min(info.width, Math.ceil(box.x + box.width)), y1 = Math.min(info.height, Math.ceil(box.y + box.height));
  for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
    const i = (y * info.width + x) * info.channels;
    for (let c = 0; c < 3; c++) channels[c].push(data[i + c]);
  }
  return channels.map((values) => { values.sort((a, b) => a - b); return values[Math.floor(values.length / 2)] ?? 0; });
}

async function drawLook(page, scratch, bundle, id, palette, shape) {
  fs.writeFileSync(path.join(scratch, `looks-${`?look=${id}&palette=${palette}`.replace(/[^a-z0-9]+/gi, "-")}.js`), bundle(id));
  const errors = [];
  const onError = (error) => errors.push(error.message);
  page.on("pageerror", onError);
  try {
    await page.goto(pathToFileURL(path.join(scratch, `index-${shape}.html`)).href + `?look=${id}&palette=${palette}`, { waitUntil: "load" });
    const built = await page.waitForFunction(() => Boolean(window.__timelines?.main), null, { timeout: 5000 }).then(() => true, () => false);
    if (!built) return { problems: [errors.length ? `the page throws: ${errors[0]}` : "the \"main\" timeline never builds"] };
    // The title as it lands: read the kicker's and title's colours, then hide the glyphs and read what is drawn
    // behind each. A look that letters its headlines on its own canvas hides these (transparent), so they are skipped.
    const words = await page.evaluate(([selector, at]) => {
      window.__timelines.main.seek(at, false);
      return [...document.querySelectorAll(selector)].map((el) => {
        const r = el.getBoundingClientRect(), css = getComputedStyle(el);
        const hidden = /rgba\([^)]*,\s*0\)|transparent/.test(`${css.color} ${css.webkitTextFillColor}`) || Number(css.opacity) === 0;
        return { text: el.textContent, color: hidden ? null : css.color, box: { x: r.left, y: r.top, width: r.width, height: r.height } };
      });
    }, [TYPE, TITLE_LANDED]);
    // Only the glyphs go: a look that sets words on their own strip or sticker keeps it.
    await page.addStyleTag({ content: `${TYPE.split(",").map((s) => `${s}, ${s} *`).join(", ")} { color: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; -webkit-text-stroke: 0 !important; }` });
    const shot = await sharp(await page.screenshot()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const problems = errors.map((message) => `the page throws: ${message}`);
    for (const word of words) {
      const ink = parseRgb(word.color);
      if (!ink || word.box.width < 2) continue;
      const behind = medianColor(shot, word.box);
      const ratio = contrastRatio(ink, behind);
      if (ratio < MIN_CONTRAST) { problems.push(`"${word.text}" reads ${ratio.toFixed(2)}:1 (rgb ${ink.join(",")} on ${behind.join(",")}; needs ${MIN_CONTRAST}:1)`); break; }
    }
    return { problems };
  } finally {
    page.off("pageerror", onError);
  }
}

/** `bundle(id)` is the looks.js a graphic in that look loads (build-looks.mjs buildLooks). */
export async function checkLooksRender({ bundle, root = process.cwd(), palettes = false, only = null }) {
  const { order } = JSON.parse(fs.readFileSync(path.join(root, LOOKS_DIR, "looks.json"), "utf8"));
  const ids = only ? order.filter((id) => only.includes(id)) : order;
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "dreamcut-looks-render-"));
  // The template reads its values from window.__dreamcut (its own defaults, with this title); the query string
  // names the look and palette.
  const defaults = Object.fromEntries(JSON.parse(fs.readFileSync(path.join(root, TEMPLATE_DIR, "dreamcut.controls.json"), "utf8")).controls.map((control) => [control.id, control.default]));
  const controls = JSON.stringify({ ...defaults, texture: 100, own_accent: false, backdrop: true, kicker: KICKER, title: PHRASE });
  const html = fs.readFileSync(path.join(root, TEMPLATE_DIR, "index.html"), "utf8").replace("<head>", `<head>
    <script>{ const q = new URLSearchParams(location.search); window.__timelines = {};
      window.__dreamcut = { controls: { ...${controls}, look: q.get("look"), palette: q.get("palette"), shape: SHAPE } }; }</script>`);
  // Each draw loads its own bundle file, so Chrome never reuses the previous look's script.
  if (!html.includes('<script src="looks.js"></script>')) throw new Error("Explainer Sequence no longer loads looks.js the way this check expects");
  const page_ = html.replace('<script src="looks.js"></script>',
    '<script>document.write(\'<script src="looks-\' + location.search.replace(/[^a-z0-9]+/gi, "-") + \'.js"><\\/script>\');</script>');
  // 16:9 and 9:16 lay the words out differently, so each draws over a different part of the backdrop.
  for (const [shape, size] of Object.entries(SHAPES)) fs.writeFileSync(path.join(scratch, `index-${shape}.html`),
    page_.replace("shape: SHAPE", `shape: ${JSON.stringify(shape)}`).replace('data-width="1920" data-height="1080"', `data-width="${size.width}" data-height="${size.height}"`));
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const failures = [];
  let drawn = 0;
  try {
    for (const [shape, size] of Object.entries(SHAPES)) {
      const page = await browser.newPage({ viewport: size });
      const label = (id, palette) => palette === "original" && shape === "wide" ? id : `${id} (${[palette, shape === "tall" ? "9:16" : null].filter(Boolean).join(", ")})`;
      for (const id of ids) {
        const { problems } = await drawLook(page, scratch, bundle, id, "original", shape);
        drawn++;
        for (const problem of problems) failures.push(`${label(id, "original")}: ${problem}`);
        // A look that throws has no palettes to read; one that draws keeps going so every failure shows at once.
        if (!palettes || problems.some((problem) => problem.startsWith("the page throws") || problem.startsWith("the \"main\""))) continue;
        const names = await page.evaluate((look) => Object.keys(window.DreamcutMotion?.LOOKS?.[look]?.palettes ?? {}), id);
        for (const palette of names.filter((name) => name !== "original")) {
          const result = await drawLook(page, scratch, bundle, id, palette, shape);
          drawn++;
          for (const problem of result.problems) failures.push(`${label(id, palette)}: ${problem}`);
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
  return { failures, drawn };
}
