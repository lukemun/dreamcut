import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {inspectInstalledPackage} from './installed-package.mjs';
if(process.platform!=='darwin')throw Error('This installed-package check currently targets macOS.');
if(!process.argv[2])throw Error('Pass the installed DreamCut.app path. Optional second argument: upstream jfk.wav fixture.');
const app=await fs.realpath(process.argv[2]);
const report=await inspectInstalledPackage(app);
const resources=path.join(app,'Contents/Resources');
const scratch=await fs.mkdtemp(path.join(os.tmpdir(),'dreamcut-installed-'));
const env={PATH:'/usr/bin:/bin',HOME:scratch,TMPDIR:scratch,LANG:'en_US.UTF-8'};
const run=(file,args)=>execFileSync(file,args,{cwd:scratch,env,encoding:'utf8',timeout:120000,maxBuffer:1024*1024});
try {
 const media=path.join(resources,'media-tools/bin');
 run(path.join(media,'ffmpeg'),['-v','error','-f','lavfi','-i','sine=frequency=440:duration=0.2','-ar','16000','-ac','1','tone.wav']);
 const probe=JSON.parse(run(path.join(media,'ffprobe'),['-v','error','-show_streams','-of','json','tone.wav']));
 assert.equal(probe.streams[0].sample_rate,'16000');assert.equal(probe.streams[0].channels,1);
 run(path.join(resources,'voice/whisper-cli'),['--help']);
 const checks=['relocatable-package-integrity','bundled-ffmpeg-encode','bundled-ffprobe-decode','whisper-executable-start'];
 if(process.argv[3]){
  const fixture=await fs.realpath(process.argv[3]);
  run(path.join(resources,'voice/whisper-cli'),['-m',path.join(resources,'voice/ggml-base.en.bin'),'-f',fixture,'-l','en','-t','4','-otxt','-of',path.join(scratch,'speech'),'-np','-nt']);
  assert.match(await fs.readFile(path.join(scratch,'speech.txt'),'utf8'),/ask not what your country can do for you/i);checks.push('whisper-known-speech');
 }
 console.log(JSON.stringify({...report,checks,applicationLaunch:'not-tested',nativePermissions:'not-tested',websiteReady:false},null,2));
}finally{await fs.rm(scratch,{recursive:true,force:true});}
