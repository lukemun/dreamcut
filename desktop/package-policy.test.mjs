import test from 'node:test';
import path from 'node:path';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import { packageInput, relativePackageLink, shippedSource } from './package-policy.mjs';
test('package inputs exclude local data, secrets and generated caches', () => {
 assert.equal(packageInput('node_modules/.cache/webpack/private-render.pack'),false);
 for (const name of ['projects/demo/timeline.json','analysis/log.json','.env.local','private/key','catalogs/music/audio/a.mp3','catalogs/sfx/audio/licensed/a.wav','catalogs/visual/media/public-domain/a.webm','.next-desktop/cache/a','node_modules/dependency/.env','src/private/a','docs/research/a.md','.agents/hooks/a.mjs','docs/architecture/editor-ui.md','src/lib/gpu-preview/worker.ts','src/app/page.tsx','scripts/prepare-media.ts','scripts/build-prebuilt-runtime.ts','mcp/capability-catalog.mjs','mcp/visual-analysis-cli.ts','.next-desktop/types/app/page.ts','.next-desktop/server/app/page.js.nft.json']) assert.equal(packageInput(name),false,name);
 for (const name of ['node_modules/next/package.json','node_modules/dep/index.ts','src/lib/timeline/handwriting/fonts/caveat/sweeps.json','scripts/beat-grid.py','scripts/setup-matting.mjs','scripts/setup-voice.mjs','scripts/setup-features.mjs','scripts/feature-tools.mjs','scripts/setup-speech.mjs','scripts/doctor.mjs','scripts/audio-enhance-requirements.txt','mcp/server.mjs','mcp/shared-chunk-AB12.mjs','mcp/proposal-schema.json','workers/qc.mjs','prebuilt/gpu-worker.js','public/font.woff2','.next-desktop/server/app.js','.agents/skills/motion-graphics/SKILL.md','docs/standards/pr-review.md','AGENTS.md','catalogs/sfx/catalog.json','catalogs/visual/catalog.json','mcp/worker-crash-watchdog.mjs']) assert.equal(packageInput(name),true,name);
 assert.throws(()=>packageInput('../private/a'));
 assert.throws(()=>packageInput('/etc/passwd'));
});
test('dependency links remain relocatable and cannot leave the source root', () => {
 assert.equal(relativePackageLink(path.resolve('/repo'),path.resolve('/repo/node_modules/next'),path.resolve('/repo/node_modules/.pnpm/next')),path.join('.pnpm','next'));
 assert.throws(()=>relativePackageLink('/repo','/repo/node_modules/next','/outside/next'));
});

test('the release check finds DreamCut source anywhere in a staged package except dependencies', async () => {
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shipped-source-'));
 for (const file of ['src/lib/a.ts','mcp/capability-catalog.mjs','mcp/server.mjs','node_modules/x/src/b.ts','workers/qc.mjs','src/data.json']) { await fs.mkdir(path.dirname(path.join(dir,file)),{recursive:true}); await fs.writeFile(path.join(dir,file),''); }
 assert.deepEqual((await shippedSource(dir)).sort(),[path.join('mcp','capability-catalog.mjs'),path.join('src','lib','a.ts')]);
});
