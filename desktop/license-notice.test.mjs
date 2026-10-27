import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { LICENSE_NOTICE, appendLicenseNotice } from './license-notice.mjs';

test('the licence notice ends every shipped code file once, leaving dependencies and other files alone', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'notice-'));
  await fs.mkdir(path.join(dir, '.next-desktop', 'static'), { recursive: true });
  await fs.mkdir(path.join(dir, 'node_modules', 'pkg'), { recursive: true });
  await fs.writeFile(path.join(dir, '.next-desktop', 'static', 'chunk.js'), '"use strict";var a=1;\n//# sourceMappingURL=chunk.js.map');
  await fs.writeFile(path.join(dir, 'bin.mjs'), '#!/usr/bin/env node\nconsole.log(1);\n');
  await fs.writeFile(path.join(dir, 'worker.ts'), 'export const x = 1;\n');
  await fs.writeFile(path.join(dir, 'node_modules', 'pkg', 'index.js'), 'module.exports = 1;\n');
  await fs.writeFile(path.join(dir, 'data.json'), '{}');
  await fs.symlink(path.join(dir, 'node_modules'), path.join(dir, 'linked'), 'dir');

  assert.equal(await appendLicenseNotice(dir), 3);
  assert.equal(await appendLicenseNotice(dir), 0);
  const chunk = await fs.readFile(path.join(dir, '.next-desktop', 'static', 'chunk.js'), 'utf8');
  assert.ok(chunk.startsWith('"use strict";var a=1;\n'), 'positions before the notice are unchanged');
  assert.ok(chunk.endsWith(`${LICENSE_NOTICE}\n`));
  assert.ok((await fs.readFile(path.join(dir, 'bin.mjs'), 'utf8')).startsWith('#!/usr/bin/env node\n'));
  assert.equal(await fs.readFile(path.join(dir, 'node_modules', 'pkg', 'index.js'), 'utf8'), 'module.exports = 1;\n');
  assert.equal(await fs.readFile(path.join(dir, 'data.json'), 'utf8'), '{}');
  assert.match(LICENSE_NOTICE, /^\/\*!.*\*\/$/);
});
