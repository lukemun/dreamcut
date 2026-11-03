import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
// Input is an explicitly prepared, checksum-verified release directory, not PATH.
export async function bundleWindowsMediaTools(destination) {
  const source = process.env.DREAMCUT_WINDOWS_MEDIA_DIR;
  if (!source || !path.isAbsolute(source)) throw Error('Set DREAMCUT_WINDOWS_MEDIA_DIR to the verified Windows FFmpeg directory.');
  for (const name of ['ffmpeg.exe','ffprobe.exe']) await fs.access(path.join(source,'bin',name));
  await fs.mkdir(destination,{recursive:true});
  await fs.cp(source,destination,{recursive:true});
  const files=[];
  async function walk(dir) { for (const entry of await fs.readdir(dir,{withFileTypes:true})) {
    const file=path.join(dir,entry.name);
    if(entry.isDirectory()) await walk(file);
    else if(entry.isFile()) files.push({path:path.relative(destination,file),bundledSha256:createHash('sha256').update(await fs.readFile(file)).digest('hex')});
    else throw Error('Windows media bundle may not contain links.');
  }}
  await walk(destination);
  const run=args=>execFileSync(path.join(destination,'bin','ffmpeg.exe'),args,{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
  await fs.writeFile(path.join(destination,'manifest.json'),JSON.stringify({platform:'win32',arch:process.arch,distributionReady:false,purpose:'Local qualification only; distribution source/notices audit remains required.',version:run(['-version']).split('\n')[0],configuration:run(['-buildconf']),files},null,2));
}
