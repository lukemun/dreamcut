// Read the index, never the working copy or Git's binary-omitting diff format.
export function stagedScanInput(git, maxBytes = 128 * 1024 * 1024) {
  const files = git('diff', '--cached', '--name-only', '--diff-filter=ACMRT', '-z')
    .toString().split('\0').filter(Boolean);
  const chunks = [];
  let bytes = 0;
  for (const file of files) {
    const blob = git('show', `:${file}`);
    bytes += blob.length + 2;
    if (bytes > maxBytes) throw new Error('Staged content exceeds the secret-scan limit; split the commit or keep large assets private.');
    chunks.push(blob, Buffer.from('\n\n'));
  }
  return Buffer.concat(chunks);
}

// Git's textual log parser can omit binary contents, even with --text. Scan
// each distinct stored blob from the outgoing histories instead. Batch only
// between blobs so a multiline credential is never split across scanner calls.
export function* historicalScanInputs(git, revisions, checkPaths, batchBytes = 16 * 1024 * 1024) {
  const seen = new Set();
  let chunks = [];
  let bytes = 0;
  for (const commit of git('rev-list', ...revisions, '--').toString().trim().split('\n').filter(Boolean)) {
    const entries = git('ls-tree', '-r', '-z', commit).toString().split('\0').filter(Boolean).map(row => {
      const tab = row.indexOf('\t');
      const [mode, type, oid] = row.slice(0, tab).split(' ');
      if (tab < 0 || type !== 'blob') throw new Error('Unscannable Git entry; submodules must be reviewed separately before publication.');
      return { mode, oid, file: row.slice(tab + 1) };
    });
    checkPaths(entries.map(entry => entry.file));
    for (const { oid } of entries) {
      if (seen.has(oid)) continue;
      seen.add(oid);
      const blob = git('cat-file', 'blob', oid);
      if (bytes && bytes + blob.length + 2 > batchBytes) {
        yield Buffer.concat(chunks);
        chunks = [];
        bytes = 0;
      }
      chunks.push(blob, Buffer.from('\n\n'));
      bytes += blob.length + 2;
    }
  }
  if (bytes) yield Buffer.concat(chunks);
}
