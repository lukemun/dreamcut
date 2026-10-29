import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { featureToolEnv, featureToolPaths, featureToolsDir } from './feature-tools.mjs';
import { startFeatureSetup } from './setup-features.mjs';

test('installed tools sit after the system PATH, and Python and MFA are named explicitly', () => {
  assert.equal(featureToolsDir('darwin', {}, '/Users/demo'), '/Users/demo/Library/Caches/DreamCut/tools', 'no space in the path, unlike Application Support');
  const mac = featureToolEnv({ PATH: '/opt/homebrew/bin:/usr/bin' }, 'darwin', '/Users/demo');
  assert.equal(mac.PATH, '/opt/homebrew/bin:/usr/bin:/Users/demo/Library/Caches/DreamCut/tools/envs/tools/bin', "a creator's own FFmpeg (with vid.stab) stays first");
  assert.equal(mac.MFA_BIN, '/Users/demo/Library/Caches/DreamCut/tools/envs/mfa/bin/mfa');
  assert.equal(mac.DREAMCUT_PYTHON, '/Users/demo/Library/Caches/DreamCut/tools/envs/tools/bin/python');
  assert.deepEqual(featureToolEnv({ PATH: mac.PATH, MFA_BIN: '/mine/mfa', DREAMCUT_PYTHON: '/mine/python' }, 'darwin', '/Users/demo'), {}, 'idempotent, and explicit settings win');
  const windows = featureToolEnv({ Path: 'C:\\Windows', LOCALAPPDATA: 'C:\\Users\\demo\\AppData\\Local' }, 'win32', 'C:\\Users\\demo');
  assert.ok(windows.Path?.startsWith('C:\\Windows'), 'Windows keeps its own PATH key and order');
  const paths = featureToolPaths('win32', { LOCALAPPDATA: 'C:\\Users\\demo\\AppData\\Local' }, 'C:\\Users\\demo');
  assert.ok(paths.program('ffmpeg').endsWith(path.join('envs', 'tools', 'Library', 'bin', 'ffmpeg.exe')));
  assert.ok(paths.mfaBin.endsWith(path.join('envs', 'mfa', 'Scripts', 'mfa.exe')));
});

test('the background setup starts only when something is missing, not while one runs or just failed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'feature-setup-'));
  const env = { ...process.env, DREAMCUT_TOOLS_DIR: dir };
  const state = steps => fs.writeFileSync(path.join(dir, 'setup-state.json'), JSON.stringify({ version: 1, steps: {}, ...steps }));
  try {
    assert.equal(startFeatureSetup({ env: { ...env, DREAMCUT_FEATURE_SETUP: '0' } }), false, 'turned off');
    state({ pid: process.pid });
    assert.equal(startFeatureSetup({ env }), false, 'one is already running');
    state({ finished_at: new Date().toISOString() });
    assert.equal(startFeatureSetup({ env }), false, 'a run that just ended waits before retrying');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a git install finds what `dreamcut setup` installed, after its own programs', async () => {
  const { runtimeEnvDefaults } = await import('../mcp/editor-runtime.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'checkout-'));
  const tools = fs.mkdtempSync(path.join(os.tmpdir(), 'checkout-tools-'));
  try {
    const env = { PATH: '/opt/homebrew/bin:/usr/bin', DREAMCUT_TOOLS_DIR: tools };
    const paths = featureToolPaths(process.platform, env);
    const before = runtimeEnvDefaults(root, env);
    assert.deepEqual(before.PATH.split(path.delimiter).slice(0, 2), ['/opt/homebrew/bin', '/usr/bin'], "the system's programs stay first");
    assert.ok(before.PATH.includes(paths.pathDirs[0]), "setup's programs follow");
    assert.equal(before.DREAMCUT_PYTHON, undefined, 'python3 stays the default until setup installed one');
    assert.equal(before.MFA_BIN, undefined, 'mfa stays the default until setup installed one');
    fs.mkdirSync(path.dirname(paths.program('python')), { recursive: true });
    fs.writeFileSync(paths.program('python'), '');
    assert.equal(runtimeEnvDefaults(root, env).DREAMCUT_PYTHON, paths.program('python'));
    assert.equal(runtimeEnvDefaults(root, env).DREAMCUT_DEFAULT_PROJECTS_DIR, undefined, 'a checkout keeps its own project folder');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(tools, { recursive: true, force: true });
  }
});

test("an installed runtime's own FFmpeg comes first on PATH", async () => {
  const { runtimeEnvDefaults } = await import('../mcp/editor-runtime.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'runtime-media-'));
  try {
    fs.writeFileSync(path.join(root, 'desktop-next-config.json'), '{}');
    const env = { PATH: '/opt/homebrew/bin:/usr/bin', HOME: os.homedir() };
    assert.ok(!runtimeEnvDefaults(root, env).PATH.includes(path.join(root, 'media-tools')), 'no shipped FFmpeg, no entry');
    fs.mkdirSync(path.join(root, 'media-tools', 'bin'), { recursive: true });
    const dirs = runtimeEnvDefaults(root, env).PATH.split(path.delimiter);
    assert.equal(dirs[0], path.join(root, 'media-tools', 'bin'));
    assert.equal(dirs[1], '/opt/homebrew/bin', 'then the system, then the setup tools');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
