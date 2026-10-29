import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { historicalScanInputs, stagedScanInput } from './private-file-scan-input.mjs';

// Inspect Git objects, not working files: staging and later deletion must not hide a leak.
const git = (...args) => execFileSync('git', args, { maxBuffer: 128 * 1024 * 1024 });
const staged = process.argv.includes('--staged');
const prePush = process.argv.includes('--pre-push');
const forbidden = /^(?:projects|preprocess|instruments|private|personal|library|social-content|analysis|artifacts|assets|design)\/|^catalogs\/(?:images\/images\/owned|music\/(?:imports|previews)|sfx\/(?:audio|source-manifests))\/|^\.tmp-|^\.agents\/skills\/remotion-best-practices\/|(?:^|\/)__pycache__\/|\.pyc$|(?:^|\/)\.env(?:$|\.(?!example$))|(?:^|\/)\.envrc$|\.(?:pem|key)$/i;
const checkPaths = (files) => {
  // Apply Git's own ignore matcher as well as the hard privacy boundary so that
  // force-adding a local-only recipe, screenshot or upstream skill cannot bypass
  // the policy. --no-index makes this work even for already tracked files.
  const ignored = spawnSync('git', ['check-ignore', '--no-index', '--stdin', '-z'], {
    input: files.join('\0') + (files.length ? '\0' : ''),
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
  if (ignored.error || ![0, 1].includes(ignored.status)) {
    throw new Error('Could not verify ignored-file policy. Run checks from the repository root.');
  }
  const bad = [...new Set([
    ...files.filter(file => forbidden.test(file)),
    ...ignored.stdout.split('\0').filter(Boolean),
  ])];
  if (bad.length) throw new Error(`Private files must not be tracked:\n${bad.join('\n')}`);
};
try {
  // Scan complete outgoing histories, including subsequently deleted files, but not
  // unrelated local recovery/checkpoint refs which are never being uploaded.
  const revisions = prePush
    ? fs.readFileSync(0, 'utf8').trim().split('\n').filter(Boolean).map(line => {
      const fields = line.trim().split(/\s+/);
      const sha = fields[1];
      const remoteSha = fields[3];
      if (!/^[0-9a-f]{40,64}$/.test(remoteSha ?? '')) throw new Error('Invalid remote revision');
      if (!/^[0-9a-f]{40,64}$/.test(sha ?? '')) throw new Error('Invalid pre-push input');
      return /^0+$/.test(sha) ? [] : [sha, ...(/^0+$/.test(remoteSha) ? [] : [`^${remoteSha}`])];
    }).flat()
    : ['HEAD'];
  if (prePush && revisions.length === 0) process.exit(0);
  const baseIndex = process.argv.indexOf('--base');
  if (!prePush && baseIndex >= 0) {
    const base = process.argv[baseIndex + 1];
    if (!/^[0-9a-f]{40,64}$/.test(base ?? '')) throw new Error('Invalid scan base');
    if (!/^0+$/.test(base)) revisions.push(`^${base}`);
  }
  if (staged) {
    checkPaths(git('ls-files', '-z').toString().split('\0').filter(Boolean));
    // Staged catalog JSON must not carry the creator's personal media (see check-catalog-privacy.mjs).
    const stagedFiles = git('diff', '--cached', '--name-only', '-z').toString().split('\0').filter(Boolean);
    if (stagedFiles.some(file => /^catalogs\/(?:images|visual|music|sfx)\/.+\.json$/.test(file))) {
      const privacy = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-catalog-privacy.mjs', '--staged'], { stdio: 'inherit' });
      if (privacy.status !== 0) throw new Error('Catalog privacy check failed. Move personal entries to the profile library before committing.');
    }
    // Instructions every user's agent loads must not carry one checkout's owner-only rules (see check-owner-text.mjs).
    if (stagedFiles.some(file => /^(?:AGENTS\.md|\.agents\/skills\/[^/]+\/SKILL\.md)$/.test(file))) {
      const owner = spawnSync(process.execPath, ['scripts/check-owner-text.mjs', '--staged'], { stdio: 'inherit' });
      if (owner.status !== 0) throw new Error('Owner-text check failed. Move owner-only instructions to AGENTS.local.md before committing.');
    }
  }
  const localTool = path.join(git('rev-parse', '--git-common-dir').toString().trim(), 'tools', 'gitleaks');
  const executable = process.env.GITLEAKS_EXECUTABLE || (fs.existsSync(localTool) ? localTool : 'gitleaks');
  const inputs = staged ? [stagedScanInput(git)] : historicalScanInputs(git, revisions, checkPaths);
  for (const input of inputs) {
    const result = spawnSync(executable, ['stdin', '--redact', '--no-banner'], {
      input,
      stdio: ['pipe', 'inherit', 'inherit'],
    });
    if (result.error) throw new Error('Install Gitleaks 8.30.1 and put it on PATH before committing or pushing.');
    if (result.status !== 0) throw new Error('Secret scan failed. Resolve findings before committing or pushing.');
  }
  console.log('Private-file and secret checks passed.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
