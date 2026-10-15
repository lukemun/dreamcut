import fs from 'node:fs/promises';
import path from 'node:path';

export async function relocatePackageLinks(resources, stage) {
  const omittedLinks = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(file);
      else if (entry.isSymbolicLink()) {
        const target = await fs.readlink(file);
        let resolved = path.resolve(path.dirname(file), target);
        for (const [from, to] of [['shell', 'app'], ['service', 'service']]) {
          const prefix = path.join(stage, from);
          if (resolved.startsWith(prefix + path.sep)) resolved = path.join(resources, to, path.relative(prefix, resolved));
        }
        if (!resolved.startsWith(resources + path.sep)) throw new Error(`Packaged dependency escapes application: ${path.relative(resources, file)}`);
        await fs.unlink(file);
        await fs.symlink(path.relative(path.dirname(file), resolved), file, await fs.stat(resolved).then(stat=>stat.isDirectory()?'dir':'file',()=> 'file'));
        try { await fs.access(file); } catch (error) {
          if (error.code !== 'ENOENT') throw error;
          // pnpm's shared alias directory contains links to packages not selected
          // by dependency tracing. Do not leave broken aliases in the bundle.
          if (!file.includes(`${path.sep}.pnpm${path.sep}node_modules${path.sep}`)) throw error;
          omittedLinks.push(path.relative(resources, file));
          await fs.unlink(file);
        }
      }
    }
  }
  await walk(path.join(resources, 'app'));
  await walk(path.join(resources, 'service'));
  return omittedLinks;
}
