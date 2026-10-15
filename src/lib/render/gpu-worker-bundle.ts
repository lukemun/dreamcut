import {build,type Plugin} from 'esbuild';
import {readFile} from 'node:fs/promises';
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
 pending??=bundle().finally(()=>{pending=undefined;});return pending;
}
async function bundle(attempt=0):Promise<string>{
 if(cached&&await unchanged(cached.inputs))return cached.code;
 if(attempt>=3)throw Error('GPU worker sources changed while building; retry once edits settle');
 const inputs=new Map<string,string>();
 for(const file of ['pnpm-lock.yaml','tsconfig.json','src/lib/render/gpu-worker-bundle.ts'])inputs.set(file,hash(await readFile(file)));
 const audit:Plugin={name:'gpu-worker-inputs',setup(builder){builder.onLoad({filter:/.*/,namespace:'file'},async args=>{inputs.set(args.path,hash(await readFile(args.path)));return undefined;});}};
 const result=await build({entryPoints:['src/lib/gpu-preview/worker.ts'],bundle:true,write:false,platform:'browser',format:'iife',minify:true,plugins:[audit],define:{'process.env.NODE_ENV':'"production"'}});
 if(!await unchanged(inputs))return bundle(attempt+1);
 cached={code:result.outputFiles[0].text,inputs};return cached.code;
}
