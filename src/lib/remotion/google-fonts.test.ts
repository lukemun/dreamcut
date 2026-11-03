import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureRequiredRemotionFonts } from './google-fonts';

test('export font gate awaits actual faces, requests only used families, and propagates failures', async () => {
  const old = { document: globalThis.document, window: globalThis.window, FontFace: globalThis.FontFace, fetch: globalThis.fetch };
  let release!: () => void;
  let added = 0;
  let requested = '';
  try {
    Object.assign(globalThis, {
      document: { fonts: { add: () => { added++; } } },
      window: { setTimeout, clearTimeout },
      FontFace: class { load() { return new Promise<void>(resolve => { release = resolve; }); } },
      fetch: async (url: string) => { requested = url; return { ok: true, text: async () => "@font-face {font-family: 'Teko';font-weight: 700;src: url(https://example.test/teko.woff2) format('woff2');}" }; },
    });
    let ready = false;
    const loading = ensureRequiredRemotionFonts(['Teko']).then(() => { ready = true; });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(ready, false);
    assert.match(requested, /family=Teko/);
    assert.doesNotMatch(requested, /family=Inter/);
    release(); await loading;
    assert.equal(added, 1);
    Object.assign(globalThis, { fetch: async () => ({ ok: false, status: 503 }) });
    await assert.rejects(ensureRequiredRemotionFonts(['Lora']), /503/);
    await assert.rejects(ensureRequiredRemotionFonts(['not a registered font']), /Unregistered/);
  } finally { Object.assign(globalThis, old); }
});
