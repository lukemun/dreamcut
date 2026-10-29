// Fails when instructions every DreamCut user's agent loads carry one checkout's owner-only rules.
// AGENTS.md and the skills ship with the public repository; a maintainer's own agreements and private
// paths belong in the git-ignored AGENTS.local.md (see AGENTS.md "Working rules").
//
//   node scripts/check-owner-text.mjs            # tracked working files
//   node scripts/check-owner-text.mjs --staged   # what the next commit holds
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Files agents load as instructions: AGENTS.md, skills, the references skills send them to, and shared standards. */
export const INSTRUCTION_FILE = /^(?:AGENTS\.md|\.agents\/skills\/[^/]+\/(?:SKILL\.md|references\/.+\.md)|docs\/standards\/.+\.md)$/;

export const OWNER_RULES = [
  [/owner working agreements|#owner-working-agreements/i, 'the owner working agreements'],
  [/\(owner, \d{4}-\d{2}-\d{2}\)/, 'an owner-dated rule'],
  [/this private repository/i, 'the private repository'],
  [/feature freeze/i, 'a feature freeze'],
  [/\.\.\/dreamcut-cloud\/|editor-project-status\.md/, 'a private checkout path (link docs/project-status.md instead)'],
];

export function ownerTextFindings(file, text) {
  if (!INSTRUCTION_FILE.test(file)) return [];
  return text.split('\n').flatMap((line, index) => OWNER_RULES
    .filter(([pattern]) => pattern.test(line))
    .map(([, what]) => `${file}:${index + 1}: ${what}`));
}

function main() {
  const staged = process.argv.includes('--staged');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const files = git('ls-files', '-z', ...(staged ? ['--cached'] : [])).split('\0').filter(file => INSTRUCTION_FILE.test(file));
  const findings = files.flatMap(file => {
    const text = staged ? git('show', `:${file}`) : fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    return ownerTextFindings(file, text);
  });
  if (findings.length) {
    console.error(`Owner-only instructions in files every user's agent reads:\n${findings.join('\n')}\nMove them to AGENTS.local.md (git-ignored).`);
    process.exitCode = 1;
  } else console.log(`Owner-text check passed: ${files.length} instruction files.`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) main();
