import fs from 'node:fs/promises';
import path from 'node:path';

// Every shipped code file ends with the licence notice. It is appended, not prepended, so line and
// column positions (and any source maps made from the build) stay correct; `/*!` survives minifiers.
export const LICENSE_NOTICE = '/*! DreamCut. Copyright 2026 Luke Munro. Licensed under the Apache License, Version 2.0. '
  + 'See LICENSE. */';
const CODE = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts']);

/** Appends the notice to code files under `dir`, skipping node_modules and links. Safe to rerun. */
export async function appendLicenseNotice(dir) {
  let count = 0;
  const walk = async folder => {
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (entry.isDirectory()) { if (entry.name !== 'node_modules') await walk(file); continue; }
      if (!entry.isFile() || !CODE.has(path.extname(entry.name))) continue;
      const text = await fs.readFile(file, 'utf8');
      if (text.trimEnd().endsWith(LICENSE_NOTICE)) continue;
      await fs.writeFile(file, `${text}${text.endsWith('\n') ? '' : '\n'}${LICENSE_NOTICE}\n`);
      count += 1;
    }
  };
  await walk(dir);
  return count;
}
