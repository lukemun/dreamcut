import {build,stop,type BuildOptions,type BuildResult,type Plugin} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const hash=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
let cached:{code:string;inputs:Map<string,string>}|undefined;
let pending:Promise<string>|undefined;
async function unchanged(inputs:Map<string,string>){
 try{return (await Promise.all([...inputs].map(async([file,digest])=>hash(await readFile(file))===digest))).every(Boolean);}catch{return false;}
}
/** Fixed owned worker entry, no user paths or remote code. Build separately from
 * the DOM application graph; its development chunk bootstrap is not a worker ABI.
 * Fingerprint before reading and after bundling to reject mixed generations. */
export function gpuWorkerBundle(){
 const built=prebuiltGpuWorker();
 if(built!==null)return Promise.resolve(built);
 pending??=bundle().finally(()=>{pending=undefined;});return pending;
}
/** A packaged runtime ships the worker compiled at build time (scripts/build-prebuilt-runtime.ts) and no source. */
export const PREBUILT_GPU_WORKER='prebuilt/gpu-worker.js';
let prebuilt:string|null|undefined;
function prebuiltGpuWorker(){
 if(prebuilt===undefined){try{prebuilt=readFileSync(path.resolve(PREBUILT_GPU_WORKER),'utf8');}catch{prebuilt=null;}}
 return prebuilt;
}
/** The worker bundle itself; `onLoad` sees each source file as esbuild reads it. */
export async function compileGpuWorker(onLoad?:(file:string)=>Promise<void>){
 const audit:Plugin={name:'gpu-worker-inputs',setup(builder){builder.onLoad({filter:/.*/,namespace:'file'},async args=>{await onLoad?.(args.path);return undefined;});}};
 const result=await buildWithin({entryPoints:['src/lib/gpu-preview/worker.ts'],bundle:true,write:false,platform:'browser',format:'iife',minify:true,plugins:[audit],define:{'process.env.NODE_ENV':'"production"'}});
 return result.outputFiles[0].text;
}
async function bundle(attempt=0):Promise<string>{
 if(cached&&await unchanged(cached.inputs))return cached.code;
 if(attempt>=3)throw Error('GPU worker sources changed while building; retry once edits settle');
 const inputs=new Map<string,string>();
 for(const file of ['pnpm-lock.yaml','tsconfig.json','src/lib/render/gpu-worker-bundle.ts'])inputs.set(file,hash(await readFile(file)));
 const code=await compileGpuWorker(async file=>{inputs.set(file,hash(await readFile(file)));});
 if(!await unchanged(inputs))return bundle(attempt+1);
 cached={code,inputs};return cached.code;
}

/** The build normally takes well under a second; a long wait means esbuild's service is stuck. */
const BUILD_LIMIT_MS=20_000;
/**
 * esbuild runs one shared service process per server. If an earlier build crashed it, every later
 * build waits forever and the GPU preview times out behind it. Give the build a limit; on a hang,
 * stop the stuck service (the next build starts a fresh one) and try once more.
 */
async function buildWithin(options:BuildOptions&{write:false},retried=false):Promise<BuildResult<BuildOptions&{write:false}>>{
 let timer:ReturnType<typeof setTimeout>|undefined;
 const limit=new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Error('GPU worker build timed out')),BUILD_LIMIT_MS);});
 try{return await Promise.race([build(options),limit]);}
 catch(error){
  if(retried||!(error instanceof Error)||error.message!=='GPU worker build timed out')throw error;
  await stop();
  return buildWithin(options,true);
 }finally{clearTimeout(timer);}
}
