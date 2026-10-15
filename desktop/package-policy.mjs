import path from 'node:path';
const roots = new Set(['node_modules', 'src', 'public', '.next-desktop', 'scripts', 'mcp']);
export function packageInput(relative) {
  const normalized = path.normalize(relative);
  if (path.isAbsolute(normalized) || normalized === '..' || normalized.startsWith(`..${path.sep}`)) throw new Error('Dependency escaped build root');
  const parts = normalized.split(path.sep);
  if (parts.some(part => part === '.env' || part.startsWith('.env.') || part === 'private' || part === 'cache' || part === '.cache')) return false;
  if (parts[0] === 'docs' && parts[1] === 'effects') return true;
  return roots.has(parts[0]);
}
export function relativePackageLink(sourceRoot, sourceFile, target) {
  const resolved = path.resolve(path.dirname(sourceFile), target);
  if (!resolved.startsWith(sourceRoot + path.sep)) throw new Error('Dependency symlink escaped build root');
  // Normalize absolute development links into relocatable package links.
  return path.relative(path.dirname(sourceFile), resolved);
}
