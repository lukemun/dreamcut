import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import test from "node:test";
import { recreatedGuideEffects, resolveGuideEffectMedia } from "./guide";

test("Guide publishes recreation evidence, excluding reference-only candidates and existing curated rows", () => {
  const rows = recreatedGuideEffects();
  assert.equal(new Set(rows.map(row => row.id)).size, rows.length);
  assert.ok(rows.some(row => row.id === "FX-MASK-GLITCH" && row.skill === "mask-glitch"));
  for (const id of ["FX-WHIP-PAN", "FX-FILM-BURN", "FX-CAMERA-FLASH", "FX-BLACKOUT"]) assert.ok(!rows.some(row => row.id === id), `${id} is a boundary transition study, not a construction recipe`);
  assert.ok(!rows.some(row => row.id === "FX-INVERSE-CAPTIONS" || row.id === "FX-08" || row.id === "FX-SCRATCHPAD"));
  for (const row of rows) {
    const artifact = resolveGuideEffectMedia(row.id!);
    assert.ok(artifact);
    assert.ok(fs.statSync(artifact.file).size > 0);
    assert.ok(row.needs?.length);
    assert.ok(row.status === "complete" || row.limitations?.length);
  }
});

test("Guide serves packaged playback proxies rather than evidence masters", () => {
  for (const id of ["FX-MASK-GLITCH", "FX-WHIP-PAN"]) {
    assert.ok(resolveGuideEffectMedia(id)?.file.includes("/public/guide/effects/catalog/"));
    assert.ok(resolveGuideEffectMedia(id)?.file.endsWith("-640-v1.mp4"));
  }
});

test("Guide media identities cannot request arbitrary repository files", () => {
  for (const id of ["../../AGENTS.md", "FX-UNKNOWN", "FX-INVERSE-CAPTIONS", "/etc/passwd"]) {
    assert.equal(resolveGuideEffectMedia(id), null);
  }
});

test("Guide examples that play a proxy show a hashed poster frame from inside the effect", () => {
  const manifest = JSON.parse(fs.readFileSync("public/guide/effects/catalog/proxies.json", "utf8"));
  for (const row of recreatedGuideEffects().filter(row => row.poster)) {
    assert.ok(row.video && row.poster?.startsWith(`catalog/${row.id.toLowerCase()}-`), `${row.id}: poster comes from its own proxy`);
  }
  for (const entry of manifest.entries.filter((entry: { poster?: unknown }) => entry.poster)) {
    const file = `public/guide/effects/catalog/${entry.poster.file}`;
    assert.equal(createHash("sha256").update(fs.readFileSync(file)).digest("hex"), entry.poster.sha256);
    assert.ok(entry.poster.frame > 0 && entry.poster.frame < entry.frames, `${entry.catalog_id}: poster is a frame inside the example, not its first frame`);
  }
});
