import {createHash} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';

const NOTICE='UI waveform sample values were omitted from model context. Do not make audio or waveform visual judgments from this projection; use the existing audio_waveform_prepare and evidence tools when needed.';

function projectTimeline(timeline,prefix) {
 if(!timeline || typeof timeline!=='object' || !Array.isArray(timeline.elements))return {value:timeline,omitted:[]};
 const omitted=[];
 const value={...timeline,elements:timeline.elements.map((element,index)=>{
  if(!element || typeof element!=='object' || !Object.hasOwn(element,'_peaks'))return element;
  const copy={...element};delete copy._peaks;omitted.push(`${prefix}/elements/${index}/_peaks`);return copy;
 })};
 return {value,omitted};
}
async function archive(original,directory) {
 if(typeof directory!=='string'||!directory)throw Error('A private archive directory is required');
 const bytes=JSON.stringify(original),hash=createHash('sha256').update(bytes).digest('hex');
 const root=path.join(directory,'context-artifacts'),file=path.join(root,`${hash}.json`);
 await mkdir(root,{recursive:true,mode:0o700});
 try{await writeFile(file,bytes,{flag:'wx',mode:0o600});}
 catch(error){if(error.code!=='EEXIST')throw error;if(await readFile(file,'utf8')!==bytes)throw Error('Context archive hash collision or corrupt artifact');}
 return {sha256:hash,artifact:`context-artifacts/${hash}.json`};
}

/** Projection is prompt-only. The untouched MCP result remains hash-addressed in private storage. */
export async function projectToolContext({name,result,directory}) {
 if(name!=='timeline_get'||!Array.isArray(result?.content))return result;
 let recognized=false;const omitted=[];
 const content=result.content.map((block,index)=>{
  if(block?.type!=='text'||typeof block.text!=='string')return block;
  let parsed;try{parsed=JSON.parse(block.text);}catch{return block;}
  if(!Array.isArray(parsed?.elements))return block;
  recognized=true;
  const projected=projectTimeline(parsed,`/content/${index}/text(json)`);
  omitted.push(...projected.omitted);
  return {...block,text:JSON.stringify(projected.value)};
 });
 let structured=result.structuredContent;
 if(Array.isArray(structured?.elements)){
  recognized=true;const projected=projectTimeline(structured,'/structuredContent');structured=projected.value;omitted.push(...projected.omitted);
 }
 if(!recognized)return result;
 const source=await archive(result,directory);
 const projection={schema_version:1,kind:'timeline-context-projection',source,omitted_paths:omitted,notice:omitted.length?NOTICE:'Timeline JSON was minified; no fields were omitted.'};
 return {...result,...(result.structuredContent!==undefined?{structuredContent:structured}:{}),content:[{type:'text',text:JSON.stringify({context_projection:projection})},...content]};
}

/**
 * Archive-free variant for hosts that already journal the full tool result (the desktop bridge):
 * minify JSON text blocks and, for timeline_get, drop the UI-only `_peaks` arrays with the notice.
 */
export function compactToolContent(name, content) {
 if(!Array.isArray(content))return content;
 let omitted=0;
 const compact=content.map(block=>{
  if(block?.type!=='text'||typeof block.text!=='string')return block;
  let parsed;try{parsed=JSON.parse(block.text);}catch{return block;}
  if(name==='timeline_get'){const projected=projectTimeline(parsed,'');omitted+=projected.omitted.length;parsed=projected.value;}
  return {...block,text:JSON.stringify(parsed)};
 });
 return omitted?[{type:'text',text:NOTICE},...compact]:compact;
}

/** Initial context uses the same exact field rule, with its own immutable source artifact. */
export async function projectInitialTimelineContext({timeline,directory}) {
 const projected=projectTimeline(timeline,'');
 const source=await archive(timeline,directory);
 return {timeline:projected.value,projection:{schema_version:1,kind:'timeline-context-projection',source,omitted_paths:projected.omitted,notice:projected.omitted.length?NOTICE:'No timeline fields were omitted.'}};
}
