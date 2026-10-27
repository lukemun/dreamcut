import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { removeSourceMaps, sentryCli, shippedSourceMaps, uploadSourceMaps } from './source-maps.mjs';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const write = async (root, file, text) => { await fs.mkdir(path.dirname(path.join(root, file)), { recursive: true }); await fs.writeFile(path.join(root, file), text); };

test('maps are deleted with the comments that point at them; third-party maps are left alone', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'source-maps-'));
  await write(root, 'workers/job.mjs', 'console.log(1);\n//# sourceMappingURL=job.mjs.map\n\n//# debugId=abc\n');
  await write(root, 'workers/job.mjs.map', '{}');
  await write(root, '.next-desktop/static/chunks/a.js', 'x();\n//# sourceMappingURL=a.js.map');
  await write(root, '.next-desktop/static/chunks/a.js.map', '{}');
  await write(root, 'mcp/node_modules/dep/index.js.map', '{}');
  assert.deepEqual((await shippedSourceMaps(root)).sort(), ['.next-desktop/static/chunks/a.js.map', 'workers/job.mjs.map']);
  assert.equal(await removeSourceMaps(root), 2);
  assert.deepEqual(await shippedSourceMaps(root), []);
  assert.equal(await fs.readFile(path.join(root, 'workers/job.mjs'), 'utf8'), 'console.log(1);\n\n//# debugId=abc\n');
  assert.equal(await fs.readFile(path.join(root, '.next-desktop/static/chunks/a.js'), 'utf8'), 'x();\n');
  assert.ok(existsSync(path.join(root, 'mcp/node_modules/dep/index.js.map')));
});

test('upload injects debug IDs, then uploads under the release with the token only in the child environment', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'source-maps-upload-'));
  await fs.mkdir(path.join(root, 'workers'));
  await fs.mkdir(path.join(root, 'mcp'));
  const calls = [];
  const present = uploadSourceMaps(root, { token: 'tok', org: 'org', project: 'proj', release: 'dreamcut@1.2.3', cli: '/bin/sentry-cli', run: (cmd, args, options) => calls.push({ cmd, args, token: options.env.SENTRY_AUTH_TOKEN }) });
  assert.deepEqual(present, ['workers', 'mcp']);
  assert.deepEqual(calls.map(call => call.args.slice(0, 2)), [['sourcemaps', 'inject'], ['sourcemaps', 'upload']]);
  assert.ok(calls[1].args.includes('dreamcut@1.2.3') && calls.every(call => call.token === 'tok'));
  assert.equal(process.env.SENTRY_AUTH_TOKEN === 'tok', false);
});

test('the Sentry command-line tool installed with @sentry/nextjs is found', () => {
  assert.ok(existsSync(sentryCli(repository)));
});

test('a dropped source map upload is retried, and the third failure stops the build', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'maps-retry-'));
  await fs.mkdir(path.join(root, 'workers'));
  let uploads = 0;
  const flaky = failures => (cmd, args) => { if (args[1] === 'upload' && ++uploads <= failures) throw new Error('API request failed'); };
  uploadSourceMaps(root, { token: 't', org: 'o', project: 'p', release: 'r', cli: '/bin/sentry-cli', dirs: ['workers'], run: flaky(2) });
  assert.equal(uploads, 3);
  uploads = 0;
  assert.throws(() => uploadSourceMaps(root, { token: 't', org: 'o', project: 'p', release: 'r', cli: '/bin/sentry-cli', dirs: ['workers'], run: flaky(3) }), /API request failed/);
  assert.equal(uploads, 3);
  await fs.rm(root, { recursive: true, force: true });
});
