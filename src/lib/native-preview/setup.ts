import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {nativePreviewBinary} from './binary';

type Result={status:number|null;stdout?:Buffer;stderr?:Buffer;error?:Error};
type Runner=(command:string,args:string[],options?:{input?:string;inherit?:boolean})=>Result;
type Options={root:string;checkOnly?:boolean;platform?:NodeJS.Platform;run?:Runner;log?:(message:string)=>void;confirmInstall?:(message:string)=>Promise<boolean>};

/** Developer setup only: builds a helper and disposable fixture, never edits projects or profiles. */
export async function setupRustPreview({root,checkOnly=false,platform=process.platform,run,log=console.log,confirmInstall}:Options){
 if(platform!=='darwin'&&platform!=='linux')throw Error('Rust preview setup currently supports macOS and Linux. Windows runtime integration is not ready; use Standard preview.');
 const execute:Runner=run??((command,args,options={})=>spawnSync(command,args,{cwd:root,input:options.input,stdio:options.inherit?'inherit':'pipe',timeout:options.inherit?600_000:30_000,maxBuffer:8*1024*1024}));
 const works=(command:string,args:string[])=>execute(command,args).status===0;
 const requireSuccess=(command:string,args:string[],options?:Parameters<Runner>[2])=>{
  const result=execute(command,args,options);
  if(result.status!==0)throw Error(`${command} ${args.join(' ')} failed${result.error?`: ${result.error.message}`:result.stderr?.length?`: ${result.stderr.toString().trim().slice(-2000)}`:''}. Resolve the reported error and rerun pnpm setup:rust.`);
  return result;
 };
 const prerequisites:[string,string[]][]=[['cargo',['--version']],['rustc',['--version']],['ffmpeg',['-version']],['ffprobe',['-version']]];
 let missing=prerequisites.filter(([command,args])=>!works(command,args));
 if(missing.length&&!checkOnly&&platform==='darwin'&&works('brew',['--version'])&&confirmInstall){
  const packages=[...new Set(missing.map(([command])=>command==='cargo'||command==='rustc'?'rust':'ffmpeg'))];
  if(await confirmInstall(`Install missing dependencies with brew install ${packages.join(' ')}?`)){
   requireSuccess('brew',['install',...packages],{inherit:true});
   missing=prerequisites.filter(([command,args])=>!works(command,args));
  }
 }
 if(missing.length)throw Error(`Missing on PATH: ${missing.map(([command])=>command).join(', ')}. ${platform==='darwin'?'Install with brew install rust ffmpeg.':'Install Rust/Cargo and FFmpeg with ffprobe using your distribution/toolchain installer.'} Then rerun pnpm setup:rust${checkOnly?' --check':''}.`);
 log('✓ Rust/Cargo, FFmpeg and ffprobe are available');
 const filters=execute('ffmpeg',['-hide_banner','-filters']).stdout?.toString()??'';
 const decoders=execute('ffmpeg',['-hide_banner','-decoders']).stdout?.toString()??'';
 if(!/\bzscale\b/.test(filters)||!['libvpx','libvpx-vp9'].every(codec=>decoders.includes(codec)))throw Error('FFmpeg needs zscale, libvpx and libvpx-vp9 for color and transparent video. Install a full FFmpeg build, then rerun setup.');
 log('✓ Color conversion and transparent-video decoders are available');
 const manifest='native/preview/Cargo.toml';
 if(!fs.existsSync(path.join(root,manifest)))throw Error('Run this command from the DreamCut repository containing native/preview/Cargo.toml.');
 if(!checkOnly){
  log('Building the Rust helper from Cargo.lock…');
  // Runtime loads this exact directory, even if a shell sets CARGO_TARGET_DIR.
  requireSuccess('cargo',['build','--locked','--release','--manifest-path',manifest,'--target-dir','native/preview/target'],{inherit:true});
  requireSuccess('cargo',['test','--locked','--manifest-path',manifest,'--target-dir','native/preview/target'],{inherit:true});
 }
 const binary=nativePreviewBinary(root);
 if(!fs.existsSync(binary))throw Error('Rust helper is not built. Run pnpm setup:rust first.');
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'dreamcut-rust-setup-'));
 try{
  const source=path.join(directory,'probe.mkv');
  requireSuccess('ffmpeg',['-v','error','-y','-f','lavfi','-i','color=c=red:s=16x16:r=30:d=0.1','-c:v','ffv1',source]);
  const scene={version:1,width:16,height:16,transparent:true,layers:[{id:'setup-probe',path:source,source_index:0,source_pts:0,frame:0,fit:'contain',alpha:false,scale:1,x:0,y:0,opacity:1,mask:[0,0,0,0]}]};
  const packet=requireSuccess(binary,[],{input:JSON.stringify(scene)+'\n'}).stdout;
  if(!packet||packet.length!==1029||packet[0]!==0||packet.readUInt32LE(1)!==1024||packet[5]<240||packet[6]>15||packet[7]>15||packet[8]!==255)throw Error('Rust helper did not return the expected decoded frame. Rebuild with pnpm setup:rust and check FFmpeg.');
 }finally{fs.rmSync(directory,{recursive:true,force:true});}
 log('✓ Rust helper decoded a test clip successfully');
 log(checkOnly?'Rust setup check passed.':'Rust setup complete. Start with pnpm dev:rust (port 3143).');
 log('Open the preview gear beside fullscreen → Playback engine → Rust. Standard remains available.');
}
