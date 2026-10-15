import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {qualify} from './qualify-local-model.mjs';

export const LOCAL_MODELS={
 glimmer:{directory:'Muse-Glimmer-30B-GGUF',model:'Muse-Glimmer-30B-KQuant-17GB-Q4_K_M.gguf',projector:'mmproj-Muse-Glimmer-30B-Q4_K_M.gguf'},
 qwen:{directory:'Qwen3.6-35B-A3B-GGUF',model:'Qwen3.6-35B-A3B-Q4_K_M.gguf',projector:'mmproj-Qwen3.6-35B-A3B-BF16.gguf'},
 ministral:{directory:'Ministral-3-14B-Instruct-2512-GGUF',model:'Ministral-3-14B-Instruct-2512-Q4_K_M.gguf',projector:'Ministral-3-14B-Instruct-2512-BF16-mmproj.gguf'},
};
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function freePort(){const server=net.createServer();await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;}

/** Hash the actual bytes before a server is started, including large GGUFs. */
export async function verifyArtifact(file,entry){
 if(!entry || !Number.isSafeInteger(entry.bytes) || entry.bytes<0 || !/^[a-f0-9]{64}$/i.test(entry.sha256??''))throw Error(`Artifact manifest lacks size or SHA-256: ${path.basename(file)}`);
 const stat=await fs.promises.stat(file);
 if(!stat.isFile() || stat.size!==entry.bytes)throw Error(`Missing or incomplete artifact: ${path.basename(file)}`);
 const hash=createHash('sha256');
 for await(const chunk of fs.createReadStream(file))hash.update(chunk);
 const measured=hash.digest('hex');
 if(measured.toLowerCase()!==entry.sha256.toLowerCase())throw Error(`Artifact SHA-256 mismatch: ${path.basename(file)}`);
 return {file,filename:entry.filename,bytes:stat.size,sha256:measured,expected_sha256:entry.sha256};
}

export function trackOwnedChild(child){
 let isClosed=false;
 const closed=new Promise(resolve=>child.once('close',(code,signal)=>{isClosed=true;resolve({code,signal});}));
 return {child,closed,get isClosed(){return isClosed;}};
}

/** Never start another model until the prior child has emitted close. */
export async function terminateOwnedChild(owned,{termGraceMs=2000,killGraceMs=5000}={}){
 if(!owned || owned.isClosed)return;
 if(![termGraceMs,killGraceMs].every(ms=>Number.isSafeInteger(ms)&&ms>=0))throw Error('Invalid shutdown grace period');
 owned.child.kill('SIGTERM');
 let result=await Promise.race([owned.closed.then(()=>true),sleep(termGraceMs).then(()=>false)]);
 if(!result){
  owned.child.kill('SIGKILL');
  result=await Promise.race([owned.closed.then(()=>true),sleep(killGraceMs).then(()=>false)]);
 }
 if(!result)throw Error('Owned model process did not close after SIGKILL; refusing another launch');
 await owned.closed;
}

/** ~/.local/share/dreamcut/models; models downloaded under the OpenEdit name stay in use until a DreamCut folder exists. */
export function defaultModelRoot(home=os.homedir()){
 const current=path.join(home,'.local/share/dreamcut/models'),legacy=path.join(home,'.local/share/openedit/models');
 return fs.existsSync(legacy)&&!fs.existsSync(current)?legacy:current;
}
export const DEFAULT_MODEL_ROOT=defaultModelRoot();

/** Installed, hash-listed models: those whose model and projector files are present at their manifest size. */
export function installedLocalModels({modelRoot=DEFAULT_MODEL_ROOT}={}){
 let manifest;try{manifest=JSON.parse(fs.readFileSync(path.join(modelRoot,'download-manifest.json'),'utf8'));}catch{return [];}
 return Object.entries(LOCAL_MODELS).filter(([,spec])=>[spec.model,spec.projector].every(filename=>{
  const entry=manifest.find(e=>e.filename===filename);
  try{return entry && fs.statSync(path.join(modelRoot,spec.directory,filename)).size===entry.bytes;}catch{return false;}
 })).map(([name])=>name);
}

/**
 * Serve one installed model on a free loopback port and return its endpoint. `verify` hashes the
 * weights first (qualification and evals); an interactive host may skip it after a size check.
 * The caller owns the returned process and must call stop() before serving another model.
 */
export async function serveLocalModel(name,{modelRoot=DEFAULT_MODEL_ROOT,binary='llama-server',context=32768,verify=true,logFile,readyTimeoutMs=180000,signal}={}){
 const spec=LOCAL_MODELS[name];if(!spec)throw Error(`Unknown local model: ${name}`);
 if(![16384,32768,65536].includes(context))throw Error('Context must be 16384, 32768 or 65536');
 const manifest=JSON.parse(fs.readFileSync(path.join(modelRoot,'download-manifest.json'),'utf8'));
 const files=[];
 for(const filename of [spec.model,spec.projector]){
  const file=path.join(modelRoot,spec.directory,filename),entry=manifest.find(e=>e.filename===filename);
  if(verify)files.push(await verifyArtifact(file,entry));
  else{const size=fs.statSync(file).size;if(!entry || size!==entry.bytes)throw Error(`Missing or incomplete artifact: ${filename}`);files.push({file,filename,bytes:size,sha256:null,expected_sha256:entry.sha256});}
 }
 const alias=`dreamcut-${name}`,port=await freePort(),endpoint=`http://127.0.0.1:${port}`;
 const args=['-m',files[0].file,'--mmproj',files[1].file,'--host','127.0.0.1','--port',String(port),'-c',String(context),'-np','1','--jinja','--alias',alias];
 const log=logFile?fs.openSync(logFile,'wx',0o600):'ignore';
 let child;try{child=spawn(binary,args,{stdio:['ignore',log,log]});}finally{if(typeof log==='number')fs.closeSync(log);}
 const owned=trackOwnedChild(child);let spawnError;child.on('error',e=>{spawnError=e;});
 const stop=()=>terminateOwnedChild(owned);
 const started=Date.now();
 try{
  for(;;){
   if(signal?.aborted)throw Error('Model start cancelled');
   if(spawnError)throw spawnError;
   if(owned.isClosed)throw Error(`llama-server exited ${child.exitCode??child.signalCode}`);
   try{const response=await fetch(`${endpoint}/health`,{signal:AbortSignal.timeout(1000)});if(response.ok)break;}catch{}
   if(Date.now()-started>readyTimeoutMs)throw Error('Model readiness deadline exceeded');
   await sleep(500);
  }
 }catch(error){await stop().catch(()=>{});throw error;}
 return {name,alias,endpoint,args,files,context,warmup_ms:Date.now()-started,stop,closed:owned.closed};
}

/** Local installed artifacts only; owns exactly one serving process at a time. */
export async function runLocalSuite({names=Object.keys(LOCAL_MODELS),modelRoot=DEFAULT_MODEL_ROOT,binary='llama-server',outputRoot='private/harness-models'}={}){
 if(!names.length || names.some(name=>!Object.hasOwn(LOCAL_MODELS,name)))throw Error('Choose glimmer, qwen, ministral, or all');
 fs.mkdirSync(outputRoot,{recursive:true,mode:0o700});
 const output=fs.mkdtempSync(path.join(outputRoot,'suite-'));
 const version=spawnSync(binary,['--version'],{encoding:'utf8',timeout:30000});if(version.error || version.status!==0)throw Error('Local llama-server is unavailable');
 const summary={version:1,started_at:new Date().toISOString(),runtime:(version.stdout+version.stderr).trim(),settings:{context:16384,parallel:1},results:[]};
 const manifest=JSON.parse(fs.readFileSync(path.join(modelRoot,'download-manifest.json'),'utf8'));
 let activeOwned,stopping,stopRequested;
 const stop=signal=>{
  stopRequested??=signal;
  if(activeOwned && !stopping){stopping=terminateOwnedChild(activeOwned);stopping.catch(()=>{});}
 };
 const onSigint=()=>stop('SIGINT'),onSigterm=()=>stop('SIGTERM');
 process.on('SIGINT',onSigint);process.on('SIGTERM',onSigterm);
 try{
  for(const name of names){
   if(stopRequested)break;
   const spec=LOCAL_MODELS[name],dir=path.join(output,name),alias=`dreamcut-${name}`;
   fs.mkdirSync(dir,{mode:0o700});
   const started=Date.now();
   const run={name,model:alias,files:[],runtime:summary.runtime,status:'preflight'};
   const save=()=>fs.writeFileSync(path.join(dir,'launch.json'),JSON.stringify(run,null,2),{mode:0o600});
   let fatalStop;
   try{
    for(const filename of [spec.model,spec.projector]){
     const file=path.join(modelRoot,spec.directory,filename),entry=manifest.find(e=>e.filename===filename);
     run.files.push(await verifyArtifact(file,entry));
     if(stopRequested)throw Error(`Suite interrupted by ${stopRequested}`);
    }
    run.verification_ms=Date.now()-started;
    const loadingStarted=Date.now();
    const port=await freePort(),endpoint=`http://127.0.0.1:${port}`;
    const args=['-m',run.files[0].file,'--mmproj',run.files[1].file,'--host','127.0.0.1','--port',String(port),'-c','16384','-np','1','--jinja','--alias',alias];
    run.args=args;run.status='loading';save();
    const log=fs.openSync(path.join(dir,'server.log'),'wx',0o600);
    let child;
    try{child=spawn(binary,args,{stdio:['ignore',log,log]});}finally{fs.closeSync(log);}
    activeOwned=trackOwnedChild(child);
    let spawnError;child.on('error',e=>{spawnError=e;});
    let healthy=false;
    while(Date.now()-loadingStarted<120000){
     if(stopRequested)throw Error(`Suite interrupted by ${stopRequested}`);
     if(spawnError)throw spawnError;
     if(activeOwned.isClosed)throw Error(`Runtime exited ${child.exitCode??child.signalCode}; inspect server.log`);
     try{const response=await fetch(`${endpoint}/health`,{signal:AbortSignal.timeout(1000)});if(response.ok){healthy=true;break;}}catch{}
     await sleep(500);
    }
    if(!healthy)throw Error('Model readiness deadline exceeded');
    run.warmup_ms=Date.now()-loadingStarted;run.status='qualifying';save();
    const result=await qualify({endpoint,model:alias,output:dir});
    if(stopRequested)throw Error(`Suite interrupted by ${stopRequested}`);
    run.status=result.pass?'passed':'failed';run.results=result.results;
   }catch(e){run.status='blocked';run.error=e.message;}
   finally{
    try{await (stopping??(activeOwned?terminateOwnedChild(activeOwned):undefined));}
    catch(error){run.status='blocked';run.error=`${run.error?`${run.error}; `:''}${error.message}`;fatalStop=error;}
    activeOwned=undefined;stopping=undefined;
    run.elapsed_ms=Date.now()-started;save();summary.results.push(run);
    fs.writeFileSync(path.join(output,'suite.json'),JSON.stringify(summary,null,2),{mode:0o600});
   }
   console.log(JSON.stringify({model:name,status:run.status,results:run.results,error:run.error}));
   if(fatalStop)throw fatalStop; // never overlap with an unclosed child
  }
 }finally{
  process.off('SIGINT',onSigint);process.off('SIGTERM',onSigterm);
 }
 if(stopRequested)summary.interrupted_by=stopRequested;
 fs.writeFileSync(path.join(output,'suite.json'),JSON.stringify(summary,null,2),{mode:0o600});
 return {output,...summary};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const name=process.argv[2]??'all';const result=await runLocalSuite({names:name==='all'?undefined:[name]});console.log(JSON.stringify({output:result.output}));if(result.interrupted_by || result.results.some(r=>r.status!=='passed'))process.exitCode=1;
}
