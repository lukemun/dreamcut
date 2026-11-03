/** Freeze individual local HTML artwork into versioned, reusable alpha assets.
 * Usage: node scripts/freeze-dom-assets.mjs build spec.json output-directory
 *        node scripts/freeze-dom-assets.mjs verify output-directory
 * Never writes a timeline. Existing packs cannot be overwritten.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const safeFile = (root, relative) => {
  const result = path.resolve(root, relative);
  if (!result.startsWith(path.resolve(root) + path.sep)) throw Error(`Path escapes pack: ${relative}`);
  return result;
};
const [command, input, destination] = process.argv.slice(2);
if (!['build', 'verify'].includes(command) || !input) throw Error('Expected build spec.json output-directory | verify output-directory');

async function verify(root) {
  const manifest = await readJson(path.join(root, 'manifest.json'));
  if (manifest.schema_version !== 1 || manifest.recipe !== 'computed-dom-artwork-v1') throw Error('Unsupported asset pack contract');
  const failures = [];
  for (const file of manifest.files) {
    try { if (hash(await fs.readFile(safeFile(root, file.path))) !== file.sha256) failures.push(`Changed pack file: ${file.path}`); }
    catch { failures.push(`Missing pack file: ${file.path}`); }
  }
  for (const source of manifest.sources) {
    try { if (hash(await fs.readFile(source.path)) !== source.sha256) failures.push(`Source drift: ${source.path}`); }
    catch { failures.push(`Source unavailable: ${source.path}`); }
  }
  if (new Set(manifest.assets.map(a => a.id)).size !== manifest.assets.length) failures.push('Duplicate asset IDs');
  for (const asset of manifest.assets) {
    if (!asset.verification?.image_roundtrip_exact || !asset.verification?.transparent_margin) failures.push(`Unverified artwork: ${asset.id}`);
  }
  if (failures.length) throw Error(failures.join('\n'));
  return { status: 'passed', assets: manifest.assets.length, hashed_files: manifest.files.length, source_files: manifest.sources.length,
    scope: 'Pack integrity and live-source freshness. Original build also checks alpha and image roundtrip. This is not a destination timeline or motion parity certificate.' };
}

if (command === 'verify') {
  console.log(JSON.stringify(await verify(path.resolve(input)), null, 2));
} else {
  if (!destination) throw Error('Output directory required');
  const spec = await readJson(input);
  const root = path.resolve(destination);
  const sourceFile = path.resolve(spec.source_html);
  if (!spec.assets?.length || !Number.isFinite(spec.time)) throw Error('Assets and finite reference time required');
  for (const a of spec.assets) {
    if (!/^[a-z0-9][a-z0-9-]*$/.test(a.id) || !a.selector) throw Error('Invalid asset id/selector');
  }
  if (new Set(spec.assets.map(a => a.id)).size !== spec.assets.length) throw Error('Duplicate asset IDs');
  await fs.mkdir(path.dirname(root), { recursive: true });
  await fs.mkdir(root); // Fail rather than replace a released version.
  await fs.mkdir(path.join(root, 'images'));
  await fs.mkdir(path.join(root, 'recipes'));
  await fs.mkdir(path.join(root, 'source-files'));
  const browser = await chromium.launch({ headless: true });
  const sourceBytes = new Map([[sourceFile, await fs.readFile(sourceFile)]]);
  const problems = [];
  try {
    const context = await browser.newContext({ viewport: spec.canvas ?? { width: 1080, height: 1920 }, deviceScaleFactor: 2 });
    await context.route('**/*', async route => {
      const url = route.request().url();
      if (url.startsWith('file:') || url.startsWith('data:')) await route.continue();
      else { problems.push(`External dependency: ${url}`); await route.abort(); }
    });
    const page = await context.newPage();
    page.on('pageerror', e => problems.push(e.message));
    page.on('request', request => {
      if (request.url().startsWith('file:')) sourceBytes.set(fileURLToPath(request.url()), null);
    });
    await page.goto(pathToFileURL(sourceFile).href);
    await page.evaluate(async time => {
      await document.fonts.ready;
      await Promise.all(Array.from(document.images).map(i => i.decode()));
      const timelines = Object.values(window.__timelines ?? {});
      if (!timelines.length) throw Error('No seekable timeline found');
      for (const timeline of timelines) timeline.pause().seek(time, false);
    }, spec.time);
    if (problems.length) throw Error(problems.join('\n'));
    await page.screenshot({ path: path.join(root, 'reference-scene.png') });
    const assets = [];
    const art = await context.newPage();
    for (const target of spec.assets) {
      const extracted = await page.evaluate(({ selector, surface }) => {
        const nodes = document.querySelectorAll(selector);
        if (nodes.length !== 1) throw Error(`Expected one element: ${selector}, got ${nodes.length}`);
        const original = nodes[0];
        if (original.children.length && !surface) throw Error(`Composite target must be split into leaf artwork: ${selector}`);
        for (const pseudo of ['::before', '::after']) {
          const content = getComputedStyle(original, pseudo).content;
          if (content && !['none', 'normal', '""'].includes(content)) throw Error(`Unsupported generated content: ${selector} ${pseudo}`);
        }
        const style = getComputedStyle(original);
        const bounds = original.getBoundingClientRect().toJSON();
        const clone = original.cloneNode(false);
        if (!surface) clone.textContent = original.textContent;
        for (const key of style) clone.style.setProperty(key, style.getPropertyValue(key));
        const computed = { width: style.width, height: style.height, filter: style.filter, transform: style.transform,
          rotate: style.rotate, opacity: style.opacity, objectFit: style.objectFit, objectPosition: style.objectPosition,
          fontFamily: style.fontFamily, fontSize: style.fontSize };
        const ancestors = [];
        for (let parent = original.parentElement; parent; parent = parent.parentElement) {
          const s = getComputedStyle(parent);
          ancestors.push({ id: parent.id, transform: s.transform, rotate: s.rotate, opacity: s.opacity,
            overflow: s.overflow, bounds: parent.getBoundingClientRect().toJSON() });
        }
        const width = parseFloat(style.width), height = parseFloat(style.height);
        if (!(width > 0 && height > 0)) throw Error(`Non-numeric artwork bounds: ${selector}`);
        const matrix = style.transform === 'none' ? null : new DOMMatrix(style.transform);
        if (matrix) { matrix.e = 0; matrix.f = 0; }
        const appearanceTransform = matrix && !matrix.isIdentity ? matrix.toString() : 'none';
        Object.assign(clone.style, { position: 'absolute', left: '48px', top: '48px', right: 'auto', bottom: 'auto',
          margin: '0', transform: appearanceTransform, translate: 'none', scale: style.scale, visibility: 'visible',
          animation: 'none', transition: 'none' });
        return { html: clone.outerHTML, imageSource: original instanceof HTMLImageElement ? original.src : null,
          width, height, bounds, computed, ancestors, local_font: style.fontFamily };
      }, target);
      if (extracted.imageSource) {
        const url = extracted.imageSource;
        if (!url.startsWith('file:')) throw Error('Only managed local image inputs supported');
        const file = fileURLToPath(url), bytes = await fs.readFile(file);
        sourceBytes.set(file, bytes);
        const mime = file.endsWith('.svg') ? 'image/svg+xml' : file.endsWith('.png') ? 'image/png' : 'image/jpeg';
        extracted.html = extracted.html.replace(/src="[^"]*"/, `src="data:${mime};base64,${bytes.toString('base64')}"`);
      }
      const viewport = { width: Math.ceil(extracted.width + 96), height: Math.ceil(extracted.height + 96) };
      const html = `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:transparent;width:100%;height:100%;overflow:hidden}</style>${extracted.html}`;
      await fs.writeFile(path.join(root, 'recipes', `${target.id}.html`), html);
      await art.setViewportSize(viewport);
      await art.setContent(html);
      await art.evaluate(async () => { await document.fonts.ready; await Promise.all(Array.from(document.images).map(i => i.decode())); });
      const png = await art.screenshot({ omitBackground: true });
      const imageFile = `images/${spec.id}-${target.id}.png`;
      await fs.writeFile(path.join(root, imageFile), png);
      // Decode to check transparent margins; verify an ordinary image reproduces the same pixels.
      const alpha = await art.evaluate(async data => {
        const image = new Image(); image.src = data; await image.decode();
        const c = document.createElement('canvas'); c.width = image.width; c.height = image.height;
        const ctx = c.getContext('2d'); ctx.drawImage(image, 0, 0);
        const pixels = ctx.getImageData(0, 0, c.width, c.height).data;
        let visible = 0, edge = 0;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          const a = pixels[(y*c.width+x)*4+3]; if (a) visible++;
          if ((x === 0 || y === 0 || x === c.width-1 || y === c.height-1) && a) edge++;
        }
        return { visible, edge };
      }, `data:image/png;base64,${png.toString('base64')}`);
      if (!alpha.visible || alpha.edge) throw Error(`Empty artwork or cropped effect on ${target.id}`);
      await art.setContent(`<style>html,body{margin:0;background:transparent}img{display:block;width:${viewport.width}px;height:${viewport.height}px}</style><img src="data:image/png;base64,${png.toString('base64')}">`);
      await art.evaluate(async () => { await document.images[0].decode(); });
      const roundtrip = await art.screenshot({ omitBackground: true });
      if (!png.equals(roundtrip)) throw Error(`Image roundtrip changed rendered output: ${target.id}`);
      assets.push({ id: target.id, label: target.label, selector: target.selector, surface_only: !!target.surface,
        file: imageFile, recipe: `recipes/${target.id}.html`, pixel_width: viewport.width*2, pixel_height: viewport.height*2,
        logical_width: extracted.width, logical_height: extracted.height, padding: 48,
        source_bounds: extracted.bounds, appearance: extracted.computed, ancestor_layout: extracted.ancestors,
        verification: { image_roundtrip_exact: true, transparent_margin: true },
        editability: 'Artwork pixels frozen; placement, scale, rotation, opacity and timing remain instance properties.' });
      console.log(`Saved ${target.id}`);
    }
    const sources = [];
    for (const [file, cached] of sourceBytes) {
      const bytes = cached ?? await fs.readFile(file), sha256 = hash(bytes);
      const snapshot = `source-files/${sha256}${path.extname(file)}`;
      await fs.writeFile(path.join(root, snapshot), bytes);
      sources.push({ path: file, sha256, snapshot });
    }
    const escape = text => String(text).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
    const gallery = `<!doctype html><meta charset="utf-8"><title>Saved scrapbook assets</title><style>body{font:16px system-ui;background:#181a20;color:white;margin:32px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:20px}article{background:#30343d;padding:16px;border-radius:12px}img{width:100%;height:230px;object-fit:contain;background:#e9e4d8}input{padding:12px;margin-bottom:24px;width:320px}small{display:block;color:#bbb}</style><h1>Saved scrapbook assets</h1><p>Exact local artwork from incentives-rivalry. Separate transparent PNGs with preserved source recipes.</p><input placeholder="Find a person, logo, flag…" oninput="document.querySelectorAll('article').forEach(a=>a.hidden=!a.innerText.toLowerCase().includes(this.value.toLowerCase()))"><main>${assets.map(a=>`<article><a href="${escape(a.file)}"><img src="${escape(a.file)}"></a><h3>${escape(a.label)}</h3><small>${escape(a.id)} · ${a.pixel_width}×${a.pixel_height}</small></article>`).join('')}</main>`;
    await fs.writeFile(path.join(root, 'catalog.html'), gallery);
    await fs.copyFile(input, path.join(root, 'capture-spec.json'));
    const files = [];
    async function inventory(dir) {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) await inventory(file);
        else files.push({ path: path.relative(root, file), sha256: hash(await fs.readFile(file)) });
      }
    }
    await inventory(root);
    const manifest = { schema_version: 1, recipe: 'computed-dom-artwork-v1', id: spec.id, created_at: new Date().toISOString(),
      reference_time: spec.time, source_html: sourceFile, browser_version: browser.version(), device_scale_factor: 2,
      contract: { immutable: true, semantic_objects_separate: true, artwork_authority: 'images', scene_authority: 'destination timeline',
        source_refresh: 'new version; explicit replacement; never overwrite', motion_parity: 'not certified',
        fonts: 'Computed family recorded; system fonts are environment dependencies. Saved PNGs remain authoritative.' },
      assets, sources, files };
    await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(await verify(root), null, 2));
  } finally { await browser.close(); }
}
