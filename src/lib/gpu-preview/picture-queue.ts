export type PreparedGpuPicture={bytes:number;close():void};
type Waiter<T>={resolve:(value:T)=>void;reject:(error:unknown)=>void};

/** Single producer, bounded complete-picture cache. Transport requests pictures;
 * decoding/composition runs independently ahead of it, never on a second clock. */
export class GpuPictureQueue<T extends PreparedGpuPicture> {
 private pictures=new Map<number,T>();
 private waiters=new Map<number,Waiter<T>[]>();
 private buffered:Array<{from:number;to:number;resolve:()=>void;reject:(error:unknown)=>void}>=[];
 private generation=0;
 private current=0;
 private end=0;
 private running=false;
 private closed=false;
 private error:unknown;
 private replayCosts=new Map<number,number>();
 private replayHits=0;
 constructor(private readonly render:(frame:number)=>Promise<T>,private readonly cancel:()=>void,
  readonly capacity:number,private readonly onError:(error:unknown)=>void,
  private warm?:{frames:readonly number[];capacity:number;horizon:number},
  private readonly replay?:{capacity:number;thresholdMs:number;cost:(picture:T)=>number;seeds?:ReadonlyArray<readonly [number,number]>;onCost?:(frame:number,cost:number)=>void}){
  if(warm&&(!Number.isSafeInteger(warm.capacity)||warm.capacity<1||!Number.isSafeInteger(warm.horizon)||warm.horizon<1))throw Error('Invalid warm picture budget');
  if(!Number.isSafeInteger(capacity)||capacity<1)throw Error('Invalid picture queue capacity');
  if(replay&&(!Number.isSafeInteger(replay.capacity)||replay.capacity<1||!Number.isFinite(replay.thresholdMs)||replay.thresholdMs<=0))throw Error('Invalid replay picture budget');
  for(const [frame,cost]of replay?.seeds?.slice(0,replay.capacity)??[])if(Number.isSafeInteger(frame)&&frame>=0&&Number.isFinite(cost)&&cost>0)this.replayCosts.set(frame,cost);
 }
 setWarmFrames(frames:readonly number[]){if(this.warm)this.warm={...this.warm,frames};}
 get size(){return this.pictures.size;}
 get bytes(){return [...this.pictures.values()].reduce((sum,picture)=>sum+picture.bytes,0);}
 get replayStats(){return {retained:this.replayCosts.size,hits:this.replayHits,capacity:this.replay?.capacity??0};}
 private prune(){
  for(const [at,picture]of this.pictures)if(!this.replayCosts.has(at)&&(at<this.current||at>=this.current+this.capacity&&!this.isWarm(at))){this.pictures.delete(at);picture.close();}
  const speculative=[...this.pictures.keys()].filter(at=>at>=this.current+this.capacity&&!this.replayCosts.has(at)).sort((a,b)=>a-b);
  for(const at of speculative.slice(this.warm?.capacity??0)){this.pictures.get(at)!.close();this.pictures.delete(at);}
 }
 /** Called only for a visible, continuous playback request which actually
  * waited for this picture; pauses, startup and seeking are excluded by adapter. */
 recordPlaybackWait(frame:number,waitMs:number){
  const picture=this.pictures.get(frame);
  if(picture&&Number.isFinite(waitMs)&&waitMs>250)this.remember(frame,picture,waitMs);
 }
 private remember(frame:number,picture:T,observedCost?:number){
  if(!this.replay)return;
  const cost=observedCost??this.replay.cost(picture);
  if(!Number.isFinite(cost)||cost<this.replay.thresholdMs)return;
  this.replay.onCost?.(frame,cost);
  this.replayCosts.set(frame,Math.max(cost,this.replayCosts.get(frame)??0));
  if(this.replayCosts.size>this.replay.capacity){
   // Most expensive first, stable frame tie-break: deterministic bounded policy.
   const victim=[...this.replayCosts].sort((a,b)=>a[1]-b[1]||b[0]-a[0])[0][0];
   this.replayCosts.delete(victim);
  }
  this.prune();
 }
 request(frame:number,end:number):Promise<T>{
  if(this.closed)return Promise.reject(Error('GPU picture queue closed'));
  if(this.error)return Promise.reject(this.error);
  this.current=frame;this.end=end;
  // Retain a bounded forward window; no scene or transport state is persisted.
  this.prune();
  for(const [at,list]of this.waiters)if(at<frame){for(const waiter of list)waiter.reject(new DOMException('GPU picture superseded','AbortError'));this.waiters.delete(at);}
  const hit=this.pictures.get(frame);
  if(hit&&this.replayCosts.has(frame))this.replayHits++;
  const result=hit?Promise.resolve(hit):new Promise<T>((resolve,reject)=>{const list=this.waiters.get(frame)??[];list.push({resolve,reject});this.waiters.set(frame,list);});
  this.pump();return result;
 }
 /** Hold a starting transport until a short contiguous runway is complete. */
 readyAhead(frame:number,count:number):Promise<void>{
  if(this.closed||this.error)return Promise.reject(this.error??Error('GPU picture queue closed'));
  const to=Math.min(this.end,frame+Math.min(this.capacity,Math.max(1,count)));
  return new Promise((resolve,reject)=>{this.buffered.push({from:frame,to,resolve,reject});this.flushBuffered();});
 }
 private flushBuffered(error?:unknown){
  this.buffered=this.buffered.filter(waiter=>{
   if(error){waiter.reject(error);return false;}
   for(let frame=waiter.from;frame<waiter.to;frame++)if(!this.pictures.has(frame))return true;
   for(const frame of this.replayCosts.keys())if(frame>=waiter.from&&frame<this.end&&!this.pictures.has(frame))return true;
   waiter.resolve();return false;
  });
 }
 /** Transport discontinuities preserve exact expensive pictures. Scene/settings
  * changes must use the default full invalidation. No cache crosses ownership. */
 invalidate(preserveReplay=false){
  this.generation++;this.cancel();this.error=undefined;
  if(!preserveReplay){this.replayCosts.clear();this.replayHits=0;}
  for(const [frame,picture]of this.pictures)if(!this.replayCosts.has(frame)){picture.close();this.pictures.delete(frame);}
  for(const list of this.waiters.values())for(const waiter of list)waiter.reject(new DOMException('GPU picture superseded','AbortError'));
  this.waiters.clear();this.flushBuffered(new DOMException('GPU picture superseded','AbortError'));this.end=0;
 }
 private isWarm(frame:number){return Boolean(this.warm&&frame>=this.current&&frame<this.current+this.warm.horizon&&this.warm.frames.includes(frame));}
 private nextWarm(){
  if(!this.warm)return undefined;
  const outside=[...this.pictures.keys()].filter(frame=>frame>=this.current+this.capacity&&!this.replayCosts.has(frame)).length;
  if(outside>=this.warm.capacity)return undefined;
  return this.warm.frames.find(frame=>frame>=this.current+this.capacity&&frame<this.end&&frame<this.current+this.warm!.horizon&&!this.pictures.has(frame));
 }
 private pump(){
  if(this.running||this.closed||this.error)return;
  this.running=true;
  // `running` clears inside the pass, synchronously with its last check. Clearing it in a
  // later `.finally` left a window after a pass with nothing to prepare (a cached request)
  // where a same-task request (an undo's scene change) saw `running` and never pumped.
  void (async()=>{
   try{
   while(!this.closed&&!this.error){
    const target=Math.min(this.end,this.current+this.capacity);
    let frame=this.current;while(frame<target&&this.pictures.has(frame))frame++;
    if(frame>=target){const learned=[...this.replayCosts.keys()].sort((a,b)=>a-b).find(at=>at>=this.current&&at<this.end&&!this.pictures.has(at));const warm=learned??this.nextWarm();if(warm===undefined)break;frame=warm;}
    const generation=this.generation;
    try{
     const picture=await this.render(frame);
     if(this.closed||generation!==this.generation||!this.replayCosts.has(frame)&&(frame<this.current||frame>=this.current+this.capacity&&!this.isWarm(frame))){picture.close();continue;}
     this.pictures.set(frame,picture);
     this.remember(frame,picture);
     for(const waiter of this.waiters.get(frame)??[])waiter.resolve(picture);
     this.waiters.delete(frame);this.flushBuffered();
    }catch(error){
     if(this.closed||generation!==this.generation)continue;
     this.error=error;for(const list of this.waiters.values())for(const waiter of list)waiter.reject(error);this.waiters.clear();this.flushBuffered(error);this.onError(error);
    }
   }
   }finally{this.running=false;}
  })();
 }
 close(){if(this.closed)return;this.closed=true;this.invalidate();}
}
