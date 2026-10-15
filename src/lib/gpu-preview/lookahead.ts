type PendingSample={promise:Promise<boolean>;resolve:(ready:boolean)=>void};
type SourceJob={abort:AbortController;pending:Map<number,PendingSample>};

/** Each source refills independently. A slow incoming decoder cannot hold back
 * lookahead for every already-playing layer. Presentation shares these samples. */
export class FrameLookahead {
 private jobs=new Map<string,SourceJob>();
 get active(){return this.jobs.size>0;}
 has(source:string,time:number){return this.jobs.get(source)?.pending.has(time)??false;}
 wait(source:string,time:number,signal:AbortSignal):Promise<boolean>{
  const pending=this.jobs.get(source)?.pending.get(time);
  if(signal.aborted)return Promise.reject(signal.reason);
  if(!pending)return Promise.resolve(false);
  return new Promise((resolve,reject)=>{
   const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason);};
   signal.addEventListener('abort',abort,{once:true});
   void pending.promise.then(ready=>{signal.removeEventListener('abort',abort);resolve(ready);});
  });
 }
 start(targets:ReadonlyMap<string,readonly number[]>,run:(source:string,times:readonly number[],signal:AbortSignal,ready:(timestamp:number,duration:number)=>void)=>Promise<void>){
  for(const [source,times]of targets){
   if(this.jobs.has(source)||times.length===0)continue;
   const job:SourceJob={abort:new AbortController(),pending:new Map()};
   for(const time of times){let resolve!:(ready:boolean)=>void;const promise=new Promise<boolean>(done=>{resolve=done;});job.pending.set(time,{promise,resolve});}
   this.jobs.set(source,job);
   const ready=(timestamp:number,duration:number)=>{
    if(job.abort.signal.aborted)return;
    for(const [time,entry]of job.pending)if(time>=timestamp&&time<timestamp+duration){entry.resolve(true);job.pending.delete(time);}
   };
   const finish=()=>{
    for(const entry of job.pending.values())entry.resolve(false);
    job.pending.clear();if(this.jobs.get(source)===job)this.jobs.delete(source);
   };
   // Observe synchronous and asynchronous failures; foreground demand can retry.
   try{void run(source,times,job.abort.signal,ready).then(finish,finish);}catch{finish();}
  }
 }
 cancel(){
  for(const job of this.jobs.values()){
   job.abort.abort();for(const entry of job.pending.values())entry.resolve(false);job.pending.clear();
  }
  this.jobs.clear();
 }
}
