import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {inspectInstalledPackage,fileHash} from './installed-package.mjs';
async function fixture(run){
 const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'installed-check-'));
 const app=path.join(scratch,'DreamCut.app'),res=path.join(app,'Contents/Resources');
 const write=async(file,data='fixture')=>{await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,data);};
 try {
 for(const name of ['Info.plist','MacOS/DreamCut'])await write(path.join(app,'Contents',name));
 for(const name of ['app/main.mjs','app/preload.cjs','app/dictation.mjs','app/dictation-ipc.mjs','service/.next-desktop/BUILD_ID','media-tools/bin/ffmpeg','media-tools/bin/ffprobe','voice/whisper-cli','voice/ggml-base.en.bin','voice/LICENSE-model.txt','voice/LICENSE-whisper.cpp.txt'])await write(path.join(res,name));
 await write(path.join(res,'app/release.json'),JSON.stringify({version:'0.1.0',platform:'darwin',arch:'arm64',channel:'local'}));
 await write(path.join(res,'media-tools/manifest.json'),JSON.stringify({distributionReady:false}));
 await write(path.join(res,'voice/manifest.json'),JSON.stringify({platform:'darwin',arch:'arm64',files:[{path:'ggml-base.en.bin',sha256:await fileHash(path.join(res,'voice/ggml-base.en.bin'))}]}));
 for(const file of ['Contents/MacOS/DreamCut','Contents/Resources/media-tools/bin/ffmpeg','Contents/Resources/media-tools/bin/ffprobe','Contents/Resources/voice/whisper-cli'])await fs.chmod(path.join(app,file),0o755);
 await run({app,res,write,scratch});
 }finally{await fs.rm(scratch,{recursive:true,force:true});}
}
test('installed audit works after relocation and detects changed application bytes',()=>fixture(async({app,res,write,scratch})=>{
 const before=await inspectInstalledPackage(app);
 await write(path.join(res,'service/src/app/api/projects/route.js'));
 const moved=path.join(scratch,'Moved App.app');await fs.rename(app,moved);
 const after=await inspectInstalledPackage(moved);assert.notEqual(before.packageSha256,after.packageSha256);assert.equal(after.version,'0.1.0');assert.equal(after.mediaDistributionReady,false);
}));
test('installed audit rejects a corrupt model and missing runtime',()=>fixture(async({app,res,write})=>{
 await write(path.join(res,'voice/ggml-base.en.bin'),'corrupted');await assert.rejects(inspectInstalledPackage(app),/integrity/);
 await fs.rm(path.join(res,'app/preload.cjs'));await assert.rejects(inspectInstalledPackage(app),/ENOENT/);
}));
test('installed audit rejects links outside bundle and private inputs',()=>fixture(async({app,res,write,scratch})=>{
 const external=path.join(scratch,'outside');await write(external);
 await fs.symlink(external,path.join(res,'escape'));await assert.rejects(inspectInstalledPackage(app),/Non-relocatable/);await fs.rm(path.join(res,'escape'));
 await write(path.join(res,'.env.local'));await assert.rejects(inspectInstalledPackage(app),/Private/);
}));

test('native DMG round-trip preserves a synthetic bundle and installation shortcut', {skip: process.platform!=='darwin' || process.env.DREAMCUT_TEST_DMG!=='1'},()=>fixture(async({app,res,write})=>{
 const {execFileSync}=await import('node:child_process');
 const {randomUUID}=await import('node:crypto');
 const {fileURLToPath}=await import('node:url');
 const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
 const version=`0.0.0-test-${randomUUID()}`;
 await write(path.join(res,'app/release.json'),JSON.stringify({version,platform:'darwin',arch:'arm64',channel:'local'}));
 const output=path.join(repo,'.desktop-build/installers',`DreamCut-${version}-mac-arm64-local-qa.dmg`);
 try {
  execFileSync(process.execPath,[path.join(repo,'desktop/make-installer.mjs'),'--app',app,'--qualification'],{timeout:120000,stdio:'pipe'});
  const receipt=JSON.parse(await fs.readFile(output+'.json','utf8'));
  assert.equal(receipt.websiteReady,false);assert.equal(receipt.qualification,true);
  assert.ok(receipt.checks.includes('read-only-mount-round-trip'));assert.equal(await fileHash(output),receipt.sha256);
 }finally{for(const file of [output,output+'.json',output+'.sha256'])await fs.rm(file,{force:true});}
}));

test('installed audit rejects loss of executable permissions',()=>fixture(async({app,res})=>{await fs.chmod(path.join(res,'voice/whisper-cli'),0o644);await assert.rejects(inspectInstalledPackage(app),/not executable/);}));
