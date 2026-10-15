import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {setupRustPreview} from './setup';

function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'dreamcut-setup-test-'));
 const native=path.join(root,'native/preview');fs.mkdirSync(path.join(native,'target/release'),{recursive:true});
 fs.writeFileSync(path.join(native,'Cargo.toml'),'[package]\n');
 const binary=path.join(native,'target/release/dreamcut-native-preview');fs.writeFileSync(binary,'fixture');
 const packet=Buffer.alloc(1029);packet.writeUInt32LE(1024,1);for(let i=5;i<packet.length;i+=4){packet[i]=255;packet[i+3]=255;}
 const calls:Array<{command:string;args:string[]}>=[];
 const run=(command:string,args:string[])=>{calls.push({command,args});return {status:0,stdout:command===binary?packet:Buffer.from(args.includes('-filters')?'zscale':args.includes('-decoders')?'libvpx libvpx-vp9':'ok')};};
 return {root,binary,packet,calls,run,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('setup builds locked dependencies into the runtime path, tests, and decodes without project writes',async()=>{
 const f=fixture();try{
  await setupRustPreview({...f,platform:'darwin',log:()=>{}});
  const cargo=f.calls.filter(c=>c.command==='cargo'&&c.args[0]!=='--version');
  assert.deepEqual(cargo.map(c=>c.args[0]),['build','test']);
  for(const {args} of cargo){assert.ok(args.includes('--locked'));assert.equal(args[args.indexOf('--target-dir')+1],'native/preview/target');}
  assert.ok(f.calls.some(c=>c.command===f.binary));assert.deepEqual(fs.readdirSync(f.root),['native']);
 }finally{f.cleanup();}
});
test('check mode does not build or offer installation, but still verifies real decoding',async()=>{
 const f=fixture();try{await setupRustPreview({...f,checkOnly:true,platform:'darwin',log:()=>{},confirmInstall:async()=>{throw Error('must not ask');}});
 assert.ok(!f.calls.some(c=>c.command==='brew'||c.args.includes('build')||c.args.includes('test')));assert.ok(f.calls.some(c=>c.command===f.binary));
 }finally{f.cleanup();}
});
test('missing dependencies give an actionable failure without installing implicitly',async()=>{
 const f=fixture();try{await assert.rejects(setupRustPreview({...f,platform:'linux',log:()=>{},run:(command,args)=>command==='cargo'?{status:null}:f.run(command,args)}),/Missing on PATH: cargo/);assert.ok(!f.calls.some(c=>c.command===f.binary));}finally{f.cleanup();}
});
test('macOS installation requires confirmation and is followed by fresh dependency checks',async()=>{
 const f=fixture();let installed=false;try{
  await setupRustPreview({...f,platform:'darwin',log:()=>{},confirmInstall:async message=>{assert.match(message,/brew install rust/);return true;},run:(command,args)=>{
   if(command==='cargo'&&!installed)return {status:null};
   if(command==='brew'&&args[0]==='install')installed=true;
   return f.run(command,args);
  }});assert.ok(installed);assert.equal(f.calls.filter(c=>c.command==='brew'&&c.args[0]==='install').length,1);
 }finally{f.cleanup();}
});
test('a failed build cannot report ready or proceed to decoder smoke test',async()=>{
 const f=fixture();try{await assert.rejects(setupRustPreview({...f,platform:'linux',log:()=>{},run:(command,args)=>args[0]==='build'?{status:1}:f.run(command,args)}),/cargo build.*failed/);assert.ok(!f.calls.some(c=>c.command===f.binary));}finally{f.cleanup();}
});
test('missing binary, unsupported platform, and incorrect pixels fail clearly',async()=>{
 const f=fixture();try{
  await assert.rejects(setupRustPreview({...f,platform:'win32'}),/Windows runtime integration is not ready/);
  f.packet[5]=0;
  await assert.rejects(setupRustPreview({...f,checkOnly:true,platform:'linux',log:()=>{}}),/expected decoded frame/);
  fs.unlinkSync(f.binary);
  await assert.rejects(setupRustPreview({...f,checkOnly:true,platform:'linux',log:()=>{}}),/not built/);
 }finally{f.cleanup();}
});
test('declining installation and check-only mode never run a package installer',async()=>{
 for(const checkOnly of [false,true]){
  const f=fixture();let prompted=false;try{
   await assert.rejects(setupRustPreview({...f,platform:'darwin',checkOnly,log:()=>{},confirmInstall:async()=>{prompted=true;return false;},run:(command,args)=>command==='cargo'?{status:null}:f.run(command,args)}),/Missing on PATH: cargo/);
   assert.equal(prompted,!checkOnly);
   assert.ok(!f.calls.some(c=>c.command==='brew'&&c.args[0]==='install'));
  }finally{f.cleanup();}
 }
});
