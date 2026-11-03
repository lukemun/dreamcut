import {decodedSampleInterval,decoderSampleTime} from './sample-time';

type Sample<T>={timestamp:number;duration:number;clone():T;close():void};

/** Up to two retained samples and one forward iterator per admitted source. The sink
 * owns its bounded decode queue; consumers own the clones returned by read. */
export class SequentialSamples<T extends Sample<T>> {
 private iterator:AsyncGenerator<T,void,unknown>|undefined;
 private held:T|undefined;
 private ahead:T|undefined;
 private intervals=new WeakMap<T,{timestampUs:number;durationUs:number}>();
 private closed=false;
 private retirement:Promise<void>|undefined;
 constructor(private readonly open:(startSeconds:number)=>AsyncGenerator<T,void,unknown>,private readonly size:(sample:T)=>number=()=>0){}
 get bytes(){return (this.held?this.size(this.held):0)+(this.ahead?this.size(this.ahead):0);}
 interval(sample:T){return this.intervals.get(sample)??decodedSampleInterval(sample.timestamp,sample.duration);}
 private copy(){const sample=this.held!.clone();this.intervals.set(sample,this.interval(this.held!));return sample;}
 private reset(){
  const iterator=this.iterator;this.iterator=undefined;
  this.held?.close();this.held=undefined;
  this.ahead?.close();this.ahead=undefined;
  if(iterator){
   const retirement=iterator.return().then(()=>{if(this.retirement===retirement)this.retirement=undefined;});
   this.retirement=retirement;
   // Cancellation can initiate cleanup without an awaiting caller. Keep failures
   // observable by the next read/close without an unhandled promise rejection.
   void retirement.catch(()=>{});
  }
 }
 async read(timeUs:number,signal:AbortSignal):Promise<T>{
  signal.throwIfAborted();if(this.closed)throw Error('Sequential decoder closed');
  if(this.held){
   const at=this.interval(this.held);
   if(timeUs<at.timestampUs||timeUs>=at.timestampUs+at.durationUs+500_000)this.reset();
  }
  if(this.retirement){
   const pending=this.retirement;
   await new Promise<void>((resolve,reject)=>{
    const abort=()=>{signal.removeEventListener('abort',abort);reject(signal.reason);};
    signal.addEventListener('abort',abort,{once:true});
    pending.then(()=>{signal.removeEventListener('abort',abort);resolve();},error=>{signal.removeEventListener('abort',abort);reject(error);});
    if(signal.aborted)abort();
   });
   signal.throwIfAborted();if(this.closed)throw Error('Sequential decoder closed');
  }
  if(!this.iterator)this.iterator=this.open(decoderSampleTime(timeUs));
  const iterator=this.iterator;
  const abort=()=>this.reset();signal.addEventListener('abort',abort,{once:true});
  try{
   while(true){
    signal.throwIfAborted();if(this.closed)throw Error('Sequential decoder closed');
    if(this.held){
     const at=this.interval(this.held);
     if(timeUs>=at.timestampUs&&timeUs<at.timestampUs+at.durationUs)return this.copy();
     if(at.timestampUs>timeUs)throw Error(`No sequential picture covers ${timeUs} us (next ${at.timestampUs}, duration ${at.durationUs})`);
     // WebM may omit duration, or quantize PTS to milliseconds while its
     // nominal duration is more precise. Resolve unknown durations and tiny
     // rounding gaps against the next actual PTS. Do not extend EOF or bridge
     // a larger gap when an explicit positive duration was supplied.
     if(!this.ahead){
      const next=await iterator.next();
      if(signal.aborted||this.closed||this.iterator!==iterator){next.value?.close();signal.throwIfAborted();throw Error('Sequential decoder superseded');}
      if(next.done)throw Error(`Sequential decoder ended before ${timeUs} us`);
      this.ahead=next.value;
     }
     const nextAt=this.interval(this.ahead).timestampUs;
     const gap=nextAt-(at.timestampUs+at.durationUs);
     if((at.durationUs===0&&nextAt>at.timestampUs||gap>0&&gap<=1_000)&&timeUs<nextAt){
      this.intervals.set(this.held,{timestampUs:at.timestampUs,durationUs:nextAt-at.timestampUs});
      return this.copy();
     }
     if(timeUs<nextAt)throw Error(`No sequential picture covers ${timeUs} us (previous ${at.timestampUs}+${at.durationUs}, next ${nextAt}, gap ${gap})`);
     this.held.close();this.held=this.ahead;this.ahead=undefined;
     continue;
    }
    const next=await iterator.next();
    if(signal.aborted||this.closed||this.iterator!==iterator){next.value?.close();signal.throwIfAborted();throw Error('Sequential decoder superseded');}
    if(next.done)throw Error(`Sequential decoder ended before ${timeUs} us`);
    this.held=next.value;
   }
  }catch(error){this.reset();throw error;}
  finally{signal.removeEventListener('abort',abort);}
 }
 close():Promise<void>{if(!this.closed){this.closed=true;this.reset();}return this.retirement??Promise.resolve();}
}
