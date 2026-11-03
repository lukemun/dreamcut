/** One fresh process per trial, so worker reuse cannot hide in the caller. */
import fs from 'node:fs';
import { createBrowserStillSession } from '../src/lib/render/browser-renderer';
import { createWarmStillSession } from '../src/lib/render/warm-still-worker';

async function main() {
  const [mode, requestPath, output] = process.argv.slice(2);
  const request = JSON.parse(fs.readFileSync(requestPath, 'utf8'));
  const started = performance.now();
  const session = mode === 'warm' ? await createWarmStillSession(process.cwd(), request.baseUrl) : await createBrowserStillSession();
  try {
    for (const frame of [0, 15]) await session.render({ ...request, frame, output: `${output}-${frame}.png` });
    console.log(JSON.stringify({ mode, elapsedMs: performance.now() - started, stats: session.stats }));
  } finally { await session.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
