import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { copyRuntime } from './copy-runtime.mjs';
import { inspectInstalledPackage, fileHash } from './installed-package.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
if(process.platform!=='darwin')throw Error('DMG installers must be built on macOS.');
const args=process.argv.slice(2),qualification=args.includes('--qualification');
const appIndex=args.indexOf('--app');
if(appIndex<0 || !args[appIndex+1] || args[appIndex+1].startsWith('--'))throw Error('Provide --app /absolute/path/DreamCut.app; add --qualification for local-only unsigned testing.');
const source=path.resolve(args[appIndex+1]);
const report=await inspectInstalledPackage(source);
const run=(command,argv)=>execFileSync(command,argv,{stdio:'pipe',timeout:600000});
if(!qualification){
  if(!report.mediaDistributionReady)throw Error('Media redistribution audit is incomplete. Use --qualification only for local testing.');
  run('/usr/bin/codesign',['--verify','--deep','--strict',source]);
  run('/usr/sbin/spctl',['--assess','--type','execute',source]);
  run('/usr/bin/xcrun',['stapler','validate',source]);
}
const output=path.join(root,'.desktop-build/installers');await fs.mkdir(output,{recursive:true});
const disk=await fs.statfs(output),available=disk.bavail*disk.bsize,needed=report.bytes*2+256*1024*1024;
if(available<needed)throw Error(`Installer needs approximately ${(needed/1024**3).toFixed(1)} GiB free; ${(available/1024**3).toFixed(1)} GiB available. No image created.`);
const filename=`DreamCut-${report.version}-mac-${report.arch}${qualification?'-local-qa':''}.dmg`;
const destination=path.join(output,filename);
await fs.access(destination).then(()=>{throw Error('Installer already exists; preserve it or explicitly move it before rebuilding.');},()=>{});
const scratch=await fs.mkdtemp(path.join(output,'.dmg-'));
const staging=path.join(scratch,'contents'),mount=path.join(scratch,'mounted'),temporary=path.join(scratch,'candidate.dmg');
let mounted=false;
try {
  await fs.mkdir(staging);await fs.mkdir(mount);
  await copyRuntime(source,path.join(staging,'DreamCut.app'));
  await fs.symlink('/Applications',path.join(staging,'Applications'));
  await fs.writeFile(path.join(staging,'INSTALL.txt'),`Drag DreamCut.app to Applications, then open it from Applications.\n${qualification?'LOCAL QA BUILD — unsigned/unqualified. Not for website distribution.\n':''}`);
  run('/usr/bin/hdiutil',['create','-volname',`DreamCut ${report.version}`,'-srcfolder',staging,'-format','UDZO',temporary]);
  run('/usr/bin/hdiutil',['verify',temporary]);
  run('/usr/bin/hdiutil',['attach','-readonly','-nobrowse','-mountpoint',mount,temporary]);mounted=true;
  const roundTrip=await inspectInstalledPackage(path.join(mount,'DreamCut.app'));
  if(JSON.stringify(roundTrip)!==JSON.stringify(report))throw Error('Mounted image does not match packaged application.');
  if(await fs.readlink(path.join(mount,'Applications'))!=='/Applications')throw Error('Missing Applications installation shortcut.');
  run('/usr/bin/hdiutil',['detach',mount]);mounted=false;
  await fs.rename(temporary,destination);
  const sha256=await fileHash(destination);
  await fs.writeFile(destination+'.sha256',`${sha256}  ${filename}\n`);
  await fs.writeFile(destination+'.json',JSON.stringify({schemaVersion:1,...report,qualification,websiteReady:false,sha256,checks:['package-integrity','disk-image-verify','read-only-mount-round-trip'],pending:['clean-machine-install','first-launch','microphone','playback','upgrade','uninstall'],createdAt:new Date().toISOString()},null,2));
  console.log(destination);
} finally {
  if(mounted)run('/usr/bin/hdiutil',['detach',mount]);
  await fs.rm(scratch,{recursive:true,force:true});
}
