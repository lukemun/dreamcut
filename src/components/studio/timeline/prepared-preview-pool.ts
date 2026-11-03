import {preparedPreviewIdentity,type PreparedPreviewInput,type PreparedPreviewStatus} from '@/lib/timeline/prepared-preview';
type Transport={start(project:string,owner:string,input:PreparedPreviewInput,sequence:number):Promise<PreparedPreviewStatus>;status(project:string,id:string):Promise<PreparedPreviewStatus>;cancel(project:string,id:string):Promise<unknown>};
type Entry={project:string;key:string;input:PreparedPreviewInput;owner:string;sequence:number;status:PreparedPreviewStatus;attempts:number;timer?:ReturnType<typeof setTimeout>;removed?:boolean};
/** Retain bounded proposal leases; the caller selects which pending identities remain useful. */
export class PreparedPreviewPool {
  private entries=new Map<string,Entry>();
  private listeners=new Set<()=>void>();
  private active=new Set<Entry>();
  private revision=0;
  private priorities=new Map<string,number>();
  constructor(private transport:Transport,private limit=4,private pollMs=1000){}
  key(project:string,input:PreparedPreviewInput){return project+':'+preparedPreviewIdentity(input);}
  get(key:string){return this.entries.get(key)?.status??null;}
  subscribe=(listener:()=>void)=>{this.listeners.add(listener);return()=>{this.listeners.delete(listener);};};
  snapshot=()=>this.revision;
  private changed(){this.revision++;this.listeners.forEach(fn=>fn());}
  ensure(project:string,input:PreparedPreviewInput){
    const key=this.key(project,input),existing=this.entries.get(key);
    if(existing){this.entries.delete(key);this.entries.set(key,existing);return;}
    const entry:Entry={project,key,input,owner:crypto.randomUUID(),sequence:0,attempts:0,status:{id:'',state:'queued',progress:0}};
    this.entries.set(key,entry);
    while(this.entries.size>this.limit)this.remove(this.entries.values().next().value!);
    this.changed();this.drain();
  }
  retry(key:string){const entry=this.entries.get(key);if(!entry || !['failed','cancelled'].includes(entry.status.state))return;entry.attempts=0;entry.status={id:'',state:'queued',progress:0};this.changed();this.drain();}
  prioritize(keys:string[]){this.priorities=new Map(keys.map((key,index)=>[key,index]));this.drain();}
  /** Keep completed variants, but don't spend capture slots on superseded drafts. */
  retainPending(keys:string[]){
    const selected=new Set(keys);let removed=false;
    for(const entry of this.entries.values())if(!selected.has(entry.key)&&['queued','preparing','stale'].includes(entry.status.state)){
      this.remove(entry);removed=true;
    }
    if(removed){this.changed();this.drain();}
  }
  private drain(){
    const ordered=[...this.entries.values()].sort((a,b)=>(this.priorities.get(a.key)??Infinity)-(this.priorities.get(b.key)??Infinity));
    for(const entry of ordered){
      if(this.active.size>=2)break;
      if(!entry.status.id && entry.status.state==='queued' && !this.active.has(entry))void this.start(entry);
    }
  }
  private async start(entry:Entry){
    this.active.add(entry);
    clearTimeout(entry.timer);const sequence=++entry.sequence;
    entry.status={id:'',state:'preparing',progress:0};this.changed();
    try{
      const next=await this.transport.start(entry.project,entry.owner,entry.input,sequence);
      if(entry.removed||sequence!==entry.sequence){void this.transport.cancel(entry.project,next.id).catch(()=>{});return;}
      this.publish(entry,next);
    }catch(error){if(!entry.removed && sequence===entry.sequence){entry.status={id:'',state:'failed',progress:0,error:error instanceof Error?error.message:String(error)};this.changed();this.active.delete(entry);this.drain();}}
  }
  private publish(entry:Entry,next:PreparedPreviewStatus){
    entry.status=next;this.changed();
    if(!['queued','preparing','stale'].includes(next.state)){this.active.delete(entry);this.drain();}
    if(next.state==='stale'){
      if(entry.attempts++<2){void this.start(entry);return;}
      entry.status={...next,state:'failed',error:'Preview sources changed repeatedly. Retry once updates settle.'};this.changed();this.active.delete(entry);this.drain();return;
    }
    if(['queued','preparing','ready'].includes(next.state))entry.timer=setTimeout(()=>void this.poll(entry),next.state==='ready'?Math.max(this.pollMs,5000):this.pollMs);
  }
  private async poll(entry:Entry){
    const sequence=entry.sequence;
    try{const next=await this.transport.status(entry.project,entry.status.id);if(!entry.removed && sequence===entry.sequence)this.publish(entry,next);}
    catch(error){if(!entry.removed && sequence===entry.sequence){entry.status={...entry.status,state:'failed',error:error instanceof Error?error.message:String(error)};this.changed();this.active.delete(entry);this.drain();}}
  }
  private remove(entry:Entry){entry.removed=true;this.active.delete(entry);clearTimeout(entry.timer);this.entries.delete(entry.key);if(entry.status.id)void this.transport.cancel(entry.project,entry.status.id).catch(()=>{});}
  dispose(){for(const entry of this.entries.values())this.remove(entry);this.changed();}
}
