import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {resolveLocalMediaSource} from './audio-effects';
import {projectMediaDir,projectDir} from './paths';
import {readJsonFile,writeJsonFileAtomic} from './atomic-json';
import {previewDimensions,type PreviewQuality} from '../preview-quality';

const recipe='editor-still-v1';
type Receipt={key:string;source_url:string;source_hash:string;preview_hash:string;url:string;width:number;height:number;quality:PreviewQuality};
type QueueState={jobs:Map<string,Promise<Receipt>>;verified:Map<string,boolean>;tail:Promise<unknown>};
// API routes and development reloads share one process-wide preparation budget.
const owner=globalThis as typeof globalThis&{__dreamcutStillPreviewV1?:QueueState};
const queue=owner.__dreamcutStillPreviewV1??={jobs:new Map(),verified:new Map(),tail:Promise.resolve()};
const {jobs,verified}=queue;
const digest=(value:string|Buffer)=>createHash('sha256').update(value).digest('hex');
function context(projectId:string,sourceUrl:string,quality:PreviewQuality){
 if(!/\.(png|jpe?g)$/i.test(sourceUrl))return null;
 const source=resolveLocalMediaSource(projectId,sourceUrl,{allowReferencedProject:true});
 if(!source)return null;
 const stat=fs.statSync(source.absolutePath);
 if(!stat.isFile()||stat.size>64*1024*1024)return null;
 const signature=[stat.size,stat.mtimeMs,stat.ctimeMs];
 const key=digest(JSON.stringify([recipe,sourceUrl,signature,quality]));
 const relative=`.prepared/${recipe}/${key}/preview.png`;
 return {source,signature,key,quality,sourceUrl,output:path.join(projectMediaDir(source.sourceProjectId),relative),
  receipt:path.join(projectDir(source.sourceProjectId),'preprocess',recipe,`${key}.json`),
  url:`/api/projects/${source.sourceProjectId}/media/${relative}`};
}
function ready(c:NonNullable<ReturnType<typeof context>>){
 const receipt=readJsonFile<Receipt|null>(c.receipt,null);
 if(receipt?.key!==c.key||receipt.source_url!==c.sourceUrl||receipt.url!==c.url||receipt.quality!==c.quality||!fs.existsSync(c.output))return null;
 const stat=fs.statSync(c.output),identity=JSON.stringify([c.output,stat.size,stat.mtimeMs,stat.ctimeMs,receipt.preview_hash]);
 let valid=verified.get(identity);
 if(valid===undefined){valid=digest(fs.readFileSync(c.output))===receipt.preview_hash;verified.set(identity,valid);if(verified.size>256)verified.delete(verified.keys().next().value!);}
 return valid?receipt:null;
}
/** Disposable image preparation. Original bytes and timeline bindings are never written. */
export function prepareStillPreview(projectId:string,sourceUrl:string,quality:PreviewQuality):Promise<Receipt>{
 const c=context(projectId,sourceUrl,quality);
 if(!c)return Promise.reject(Error('Unsupported still preview source'));
 const cached=ready(c);if(cached)return Promise.resolve(cached);
 const jobKey=c.output,existing=jobs.get(jobKey);if(existing)return existing;
 if(jobs.size>=64)return Promise.reject(Error('Still preview queue is full'));
 const job=queue.tail.catch(()=>{}).then(async()=>{
  const bytes=await fs.promises.readFile(c.source.absolutePath);
  const input=sharp(bytes,{limitInputPixels:32*1024*1024});
  const metadata=await input.metadata();
  if(!['jpeg','png'].includes(metadata.format??'')||metadata.depth!=='uchar')throw Error('Still preview requires an 8-bit JPEG or PNG');
  if(metadata.xmp&&/hdrgm:|hdrgainmap|hdr-gain-map/i.test(metadata.xmp.toString()))throw Error('HDR stills require a preserving preview recipe');
  if((metadata.pages??1)>1)throw Error('Animated images require their original source');
  const rotated=[5,6,7,8].includes(metadata.orientation??1);
  const sourceWidth=(rotated?metadata.height:metadata.width)??0,sourceHeight=(rotated?metadata.width:metadata.height)??0;
  const {edge,short}=previewDimensions(quality,metadata.hasAlpha===true),portrait=sourceHeight>sourceWidth;
  const {data,info}=await input.rotate().resize({width:portrait?short:edge,height:portrait?edge:short,fit:'inside',withoutEnlargement:true})
   .toColourspace('srgb').png().toBuffer({resolveWithObject:true});
  const after=await fs.promises.stat(c.source.absolutePath);
  if(JSON.stringify([after.size,after.mtimeMs,after.ctimeMs])!==JSON.stringify(c.signature))throw Error('Still source changed during preparation');
  await fs.promises.mkdir(path.dirname(c.output),{recursive:true});
  const temporary=`${c.output}.${randomUUID()}.tmp`;
  try{await fs.promises.writeFile(temporary,data);await fs.promises.rename(temporary,c.output);}
  finally{await fs.promises.rm(temporary,{force:true});}
  const receipt:Receipt={key:c.key,source_url:sourceUrl,source_hash:digest(bytes),preview_hash:digest(data),url:c.url,width:info.width,height:info.height,quality};
  writeJsonFileAtomic(c.receipt,receipt);await fs.promises.rm(`${c.receipt}.failed`,{force:true});return receipt;
 });
 jobs.set(jobKey,job);queue.tail=job.catch(()=>{});
 void job.catch(error=>{writeJsonFileAtomic(`${c.receipt}.failed`,{key:c.key,error:error instanceof Error?error.message:String(error)});}).catch(()=>{});
 void job.finally(()=>{jobs.delete(jobKey);}).catch(()=>{});
 return job;
}

export function hydrateStillPreview(projectId:string,sourceUrl:string|null,props:Record<string,unknown>,quality:PreviewQuality):Record<string,unknown>{
 // These channels encode geometry rather than ordinary photographic color.
 if(!sourceUrl||props.edge_aura!=null||props.contour_model!=null)return props;
 const original={...props,runtime_still_preview:{source_url:sourceUrl,preserve_original:true}};
 let c:ReturnType<typeof context>;
 try{c=context(projectId,sourceUrl,quality);}catch(error){return {...original,runtime_preview_preparation:{state:'ready',quality,upgrade_state:'failed',error:error instanceof Error?error.message:String(error)}};}
 if(!c)return props;
 const receipt=ready(c);
 if(receipt)return {...props,runtime_still_preview:receipt,runtime_preview_preparation:{state:'ready',quality}};
 const failed=readJsonFile<{key:string;error:string}|null>(`${c.receipt}.failed`,null);
 if(failed?.key===c.key)return {...original,runtime_preview_preparation:{state:'ready',quality,upgrade_state:'failed',error:failed.error}};
 if(process.env.MEDIA_PREPARATION_AUTOSTART==='0')return props;
 void prepareStillPreview(projectId,sourceUrl,quality).catch(()=>{});
 return {...original,runtime_preview_preparation:{state:'ready',quality,upgrade_state:'preparing'}};
}
