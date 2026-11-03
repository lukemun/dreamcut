/** Bound native work across previews and exports. Queued requests retain no
 * decoder ownership; a slot is released only when the active request settles. */
export class NativeRequestScheduler {
 private active=0;
 private keys=new Set<string>();
 private queue:Array<{key:string;start:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>}> = [];
 constructor(private readonly concurrency=4,private readonly maxQueued=64){}
 run<T>(key:string,work:()=>Promise<T>,queueTimeoutMs=8000):Promise<T>{
  if(this.keys.has(key))return Promise.reject(new Error('Native session already has an outstanding frame'));
  if(this.active>=this.concurrency&&this.queue.length>=this.maxQueued)return Promise.reject(new Error('Native request queue is full'));
  this.keys.add(key);
  return new Promise<T>((resolve,reject)=>{
   const start=()=>{
    this.active++;
    const finish=()=>{this.active--;this.keys.delete(key);this.drain();};
    void Promise.resolve().then(work).then(value=>{finish();resolve(value);},error=>{finish();reject(error);});
   };
   if(this.active<this.concurrency){start();return;}
   const entry={key,start,reject,timer:setTimeout(()=>{const index=this.queue.indexOf(entry);if(index<0)return;this.queue.splice(index,1);this.keys.delete(key);reject(new Error('Native request timed out waiting for capacity'));},queueTimeoutMs)};
   this.queue.push(entry);
  });
 }
 private drain(){while(this.active<this.concurrency&&this.queue.length){const next=this.queue.shift()!;clearTimeout(next.timer);next.start();}}
}
