import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

test('review subprocess cannot redirect temporary Git operations into the committing repository', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-hook-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).trim().split(/\s+/)) delete env[key];
  delete env.DREAMCUT_SKIP_CODE_REVIEW_HOOK;
  delete env.OPENEDIT_SKIP_CODE_REVIEW_HOOK;
  const repository = path.join(root, 'repository');
  const temporary = path.join(root, 'temporary.git');
  const bin = path.join(root, 'bin');
  fs.mkdirSync(repository); fs.mkdirSync(bin);
  execFileSync('git', ['init', '-q', repository], { env });
  // The same isolation holds for either reviewer; codex is exercised here, claude below.
  env.DREAMCUT_CODE_REVIEW_TOOL = 'codex';
  fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\n[ -z "$GIT_DIR" ] && [ -z "$GIT_WORK_TREE" ] && [ -z "$GIT_INDEX_FILE" ] || exit 9\n[ "$CODEX_REVIEW_CHILD" = 1 ] || exit 10\ngit init --bare -q "$REVIEW_FIXTURE"\n', { mode: 0o755 });
  execFileSync(process.execPath, [fileURLToPath(new URL('./code-review-hook.mjs', import.meta.url))], {
    cwd: repository,
    env: { ...env, PATH: `${bin}${path.delimiter}${env.PATH}`, REVIEW_FIXTURE: temporary,
      GIT_DIR: path.join(repository, '.git'), GIT_WORK_TREE: repository,
      GIT_INDEX_FILE: path.join(repository, '.git', 'index') },
  });
  assert.equal(execFileSync('git', ['-C', repository, 'rev-parse', '--is-bare-repository'], { env, encoding: 'utf8' }).trim(), 'false');
  assert.equal(execFileSync('git', ['--git-dir', temporary, 'rev-parse', '--is-bare-repository'], { env, encoding: 'utf8' }).trim(), 'true');
});

test('Claude Code reviews by default, read-only and with Opus', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-hook-claude-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).trim().split(/\s+/)) delete env[key];
  for (const key of ['DREAMCUT_SKIP_CODE_REVIEW_HOOK', 'OPENEDIT_SKIP_CODE_REVIEW_HOOK', 'DREAMCUT_CODE_REVIEW_TOOL', 'OPENEDIT_CODE_REVIEW_TOOL', 'DREAMCUT_CODE_REVIEW_MODEL', 'OPENEDIT_CODE_REVIEW_MODEL']) delete env[key];
  const repository = path.join(root, 'repository'), bin = path.join(root, 'bin'), argsFile = path.join(root, 'args');
  fs.mkdirSync(repository); fs.mkdirSync(bin);
  execFileSync('git', ['init', '-q', repository], { env });
  fs.writeFileSync(path.join(repository, 'new.txt'), 'pending\n');
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\n[ "$CODEX_REVIEW_CHILD" = 1 ] || exit 10\nprintf '%s\\n' "$@" > "${argsFile}"\ncat > "${argsFile}.stdin"\n`, { mode: 0o755 });
  execFileSync(process.execPath, [fileURLToPath(new URL('./code-review-hook.mjs', import.meta.url))], { cwd: repository, env: { ...env, PATH: `${bin}${path.delimiter}${env.PATH}` } });
  const args = fs.readFileSync(argsFile, 'utf8');
  assert.match(args, /^-p\n/);
  assert.match(args, /\n--model\nopus\n/);
  // No shell and no editing tools: the hook supplies the diff on stdin.
  assert.doesNotMatch(args, /\n(Bash|Edit|Write)/);
  assert.match(args, /\n--permission-mode\ndefault\n/);
  assert.match(fs.readFileSync(`${argsFile}.stdin`, 'utf8'), /Untracked files \(read them\):\n/);
  fs.writeFileSync(path.join(bin, 'claude'), '#!/bin/sh\nexit 3\n', { mode: 0o755 });
  assert.throws(() => execFileSync(process.execPath, [fileURLToPath(new URL('./code-review-hook.mjs', import.meta.url))], { cwd: repository, env: { ...env, PATH: `${bin}${path.delimiter}${env.PATH}` }, stdio: 'pipe' }), error => error.status === 3);
});

test('Claude review input carries the tracked diff, and only paths when the diff is large', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'review-hook-input-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const env = { ...process.env };
  for (const key of execFileSync('git', ['rev-parse', '--local-env-vars'], { encoding: 'utf8' }).trim().split(/\s+/)) delete env[key];
  for (const key of ['DREAMCUT_SKIP_CODE_REVIEW_HOOK', 'OPENEDIT_SKIP_CODE_REVIEW_HOOK', 'DREAMCUT_CODE_REVIEW_TOOL', 'OPENEDIT_CODE_REVIEW_TOOL']) delete env[key];
  Object.assign(env, { GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.com', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.com' });
  const repository = path.join(root, 'repository'), bin = path.join(root, 'bin'), stdin = path.join(root, 'stdin');
  fs.mkdirSync(repository); fs.mkdirSync(bin);
  const git = (...args) => execFileSync('git', ['-C', repository, '-c', 'core.hooksPath=/dev/null', ...args], { env });
  git('init', '-q'); fs.writeFileSync(path.join(repository, 'a.txt'), 'one\n'); git('add', 'a.txt'); git('commit', '-qm', 'base');
  fs.writeFileSync(path.join(bin, 'claude'), `#!/bin/sh\ncat > "${stdin}"\n`, { mode: 0o755 });
  const hook = () => execFileSync(process.execPath, [fileURLToPath(new URL('./code-review-hook.mjs', import.meta.url))], { cwd: repository, env: { ...env, PATH: `${bin}${path.delimiter}${env.PATH}` }, stdio: 'pipe' });
  fs.writeFileSync(path.join(repository, 'a.txt'), 'two\n'); hook();
  assert.match(fs.readFileSync(stdin, 'utf8'), /^-one\n\+two$/m);
  fs.writeFileSync(path.join(repository, 'a.txt'), 'x'.repeat(400_000) + '\n'); hook();
  const large = fs.readFileSync(stdin, 'utf8');
  assert.match(large, /too large to include/); assert.match(large, /a\.txt/); assert.ok(large.length < 10_000);
  assert.throws(() => execFileSync(process.execPath, [fileURLToPath(new URL('./code-review-hook.mjs', import.meta.url)), 'pre-push'], { cwd: repository, env: { ...env, DREAMCUT_REVIEW_BASE: 'missing-base', PATH: `${bin}${path.delimiter}${env.PATH}` }, stdio: 'pipe' }),
    error => /review base missing-base/.test(String(error.stderr)));
});
