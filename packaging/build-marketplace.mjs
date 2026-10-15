#!/usr/bin/env node
/**
 * Build the DreamCut plugin marketplace: the contents of a small public git repository that Claude Code
 * and Codex add as a marketplace. It lists one plugin, `dreamcut`, installed from the `dreamcut` npm
 * package (the launcher, which is also the plugin; packaging/pack-launcher.mjs). Both apps read
 * `.claude-plugin/marketplace.json`. Output: dist/marketplace/. Pushing it to the public repository is the
 * owner's step.
 *
 *   node packaging/build-marketplace.mjs [--local] [--repo owner/name]
 *
 * --local lists the packed plugin from dist/npm/dreamcut instead of npm, for testing before publishing.
 * --repo names the public repository in the README (default lukemun/dreamcut-plugins).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const local = process.argv.includes('--local');
const repoIndex = process.argv.indexOf('--repo');
const marketplaceRepo = repoIndex > 0 ? process.argv[repoIndex + 1] : 'lukemun/dreamcut-plugins';
const out = path.join(repo, 'dist', local ? 'marketplace-local' : 'marketplace');
const plugin = JSON.parse(await fs.readFile(path.join(repo, 'packaging', 'launcher', '.claude-plugin', 'plugin.json'), 'utf8'));

await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(path.join(out, '.claude-plugin'), { recursive: true });
if (local) await fs.cp(path.join(repo, 'dist', 'npm', 'dreamcut'), path.join(out, 'plugins', 'dreamcut'), { recursive: true });
const marketplace = {
  name: 'dreamcut',
  owner: { name: 'DreamCut' },
  metadata: { description: 'DreamCut: edit video locally from your coding agent.' },
  plugins: [{
    name: 'dreamcut',
    description: plugin.description,
    category: 'productivity',
    // Without a version, installs and updates take the latest published package.
    source: local ? './plugins/dreamcut' : { source: 'npm', package: 'dreamcut' },
  }],
};
await fs.writeFile(path.join(out, '.claude-plugin', 'marketplace.json'), `${JSON.stringify(marketplace, null, 2)}\n`);
await fs.writeFile(path.join(out, 'README.md'), `# DreamCut plugins

Edit video with DreamCut from Claude Code or Codex. DreamCut runs on your computer and your footage never
leaves it.

Claude Code:

\`\`\`
claude plugin marketplace add ${marketplaceRepo}
claude plugin install dreamcut@dreamcut
\`\`\`

Codex:

\`\`\`
codex plugin marketplace add ${marketplaceRepo}
codex plugin add dreamcut@dreamcut
\`\`\`

Then ask your agent to open DreamCut.
`);
console.log(`Wrote ${path.relative(repo, out)}/`);
