import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

// Scripts that draw a project's timeline in Chrome must pick each clip's source the way the editor
// does (frameCheckRenderSources). Drawing an HDR original directly lets Chrome tone-map it and the
// renderer decode it again, so live footage turns over-red next to its cut-outs (retro
// docs/audits/2026-10-28-one-click-effects-retro-part-2.md, git-ignored).
for (const script of ["scripts/frame-state.ts", "scripts/render-preview.ts"]) {
  test(`${script} draws clips from the sources the editor shows`, () => {
    const source = fs.readFileSync(script, "utf8");
    assert.match(source, /frameCheckRenderSources\(/);
    assert.match(source, /buildCompositionElements\(drawn\.clips/);
  });
}
