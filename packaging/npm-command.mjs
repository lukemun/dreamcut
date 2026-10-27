/**
 * How to run npm from a packaging script. On Windows `npm` is a .cmd shim that Node will not spawn without a
 * shell, so run npm's own entry point with this Node instead; that also keeps paths with spaces intact.
 */
import fs from 'node:fs';
import path from 'node:path';

export function npmCommand(args) {
  if (process.platform !== 'win32') return ['npm', args];
  const cli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!fs.existsSync(cli)) throw new Error(`npm was not found next to Node (${cli}).`);
  return [process.execPath, [cli, ...args]];
}
