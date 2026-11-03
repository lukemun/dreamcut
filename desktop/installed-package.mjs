import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
export async function fileHash(file) {
  const digest=createHash('sha256');
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest('hex');
}
const within=(root,file)=>file===root || file.startsWith(root+path.sep);
// Read-only artifact audit. No developer checkout paths or private project inputs.
export async function inspectInstalledPackage(appPath) {
  const root=await fs.realpath(appPath);
  if(!root.endsWith('.app')) throw Error('Expected a macOS .app bundle.');
  const resources=path.join(root,'Contents/Resources');
  const release=JSON.parse(await fs.readFile(path.join(resources,'app/release.json'),'utf8'));
  if(release.platform!=='darwin' || !['arm64','x64'].includes(release.arch) || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(release.version)) throw Error('Invalid Mac release metadata.');
  const required=['Contents/Info.plist','Contents/MacOS/DreamCut','Contents/Resources/app/main.mjs','Contents/Resources/app/preload.cjs','Contents/Resources/app/dictation.mjs','Contents/Resources/app/dictation-ipc.mjs','Contents/Resources/service/.next-desktop/BUILD_ID','Contents/Resources/media-tools/bin/ffmpeg','Contents/Resources/media-tools/bin/ffprobe','Contents/Resources/voice/whisper-cli','Contents/Resources/voice/ggml-base.en.bin','Contents/Resources/voice/LICENSE-model.txt','Contents/Resources/voice/LICENSE-whisper.cpp.txt'];
  for(const file of required) {const full=path.join(root,file);if(!(await fs.stat(full)).isFile())throw Error(`Missing packaged file: ${file}`);}
  for(const file of ['Contents/MacOS/DreamCut','Contents/Resources/media-tools/bin/ffmpeg','Contents/Resources/media-tools/bin/ffprobe','Contents/Resources/voice/whisper-cli']) {
    if(((await fs.stat(path.join(root,file))).mode & 0o111)===0) throw Error(`Packaged binary is not executable: ${file}`);
  }
  let bytes=0, files=0;
  const treeHash=createHash("sha256");
  async function walk(directory) {
    for(const item of (await fs.readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const full=path.join(directory,item.name);
      if(item.name==='.git' || item.name==='.env' || item.name.startsWith('.env.') || full===path.join(resources,'service/projects') || item.name==='.codex') throw Error(`Private/development content in package: ${path.relative(root,full)}`);
      if(item.isSymbolicLink()) {
        const link=await fs.readlink(full);
        treeHash.update(JSON.stringify([path.relative(root,full),link]));
        if(path.isAbsolute(link) || !within(root,await fs.realpath(full))) throw Error(`Non-relocatable package link: ${path.relative(root,full)}`);
      } else if(item.isDirectory()) await walk(full);
      else if(item.isFile()){const stat=await fs.stat(full);files++;bytes+=stat.size;treeHash.update(JSON.stringify([path.relative(root,full),stat.mode & 0o777,await fileHash(full)]));}
    }
  }
  await walk(root);
  const voice=JSON.parse(await fs.readFile(path.join(resources,'voice/manifest.json'),'utf8'));
  if(voice.platform!==release.platform || voice.arch!==release.arch)throw Error('Voice architecture mismatch.');
  // Signing mutates native executable bytes. Model bytes must remain identical.
  const model=voice.files.find(item=>item.path==='ggml-base.en.bin');
  if(!model || await fileHash(path.join(resources,'voice',model.path))!==model.sha256)throw Error('Voice model integrity failure.');
  const media=JSON.parse(await fs.readFile(path.join(resources,'media-tools/manifest.json'),'utf8'));
  return {packageSha256:treeHash.digest("hex"),version:release.version,arch:release.arch,channel:release.channel,files,bytes,mediaDistributionReady:media.distributionReady===true,buildId:(await fs.readFile(path.join(resources,'service/.next-desktop/BUILD_ID'),'utf8')).trim()};
}
