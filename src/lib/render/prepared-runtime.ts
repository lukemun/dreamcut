/** Immutable renderer generations. Only the bundle graph and bundled fonts version code. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {build, type Plugin} from 'esbuild';
import {readEnv} from '@/lib/env-name';
import {nativePreviewBinary} from '@/lib/native-preview/binary';
// Renamed from .openedit-preview; the legacy folder is a rebuildable cache and is not reused.
export const preparedRuntimeRoot = () => path.resolve('.dreamcut-preview');
const sha=(bytes:string|Buffer)=>createHash('sha256').update(bytes).digest('hex');
function tree(directory:string):string[] {
  return fs.readdirSync(directory,{withFileTypes:true}).flatMap(e=>e.isDirectory()?tree(path.join(directory,e.name)):[path.join(directory,e.name)]).sort();
}
/** Browser aliases disabled by a package are esbuild virtual modules, not files. */
export function preparedRuntimeFileInputs(inputs:readonly string[]){return inputs.filter(file=>!file.startsWith('(disabled):')&&!file.startsWith('quiet:'));}
function signature(files:string[]) {return sha(JSON.stringify(files.map(file=>[file,sha(fs.readFileSync(file))])));}
/** The renderer page script and its Node worker, compiled from source; `observe` sees each file esbuild reads. */
export function compilePreparedRuntime(observe:(file:string)=>void=()=>{}) {
  const audit:Plugin={name:'snapshot-inputs',setup(builder){builder.onLoad({filter:/.*/,namespace:'file'},args=>{observe(args.path);return undefined;});}};
  // The offline renderer has no one to report to; error reporting stays in the editor.
  const quiet:Plugin={name:'no-error-reporting',setup(builder){builder.onResolve({filter:/^@sentry\//},args=>({path:args.path,namespace:'quiet'}));builder.onLoad({filter:/.*/,namespace:'quiet'},()=>({contents:'export const withScope=()=>{};export const captureException=()=>{};',loader:'js'}));}};
  const common={plugins:[audit],bundle:true,write:false,metafile:true,logLevel:'silent' as const,absWorkingDir:process.cwd(),tsconfig:'tsconfig.json'};
  return Promise.all([
    build({...common,plugins:[audit,quiet],entryPoints:['src/lib/render/prepared-entry.tsx'],outfile:'renderer.js',platform:'browser',format:'iife',minify:true,define:{'process.env.NODE_ENV':'"production"'}}),
    build({...common,entryPoints:['src/lib/render/prepared-worker.ts'],outfile:'worker.cjs',platform:'node',format:'cjs',packages:'external'}),
  ]);
}
export const PREBUILT_PREPARED_DIR='prebuilt/prepared';
function prebuiltPreparedRuntime():{outputs:{path:string;contents:Uint8Array}[];files:string[]}|null {
  const directory=path.resolve(PREBUILT_PREPARED_DIR);
  if(!fs.existsSync(path.join(directory,'worker.cjs')))return null;
  const files=tree(directory);
  return {files,outputs:files.map(file=>({path:file,contents:fs.readFileSync(file)}))};
}
let building:Promise<string>|undefined;
export function ensurePreparedRuntime():Promise<string> {
  if (building) return building;
  building=buildRuntime().finally(()=>{building=undefined;});return building;
}
async function buildRuntime(attempt=0):Promise<string> {
  if(attempt>=3)throw new Error('Renderer files keep changing. Retry preparation once the changes settle.');
  const root=preparedRuntimeRoot();fs.mkdirSync(root,{recursive:true});
  const manifest=path.join(root,'current.json');
  const fonts=tree(path.resolve('public/fonts'));
  const nativeBinary=nativePreviewBinary(path.resolve('.'));
  const nativeFiles=fs.existsSync(nativeBinary)?[nativeBinary]:[];
  const scope=JSON.stringify([['DREAMCUT_NATIVE_PREVIEW',readEnv('NATIVE_PREVIEW')??''],...['TIMELINE_PROJECTS_DIR','DREAMCUT_PROFILE_DIR','TIMELINE_MUSIC_CATALOG_DIR','TIMELINE_SFX_CATALOG_DIR','TIMELINE_IMAGE_CATALOG_DIR','TIMELINE_VISUAL_CATALOG_DIR'].map(key=>[key,process.env[key]??''])]);
  try {
    const old=JSON.parse(fs.readFileSync(manifest,'utf8'));
    if (old.nativePresent===nativeFiles.length && old.scope===scope && JSON.stringify(fonts)===JSON.stringify(old.fonts) && signature(old.inputs)===old.signature && fs.existsSync(path.join(root,old.version,'worker.cjs'))) return old.version as string;
  } catch { /* Missing or changed generation. */ }
  // A packaged runtime ships the renderer compiled at build time (scripts/build-prebuilt-runtime.ts) and no source.
  const packaged=prebuiltPreparedRuntime();
  let outputs:{path:string;contents:Uint8Array}[], inputs:string[], inputSignature:string, version:string;
  if(packaged){
    outputs=packaged.outputs;
    inputs=[...packaged.files,...fonts,...nativeFiles].sort();
    inputSignature=signature(inputs);
    version=sha(Buffer.concat([...outputs.map(o=>Buffer.from(o.contents)),Buffer.from(signature([...fonts,...nativeFiles])),Buffer.from(scope)]));
  } else {
    // Observe each input before esbuild reads it; never label a mixed generation
    // with the newest source fingerprint when files change during compilation.
    const loaded=new Map<string,string>();
    const observe=(file:string)=>{if(!loaded.has(file))loaded.set(file,sha(fs.readFileSync(file)));};
    for(const file of [...fonts,...nativeFiles,'pnpm-lock.yaml','tsconfig.json','src/lib/render/prepared-runtime.ts'])observe(path.resolve(file));
    const [browser,worker]=await compilePreparedRuntime(observe);
    inputs=[...new Set([...preparedRuntimeFileInputs(Object.keys(browser.metafile!.inputs)),...preparedRuntimeFileInputs(Object.keys(worker.metafile!.inputs)),'pnpm-lock.yaml','tsconfig.json','src/lib/render/prepared-runtime.ts',...fonts,...nativeFiles])].sort();
    if([...loaded].some(([file,hash])=>sha(fs.readFileSync(file))!==hash))return buildRuntime(attempt+1);
    inputSignature=signature(inputs);
    outputs=[...browser.outputFiles!,...worker.outputFiles!];
    version=sha(Buffer.concat([...outputs.map(o=>Buffer.from(o.contents)),Buffer.from(signature([...fonts,...nativeFiles])),Buffer.from(scope),fs.readFileSync('pnpm-lock.yaml'),fs.readFileSync('src/lib/render/prepared-runtime.ts')]));
  }
  const directory=path.join(root,version);
  const temp=path.join(root,randomUUID());fs.mkdirSync(temp);
  try {
    for(const output of outputs) fs.writeFileSync(path.join(temp,path.basename(output.path)),output.contents);
    if(nativeFiles.length)fs.copyFileSync(nativeBinary,path.join(temp,'native-preview'));
    fs.cpSync(path.resolve('public/fonts'),path.join(temp,'fonts'),{recursive:true});
    fs.writeFileSync(path.join(temp,'index.html'),'<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:black}*{box-sizing:border-box}</style></head><body><div id="root"></div><link rel="stylesheet" href="/renderer.css"><script src="/renderer.js"></script></body></html>');
    fs.writeFileSync(path.join(temp,'runtime.json'),JSON.stringify({version,inputs}));
    if (!fs.existsSync(directory)) {try {fs.renameSync(temp,directory);} catch(error){if(!fs.existsSync(directory))throw error;}}
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
  // If code changed while bundling, the next request must build again.
  if(signature(inputs)!==inputSignature) return buildRuntime(attempt+1);
  const staging=manifest+'.'+randomUUID();
  fs.writeFileSync(staging,JSON.stringify({version,inputs,fonts,nativePresent:nativeFiles.length,scope,signature:inputSignature}));fs.renameSync(staging,manifest);
  return version;
}
