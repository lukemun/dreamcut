/** Bounded diagnostic evidence for a playback run, independent of DOM polling.
 * Does not own the transport, readiness, or rendering decisions. */
export class GpuPlaybackMetrics {
 private epoch:unknown;
 private firstAt=0;
 private firstFrame=0;
 private lastAt=0;
 private count=0;
 private stalls:Array<{frame:number;gapMs:number;resourceMs:number;drawMs:number}>=[];
 private maxGapMs=0;
 private late=0;
 record(epoch:unknown,playing:boolean,at:number,p:{frame:number;resourceMs:number;submitMs:number}){
  if(!playing)return;
  if(epoch!==this.epoch){this.epoch=epoch;this.firstAt=at;this.firstFrame=p.frame;this.lastAt=at;this.count=0;this.stalls=[];this.maxGapMs=0;this.late=0;}
  const gapMs=at-this.lastAt;this.lastAt=at;this.count++;this.maxGapMs=Math.max(this.maxGapMs,gapMs);
  if(this.count>1&&gapMs>LATE_GAP_MS)this.late++;
  if(gapMs>250){this.stalls.push({frame:p.frame,gapMs,resourceMs:p.resourceMs,drawMs:p.submitMs});if(this.stalls.length>32)this.stalls.shift();}
  // Frames the playhead passed without a presented picture (the clock moved on while decoding).
  const skippedFrames=Math.max(0,p.frame-this.firstFrame+1-this.count);
  return {firstFrame:this.firstFrame,lastFrame:p.frame,elapsedMs:at-this.firstAt,presentations:this.count,maxGapMs:this.maxGapMs,
   latePresentations:this.late,skippedFrames,stalls:[...this.stalls]};
 }
}

/** A presentation later than one and a half 30 fps frame intervals after the previous one. */
const LATE_GAP_MS=50;
const SEEK_WINDOW=128;
const percentile=(sorted:readonly number[],q:number)=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*q))];

/** Paused seeks: time from request to presented picture, and how often no decode was needed.
 * A bounded window of recent seeks, so a long session reports current behaviour. */
export class GpuSeekMetrics {
 private samples:Array<{latencyMs:number;decodeFree:boolean}>=[];
 private total=0;
 record(latencyMs:number,p:{cacheMisses:number;replayHit?:boolean}){
  if(!Number.isFinite(latencyMs)||latencyMs<0)return undefined;
  this.total++;
  this.samples.push({latencyMs,decodeFree:p.cacheMisses===0||p.replayHit===true});
  if(this.samples.length>SEEK_WINDOW)this.samples.shift();
  const sorted=this.samples.map(s=>s.latencyMs).sort((a,b)=>a-b);
  return {seeks:this.total,window:sorted.length,p50Ms:percentile(sorted,.5),p95Ms:percentile(sorted,.95),maxMs:sorted.at(-1)!,
   decodeFreeRate:this.samples.filter(s=>s.decodeFree).length/this.samples.length};
 }
}
