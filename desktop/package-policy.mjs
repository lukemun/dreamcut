import path from 'node:path';
const roots = new Set(['node_modules', 'src', 'public', '.next-desktop', 'scripts', 'mcp']);
export function packageInput(relative) {
  const normalized = path.normalize(relative);
  if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${path.sep}`)) throw new Error('Dependency escaped build root');
  const parts = normalized.split(path.sep);
  if (parts.some(part => part === '.env' || part.startsWith('.env.') || part === 'private' || part === 'cache' || part === '.cache')) return false;
  // Agent instructions an npx-installed agent reads through capability_catalog (skills and the docs they link).
  if (parts[0] === 'docs' && ['effects', 'standards', 'architecture'].includes(parts[1])) return true;
  if (parts[0] === '.agents' && parts[1] === 'skills') return true;
  if (parts.length === 1 && parts[0] === 'AGENTS.md') return true;
  return roots.has(parts[0]);
}
export function relativePackageLink(sourceRoot, sourceFile, target) {
  const resolved = path.resolve(path.dirname(sourceFile), target);
  if (!resolved.startsWith(sourceRoot + path.sep)) throw new Error('Dependency symlink escaped build root');
  // Normalize absolute development links into relocatable package links.
  return path.relative(path.dirname(sourceFile), resolved);
}
