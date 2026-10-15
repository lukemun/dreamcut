import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { inspectProjectFolder, rememberProject, rememberedProject } from './project-opening.mjs';

test('native project selection preserves files and supports Unicode and spaces in parent paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-open-'));
  try {
    const folder = path.join(root, 'My films — été', 'my-project');
    await fs.mkdir(folder, { recursive: true });
    const original = '{"elements":[],"fps":30}\n';
    await fs.writeFile(path.join(folder, 'timeline.json'), original);
    const target = await inspectProjectFolder(path.join(folder, 'timeline.json'));
    assert.equal(target.projectId, 'my-project');
    assert.equal(target.projectsRoot, await fs.realpath(path.dirname(folder)));
    assert.equal(await fs.readFile(path.join(folder, 'timeline.json'), 'utf8'), original);
    await rememberProject(path.join(root, 'settings'), target);
    assert.deepEqual(await rememberedProject(path.join(root, 'settings')), target);
    await fs.rm(folder, { recursive: true });
    assert.equal(await rememberedProject(path.join(root, 'settings')), null);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('native opening rejects a missing or malformed timeline and unsupported project identifiers', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-invalid-'));
  try {
    await assert.rejects(inspectProjectFolder(root), /readable timeline/);
    await fs.writeFile(path.join(root, 'timeline.json'), '[]');
    await assert.rejects(inspectProjectFolder(root), /JSON object/);
    await fs.writeFile(path.join(root, 'timeline.json'), '{broken');
    await assert.rejects(inspectProjectFolder(root), /readable timeline/);
    const invalid = path.join(root, 'a project');
    await fs.mkdir(invalid);
    await assert.rejects(inspectProjectFolder(invalid), /folder name/);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});


test('concurrent remembered-project writes stay atomic and preserve existing temporary paths', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'dreamcut-remember-race-'));
  try {
    const settings = path.join(root, 'settings');
    await fs.mkdir(settings);
    const original = path.join(root, 'source.txt');
    await fs.writeFile(original, 'unchanged');
    await fs.symlink(original, path.join(settings, 'last-project.json.tmp'));
    const targets = [];
    for (let i = 0; i < 20; i++) {
      const folder = path.join(root, `film-${i}`);
      await fs.mkdir(folder); await fs.writeFile(path.join(folder, 'timeline.json'), '{"elements":[]}');
      targets.push(await inspectProjectFolder(folder));
    }
    await Promise.all(targets.map(target => rememberProject(settings, target)));
    const remembered = await rememberedProject(settings);
    assert.ok(targets.some(target => target.folder === remembered?.folder));
    assert.equal(await fs.readFile(original, 'utf8'), 'unchanged');
    assert.deepEqual((await fs.readdir(settings)).sort(), ['last-project.json', 'last-project.json.tmp']);
    assert.equal((await fs.stat(path.join(settings, 'last-project.json'))).mode & 0o777, 0o600);
    for (const target of targets) assert.equal(await fs.readFile(path.join(target.folder, 'timeline.json'), 'utf8'), '{"elements":[]}');
  } finally { await fs.rm(root, {recursive:true, force:true}); }
});
