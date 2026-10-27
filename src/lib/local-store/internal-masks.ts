import fs from 'node:fs';
import path from 'node:path';
import {projectDir, projectMediaDir} from './paths';

/** Keep historical URLs/source references valid without exposing working frames as assets. */
export function internalGridMatteDirectory(projectId: string): string {
  const destination = path.join(projectDir(projectId), 'instruments', 'grid-mattes');
  const legacy = path.join(projectMediaDir(projectId), 'grid-mattes');
  fs.mkdirSync(path.dirname(destination), {recursive: true});
  if (fs.existsSync(legacy)) {
    const stat = fs.lstatSync(legacy);
    if (stat.isSymbolicLink()) {
      if (fs.realpathSync(legacy) !== fs.realpathSync(destination)) throw new Error('Unexpected grid matte compatibility link');
      return destination;
    }
    // Do not merge or overwrite two independent sets of processing evidence.
    if (fs.existsSync(destination)) throw new Error('Both internal and legacy grid matte directories exist');
    fs.renameSync(legacy, destination);
  } else {
    fs.mkdirSync(destination, {recursive: true});
  }
  fs.mkdirSync(path.dirname(legacy), {recursive: true});
  fs.symlinkSync(path.relative(path.dirname(legacy), destination), legacy, 'dir');
  return destination;
}
