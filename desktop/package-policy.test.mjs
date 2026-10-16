import test from 'node:test';
import path from 'node:path';
import assert from 'node:assert/strict';
import { packageInput, relativePackageLink } from './package-policy.mjs';
test('package inputs exclude local data, secrets and generated caches', () => {
 assert.equal(packageInput('node_modules/.cache/webpack/private-render.pack'),false);
 for (const name of ['projects/demo/timeline.json','analysis/log.json','.env.local','private/key','catalogs/music/audio/a.mp3','.next-desktop/cache/a','node_modules/dependency/.env','src/private/a']) assert.equal(packageInput(name),false,name);
 for (const name of ['node_modules/next/package.json','src/lib/gpu-preview/worker.ts','public/font.woff2','.next-desktop/server/app.js']) assert.equal(packageInput(name),true,name);
 assert.throws(()=>packageInput('../private/a'));
 assert.throws(()=>packageInput('/etc/passwd'));
});
test('dependency links remain relocatable and cannot leave the source root', () => {
 assert.equal(relativePackageLink(path.resolve('/repo'),path.resolve('/repo/node_modules/next'),path.resolve('/repo/node_modules/.pnpm/next')),path.join('.pnpm','next'));
 assert.throws(()=>relativePackageLink('/repo','/repo/node_modules/next','/outside/next'));
});
