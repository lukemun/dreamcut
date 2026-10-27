import fs from 'node:fs';
import path from 'node:path';
import {createHash, randomUUID} from 'node:crypto';
import {PreviewDependenciesChangedError} from '../render/prepared-sections';
import {preparedPreviewIdentity, type PreparedPreviewInput, type PreparedPreviewStatus} from '../timeline/prepared-preview';

const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
type Job = { project: string; owner: string; identity: string; dependency: string; input: PreparedPreviewInput; origin: string; file: string; controller: AbortController; status: PreparedPreviewStatus; outputHash?: string; released?: boolean; work?: Job };
type Dependencies = {
  journal?: string;
  fingerprint(input: PreparedPreviewInput, origin: string): string | null;
  directory(project: string): string;
  render(input: PreparedPreviewInput, origin: string, file: string, signal: AbortSignal, progress: (p: number) => void, complete: () => void, project: string): Promise<void>;
};
/** Disposable preparation only. Never writes a timeline or delivery/render history. */
export class PreparedPreviewJobs {
  private jobs = new Map<string, Job>();
  private queue: Job[] = [];
  private activeWork = new Set<Job>();
  private owners = new Map<string, {id:string;sequence:number}>();
  constructor(private deps: Dependencies) {
    if (!deps.journal || !fs.existsSync(deps.journal)) return;
    const saved = JSON.parse(fs.readFileSync(deps.journal, 'utf8'));
    if (saved.schema !== 1) throw new Error('Unknown preparation journal version');
    this.owners = new Map(saved.owners);
    for (const record of saved.jobs) {
      const job: Job = {...record, controller: new AbortController(), work: undefined};
      if (['preparing','queued'].includes(job.status.state)) job.status = {...job.status,state:'queued',progress:0};
      this.jobs.set(job.status.id,job);
    }
    for (const record of saved.jobs) if (record.workId) {
      const job=this.jobs.get(record.status.id)!, work=this.jobs.get(record.workId);
      if (work) {job.work=work;job.controller=work.controller;}
    }
    for (const job of this.jobs.values()) if (!job.work && job.status.state==='queued') this.queue.push(job);
    // Recover after the worker has bound its local HTTP server.
    setImmediate(()=>this.pump());
  }
  private persist() {
    if (!this.deps.journal) return;
    const value={schema:1,owners:[...this.owners],jobs:[...this.jobs.values()].map(({controller,work,...job})=>({...job,workId:work?.status.id}))};
    fs.mkdirSync(path.dirname(this.deps.journal),{recursive:true});
    const temporary=this.deps.journal+'.tmp';
    fs.writeFileSync(temporary,JSON.stringify(value));fs.renameSync(temporary,this.deps.journal);
  }
  start(project: string, owner: string, input: PreparedPreviewInput, origin: string, sequence = 0): PreparedPreviewStatus {
    const identity = preparedPreviewIdentity(input), canonical=JSON.parse(identity) as PreparedPreviewInput, dependency = this.deps.fingerprint(canonical, origin);
    if (!dependency) throw new Error('Prepared playback requires verified local media and fonts. A dependency could not be verified.');
    const ownerKey = `${project}:${owner}`, last = this.owners.get(ownerKey), previous = this.jobs.get(last?.id ?? '');
    if(last && sequence < last.sequence) throw new Error('Superseded preview request');
    if (previous && last?.sequence === sequence && previous.identity === identity && previous.dependency === dependency && ['ready','preparing','queued'].includes(previous.status.state)) return this.status(project, previous.status.id);
    if (previous) this.cancel(project, previous.status.id);

    const id = randomUUID(), directory = this.deps.directory(project);
    fs.mkdirSync(directory, {recursive:true});
    const job: Job = {project, owner, identity, dependency, input: JSON.parse(identity), origin, file:path.join(directory,`${id}.mp4`), controller:new AbortController(), status:{id,state:'queued',progress:0}};
    const cacheKey=hash(identity+dependency);
    // A finished preview is an immutable, checksummed artifact. Closing its player
    // releases the job, not the artifact, so reopening or undo can reuse it.
    for(const receipt of fs.readdirSync(directory).filter(f=>f.endsWith('.mp4.receipt.json'))){
      const file=path.join(directory,receipt.slice(0,-'.receipt.json'.length));
      try {
        const saved=JSON.parse(fs.readFileSync(path.join(directory,receipt),'utf8'));
        if(saved.schema!==2 || saved.cacheKey!==cacheKey)continue;
        if(hash(fs.readFileSync(file))!==saved.sha256)continue;
        job.file=file;job.outputHash=saved.sha256;
        job.status={id,state:'ready',progress:1,url:`/api/projects/${project}/prepared-preview?id=${id}&file=1`};
        break;
      }catch { /* A missing/corrupt receipt is never reusable. */ }
    }
    const shared=[...this.jobs.values()].map(j=>j.work??j).find(j=>j.project===project && j.identity===identity && j.dependency===dependency && ['queued','preparing'].includes(j.status.state) && !j.controller.signal.aborted);
    if(job.status.state!=='ready' && shared){job.work=shared;job.file=shared.file;job.controller=shared.controller;}
    if(job.status.state!=='ready' && !shared && this.queue.filter(j=>j.status.state==='queued').length>=16)throw new Error('The preview queue is full. Close unused previews and retry.');
    this.jobs.set(id,job); this.owners.set(ownerKey,{id,sequence});
    this.persist();
    if(job.status.state!=='ready' && !job.work){this.queue.push(job);this.pump();}
    else this.prune(project);
    return {...job.status};
  }
  isBusy() {return this.activeWork.size > 0 || this.queue.some(job=>job.status.state==='queued');}
  private pump() {
    let active=this.activeWork.size;
    while(active<2 && this.queue.length){
      const job=this.queue.shift()!;
      if(job.status.state!=='queued' || job.controller.signal.aborted)continue;
      job.status.state='preparing';this.persist();active++;this.activeWork.add(job);void this.run(job);
    }
  }
  private async run(job: Job) {
    const started=performance.now();
    const publish=()=>{
      if(job.status.state==='ready')return;
      job.controller.signal.throwIfAborted();
      if (this.deps.fingerprint(job.input,job.origin) !== job.dependency) throw new PreviewDependenciesChangedError('Sources or renderer changed during preparation. Prepare again.');
      job.outputHash=hash(fs.readFileSync(job.file));
      fs.writeFileSync(`${job.file}.receipt.json`,JSON.stringify({schema:2,cacheKey:hash(job.identity+job.dependency),sha256:job.outputHash,preparationMs:Math.round(performance.now()-started)}));
      job.status={id:job.status.id,state:'ready',progress:1,url:`/api/projects/${job.project}/prepared-preview?id=${job.status.id}&file=1`};
    };
    try {
      await this.deps.render(job.input,job.origin,job.file,job.controller.signal,p=>{if(!job.controller.signal.aborted && job.status.state!=='ready')job.status.progress=p;},publish,job.project);
      publish();
    } catch(error) {
      // Completed, checksummed media remains usable if browser teardown fails.
      if(job.status.state!=='ready'){
        job.status={id:job.status.id,state:job.controller.signal.aborted?'cancelled':error instanceof PreviewDependenciesChangedError?'stale':'failed',progress:0,error:error instanceof Error?error.message:String(error)};
        this.remove(job);
      }
    }
    this.persist();
    this.activeWork.delete(job);this.prune(job.project);this.pump();
  }
  status(project: string, id: string): PreparedPreviewStatus {
    const requested=this.get(project,id);
    if(requested.released)return {id,state:'cancelled',progress:0};
    const job=requested.work??requested;
    if (job.status.state==='ready' && (this.deps.fingerprint(job.input,job.origin)!==job.dependency || !fs.existsSync(job.file) || hash(fs.readFileSync(job.file))!==job.outputHash)) {
      job.status={id,state:'stale',progress:0,error:'The preview needs updating.'};this.remove(job);
    }
    this.persist();
    return {...job.status,id,...(job.status.state==='ready'?{url:`/api/projects/${project}/prepared-preview?id=${id}&file=1`}:{})};
  }
  file(project:string,id:string) { if(this.status(project,id).state!=='ready')throw new Error('Preview is not ready');return this.get(project,id).file; }
  cancel(project:string,id:string) {
    const requested=this.get(project,id);requested.released=true;const job=requested.work??requested;
    if(job.status.state==='ready'){this.persist();return;}
    if([...this.jobs.values()].some(j=>!j.released && (j.work??j)===job)){this.persist();return;}
    job.controller.abort();job.status={id:job.status.id,state:'cancelled',progress:0};this.remove(job);this.persist();this.pump();
  }
  private get(project:string,id:string) {const job=this.jobs.get(id);if(!job||job.project!==project)throw new Error('Preview not found');return job;}
  private remove(job:Job) {for(const suffix of ['', '.partial','.renderer.json','.receipt.json','.sections.json'])fs.rmSync(job.file+suffix,{force:true});}
  private prune(project:string) {
    const directory=this.deps.directory(project);
    const files=fs.readdirSync(directory).filter(f=>f.endsWith('.mp4')).map(f=>({file:path.join(directory,f),stat:fs.statSync(path.join(directory,f))})).sort((a,b)=>a.stat.mtimeMs-b.stat.mtimeMs);
    let bytes=files.reduce((n,f)=>n+f.stat.size,0);
    const active=new Set([...this.owners.values()].map(({id})=>this.jobs.get(id)).filter(j=>j && !j.released && ["ready","preparing","queued"].includes((j.work??j).status.state)).map(j=>j!.file));
    for(const [key,{id}] of this.owners) if(this.owners.size>128 && !active.has(this.jobs.get(id)?.file ?? "")) this.owners.delete(key);
    for(const f of files) if(bytes>256*1024*1024&&!active.has(f.file)){for(const suffix of ['','.renderer.json','.receipt.json','.sections.json'])fs.rmSync(f.file+suffix,{force:true});bytes-=f.stat.size;}
    // Keep only a bounded history of terminal job metadata.
    for(const [id,j] of this.jobs) if(this.jobs.size>64 && j.released && !['preparing','queued'].includes((j.work??j).status.state))this.jobs.delete(id);
  }
}
