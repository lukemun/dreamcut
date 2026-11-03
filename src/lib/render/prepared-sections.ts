import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {scopeStillRequest} from '../instruments/still-scope';
import {preparedPictureInput, preparedPreviewIdentity, type PreparedPreviewInput} from '../timeline/prepared-preview';
import {runMediaProcess} from './audio-export';

const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
export const PREVIEW_SECTION_FRAMES = 60;
export class PreviewDependenciesChangedError extends Error {}
/** Project a cache key only. Rendering always receives the full composition. */
export function previewSections(input: PreparedPreviewInput) {
  const canonical = JSON.parse(preparedPreviewIdentity(input)) as PreparedPreviewInput;
  // The outer request window is transport scheduling, not a picture dependency.
  // The section's own range participates in the key below. This lets a section
  // prepared alone also satisfy a larger effect/full-preview request.
  delete canonical.frameRange;
  const sections: {range: [number, number]; input: PreparedPreviewInput}[] = [];
  const first=input.frameRange?.[0]??0,last=input.frameRange?.[1]??input.durationInFrames-1;
  for (let start = first; start <= last; start += PREVIEW_SECTION_FRAMES) {
    const end = Math.min(start + PREVIEW_SECTION_FRAMES-1,last);
    const retained = new Set<string>();
    for (let frame = start; frame <= end; frame++) {
      const scoped = scopeStillRequest({...canonical, frame, baseUrl: '', output: ''});
      for (const element of scoped.inputProps.elements) retained.add(element.id);
    }
    sections.push({range: [start, end], input: {...canonical, inputProps: {...canonical.inputProps,
      elements: canonical.inputProps.elements.filter(e => retained.has(e.id))}}});
  }
  return sections;
}

type Dependencies = {
  concurrency?: number;
  fingerprint(input: PreparedPreviewInput): string | null;
  render(range: [number, number], video: string, pcm: string, progress: (p: number) => void): Promise<void>;
  renderAudio?(range: [number, number], pcm: string, progress: (p: number) => void): Promise<void>;
  assemble(files: {video: string; pcm: string}[], output: string): Promise<void>;
};
/** Receipts are committed last; interrupted or corrupt sections are never reused. */
async function renderSections(input: PreparedPreviewInput, output: string, signal: AbortSignal,
  progress: (p: number) => void, deps: Dependencies) {
  const directory = path.join(path.dirname(output), 'sections');
  fs.mkdirSync(directory, {recursive: true});
  const sections = previewSections(input), pictures = previewSections(preparedPictureInput(input));
  const files: {video:string;pcm:string}[] = new Array(sections.length);
  const completed = sections.map(()=>0);
  const update = (index:number, value:number) => {
    completed[index] = Math.max(completed[index],Math.min(1,Math.max(0,value)));
    progress(.95*completed.reduce((sum,p)=>sum+p,0)/sections.length);
  };
  let reused = 0, audioReused = 0;
  const renderSection = async (index:number) => {
    const section=sections[index];
    signal.throwIfAborted();
    const dependency = deps.fingerprint(section.input);
    const picture = deps.renderAudio ? pictures[index].input : section.input;
    const pictureDependency = deps.fingerprint(picture);
    if (!dependency || !pictureDependency) throw new Error('Section dependencies could not be verified');
    const key = digest(JSON.stringify({version:2,range:section.range,input:picture,dependency:pictureDependency}));
    const audioKey = digest(JSON.stringify({version:2,range:section.range,input:section.input,dependency}));
    const video = path.join(directory, `${key}.mp4`), pcm = path.join(directory, `${audioKey}.f32`);
    const release = await lockSection(video);
    const valid = (file:string) => {try {return JSON.parse(fs.readFileSync(file+'.json','utf8')).sha256===digest(fs.readFileSync(file));} catch {return false;}};
    const commit = (temporary:string, file:string) => {
      const receipt=JSON.stringify({sha256:digest(fs.readFileSync(temporary))});
      fs.renameSync(temporary,file);fs.writeFileSync(temporary+'.json',receipt);fs.renameSync(temporary+'.json',file+'.json');
    };
    try {
      signal.throwIfAborted();
      const hasPicture=valid(video), hasAudio=valid(pcm);
      if (hasPicture) reused++;
      if (hasAudio) audioReused++;
      if (!hasPicture || !hasAudio) {
        const temporary=path.join(directory,randomUUID()), tempVideo=temporary+'.mp4', tempPcm=temporary+'.f32';
        const progressPart=(p:number)=>update(index,p);
        try {
          await retryTransientPreparation(async()=>{
            if (hasPicture && deps.renderAudio) await deps.renderAudio(section.range,tempPcm,progressPart);
            else await deps.render(section.range,tempVideo,tempPcm,progressPart);
          },signal);
          signal.throwIfAborted();
          if (deps.fingerprint(section.input)!==dependency || deps.fingerprint(picture)!==pictureDependency)
            throw new PreviewDependenciesChangedError('Section sources changed during preparation');
          const expectedBytes=(section.range[1]-section.range[0]+1)*48000/input.fps*8;
          if (fs.statSync(tempPcm).size!==expectedBytes) throw new Error('Section audio duration mismatch');
          if (!hasPicture) commit(tempVideo,video);
          if (!hasAudio) commit(tempPcm,pcm);
        } finally {
          for (const suffix of ['.mp4','.f32','.mp4.json','.f32.json','.mp4.partial','.mp4.renderer.json']) fs.rmSync(temporary+suffix,{force:true});
        }
      }
    } finally {release();}
    files[index]={video,pcm};update(index,1);
  };
  // Drain in-flight work before cleanup on failure. Never assemble incomplete or
  // completion-ordered sections, and never let a late worker publish a full file.
  let next=0, failed=false;
  const concurrency=Math.max(1,Math.min(2,Math.floor(deps.concurrency??1)||1));
  const results=await Promise.allSettled(Array.from({length:Math.min(concurrency,sections.length)},async()=>{
    while(!failed && next<sections.length) {
      const index=next++;
      try {await renderSection(index);} catch(error) {failed=true;throw error;}
    }
  }));
  const error=results.find((result):result is PromiseRejectedResult=>result.status==='rejected');
  if(error)throw error.reason;
  signal.throwIfAborted();
  await deps.assemble(files, output);
  fs.writeFileSync(`${output}.sections.json`, JSON.stringify({total: sections.length, reused, rendered: sections.length - reused, audioReused}));
  progress(1);
  return {total: sections.length, reused};
}

/** One video stream, one audio encode. No per-section AAC padding at joins. */
export async function assemblePreparedSections(files: {video: string; pcm: string}[], output: string, duration: number, signal: AbortSignal) {
  const temporary = fs.mkdtempSync(path.join(path.dirname(output), 'join-'));
  try {
    // Relative generated names avoid quoting user-controlled project paths in concat syntax.
    files.forEach((file, index) => fs.linkSync(file.video, path.join(temporary, `${index}.mp4`)));
    const list = path.join(temporary, 'list.txt');
    fs.writeFileSync(list, files.map((_, index) => `file '${index}.mp4'`).join('\n'));
    const pcm = path.join(temporary, 'audio.f32');
    const fd = fs.openSync(pcm, 'w');
    try { for (const file of files) { signal.throwIfAborted(); fs.writeSync(fd, fs.readFileSync(file.pcm)); } }
    finally { fs.closeSync(fd); }
    await runMediaProcess('ffmpeg', ['-v','error','-y','-f','concat','-safe','1','-i',list,'-f','f32le','-ar','48000','-ac','2','-i',pcm,
      '-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','192k','-t',String(duration),'-movflags','+faststart','-f','mp4',`${output}.partial`], signal);
    signal.throwIfAborted(); fs.renameSync(`${output}.partial`, output);
  } finally { fs.rmSync(temporary, {recursive: true, force: true}); fs.rmSync(`${output}.partial`, {force: true}); }
}

// Prune only after the last reader/writer in this cache directory releases it.
// Concurrent compositions can safely reuse the same immutable section files.
const activeDirectories = new Map<string, number>();
export async function renderPreparedSections(...args: Parameters<typeof renderSections>) {
  const directory = path.join(path.dirname(args[1]), 'sections');
  activeDirectories.set(directory, (activeDirectories.get(directory) ?? 0) + 1);
  try { return await renderSections(...args); }
  finally {
    const active = activeDirectories.get(directory)! - 1;
    if (active) activeDirectories.set(directory, active);
    else {
      activeDirectories.delete(directory);
      if (fs.existsSync(directory)) {
        const entries = fs.readdirSync(directory).map(name => ({name, stat: fs.statSync(path.join(directory, name))}));
        let bytes = entries.reduce((sum, entry) => sum + entry.stat.size, 0);
        for (const entry of entries.filter(e => e.name.endsWith('.json')).sort((a,b) => a.stat.mtimeMs-b.stat.mtimeMs)) {
          if (bytes <= 256 * 1024 * 1024) break;
          for (const name of [entry.name,entry.name.slice(0,-5)]) {
            const file=path.join(directory,name);
            if (fs.existsSync(file)) {bytes-=fs.statSync(file).size;fs.rmSync(file);}
          }
        }
      }
    }
  }
}

const sectionLocks = new Map<string, Promise<void>>();
async function lockSection(key: string) {
  const previous = sectionLocks.get(key);
  let unlock!: () => void;
  const current = new Promise<void>(resolve => { unlock = resolve; });
  sectionLocks.set(key, current);
  await previous;
  return () => { unlock(); if (sectionLocks.get(key) === current) sectionLocks.delete(key); };
}

/** Retry browser/process interruption only; bad sources and contract errors fail immediately. */
export async function retryTransientPreparation<T>(work:()=>Promise<T>,signal:AbortSignal):Promise<T> {
  for(let attempt=0;;attempt++) {
    signal.throwIfAborted();
    try {return await work();} catch(error) {
      const message=error instanceof Error ? error.message : String(error);
      if(signal.aborted || attempt>=2 || !/Execution context was destroyed|Target.*closed|Browser.*closed|browser has been closed|ECONNRESET|net::ERR_CONNECTION_RESET/i.test(message)) throw error;
      await new Promise<void>((resolve,reject)=>{
        const abort=()=>{clearTimeout(timer);reject(signal.reason);};
        const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve();},250*2**attempt);
        signal.addEventListener('abort',abort,{once:true});
      });
    }
  }
}
