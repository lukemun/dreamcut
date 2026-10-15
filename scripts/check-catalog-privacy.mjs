// Fails when a tracked media catalog carries the creator's personal material. Personal
// media belongs in the profile library (<profile>/library/<kind>/), never in the shared
// catalogs this repository publishes.
//
//   node --import tsx scripts/check-catalog-privacy.mjs            # tracked working files
//   node --import tsx scripts/check-catalog-privacy.mjs --staged   # what the next commit holds
//
// Published docs, skills, Guide manifests and site source (TEXT_FILE) are also scanned for the
// private terms, line by line.
// An entry fails when it has a `personal` marker, project-extraction or local-machine
// provenance, or a creator-specific term from <profile>/private-terms.txt (one term per
// line, whole-word and case-insensitive, # comments). The terms file stays in the profile
// and is never committed; --terms-file <path> reads another list.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { profileDir } from '../src/lib/local-store/profile-dir.ts';

export const CATALOG_FILE = /^(?:image-catalog|visual-catalog|music-catalog|sfx-library)\/.+\.json$/;
// Published docs, skills, Guide/preview manifests, site and source text (incl. tests): scanned for private terms
// only, since they legitimately mention local paths and project workflows.
export const TEXT_FILE = /^(?:docs\/.+|public\/(?:guide|recipe-previews)\/.+|site\/(?:src|public)\/.+|\.agents\/.+|mcp\/.+|src\/.+|scripts\/.+|README|AGENTS|[^/]+-CODEX)\.(?:md|json|html|ts|tsx|mjs|txt)$/;

const PROVENANCE_RULES = [
  [/project extraction/i, 'project-extraction provenance'],
  [/promoted from (?:a )?project\b/i, 'project-extraction provenance'],
  [/dreamcut:\/\/projects\//i, 'project-extraction provenance'],
  [/file:\/\//i, 'local file provenance'],
  [/(?:^|[^A-Za-z0-9])(?:\/Users\/|\/home\/|[A-Za-z]:\\\\Users\\\\)/, 'local file provenance'],
  [/\b(?:localhost|127\.0\.0\.1)\b/i, 'local editor provenance'],
];

export function parseTerms(text) {
  return [...new Set(text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line && !line.startsWith('#')))];
}

function termPattern(term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'i');
}

/** Private-term findings for one published text file: [{ file, id: 'line N', reason }]. */
export function textFindings(file, text, terms) {
  const patterns = terms.map((term) => [term, termPattern(term)]);
  const findings = [];
  text.split(/\r?\n/).forEach((line, index) => {
    for (const [term, pattern] of patterns) if (pattern.test(line)) findings.push({ file, id: `line ${index + 1}`, reason: `private term "${term}"` });
  });
  return findings;
}

/** Every finding for one catalog document: [{ file, id, reason }]. */
export function catalogFindings(file, document, terms) {
  const patterns = terms.map((term) => [term, termPattern(term)]);
  const findings = [];
  const entries = Object.entries(document ?? {}).flatMap(([key, value]) => Array.isArray(value)
    ? value.map((entry, index) => [entry && typeof entry === 'object' && typeof entry.id === 'string' ? entry.id : `${key}[${index}]`, entry])
    : []);
  if (!entries.length) entries.push(['(document)', document]);
  for (const [id, entry] of entries) {
    const text = JSON.stringify(entry);
    const reasons = new Set();
    if (entry && typeof entry === 'object' && 'personal' in entry) reasons.add('personal marker');
    for (const [pattern, reason] of PROVENANCE_RULES) if (pattern.test(text)) reasons.add(reason);
    for (const [term, pattern] of patterns) if (pattern.test(text)) reasons.add(`private term "${term}"`);
    for (const reason of reasons) findings.push({ file, id, reason });
  }
  return findings;
}

/** Index contents for many paths through one `git cat-file --batch` process. */
function stagedBlobs(files) {
  const output = execFileSync('git', ['cat-file', '--batch'], { input: files.map((file) => `:${file}`).join('\n') + '\n', maxBuffer: 1024 * 1024 * 1024 });
  const blobs = new Map();
  let offset = 0;
  for (const file of files) {
    const end = output.indexOf(10, offset);
    const header = output.subarray(offset, end).toString();
    offset = end + 1;
    if (header.endsWith(' missing')) continue; // Deleted in the index.
    const size = Number(header.split(' ')[2]);
    blobs.set(file, output.subarray(offset, offset + size).toString('utf8'));
    offset += size + 1;
  }
  return blobs;
}

function main() {
  const staged = process.argv.includes('--staged');
  const termsIndex = process.argv.indexOf('--terms-file');
  const termsFile = termsIndex >= 0 ? process.argv[termsIndex + 1] : path.join(profileDir(), 'private-terms.txt');
  const terms = fs.existsSync(termsFile) ? parseTerms(fs.readFileSync(termsFile, 'utf8')) : [];
  const git = (...args) => execFileSync('git', args, { maxBuffer: 256 * 1024 * 1024 }).toString();
  const tracked = git('ls-files', '-z', ...(staged ? ['--cached'] : [])).split('\0');
  const files = tracked.filter((file) => CATALOG_FILE.test(file));
  const textFiles = tracked.filter((file) => !CATALOG_FILE.test(file) && TEXT_FILE.test(file));
  const stagedText = staged ? stagedBlobs([...files, ...textFiles]) : null;
  const read = (file) => {
    if (stagedText) return stagedText.get(file) ?? null;
    try {
      return fs.readFileSync(file, 'utf8');
    } catch {
      return null; // Deleted in the working tree.
    }
  };
  const findings = [];
  if (terms.length) for (const file of textFiles) {
    const text = read(file);
    if (text !== null) findings.push(...textFindings(file, text, terms));
  }
  for (const file of files) {
    const text = read(file);
    if (text === null) continue;
    let document;
    try { document = JSON.parse(text); } catch { findings.push({ file, id: '(document)', reason: 'not valid JSON' }); continue; }
    findings.push(...catalogFindings(file, document, terms));
  }
  if (findings.length) {
    const lines = findings.slice(0, 50).map(({ file, id, reason }) => `  ${file} ${id}: ${reason}`);
    if (findings.length > 50) lines.push(`  …and ${findings.length - 50} more`);
    console.error(`Personal material in tracked catalogs or published docs:\n${lines.join('\n')}\nMove catalog entries to the profile library: pnpm personal-library-move --kind <images|visuals|music|sfx> --ids <ids> --apply. Reword doc, skill and Guide text generically; move or replace media that shows the creator.`);
    process.exitCode = 1;
    return;
  }
  const note = terms.length ? `${terms.length} private terms` : `no private terms file at ${termsFile}`;
  console.log(`Catalog privacy check passed: ${files.length} catalog files, ${textFiles.length} published text files, ${note}.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
