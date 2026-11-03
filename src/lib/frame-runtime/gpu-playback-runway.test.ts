import test from 'node:test';
import assert from 'node:assert/strict';
import {playbackRunwayFrames,ProductionRate,RUNWAY_MARGIN} from '../gpu-preview/playback-runway';
import {GpuPictureQueue} from '../gpu-preview/picture-queue';

test('runway covers the measured production deficit over the horizon, within the display buffer',()=>{
 const base={consumedFps:30,horizonFrames:150,minFrames:15,capacity:60};
 // 25 of 30 pictures a second: 150 frames need 150 × (1 − 25/30) = 25 in hand, plus the margin.
 assert.equal(playbackRunwayFrames({...base,producedFps:25}),Math.ceil(25*RUNWAY_MARGIN));
 // A producer as fast as playback needs only the startup runway.
 assert.equal(playbackRunwayFrames({...base,producedFps:30}),15);
 assert.equal(playbackRunwayFrames({...base,producedFps:90}),15);
 // Unmeasured: the minimum, whose own pictures measure the producer.
 assert.equal(playbackRunwayFrames({...base,producedFps:null}),15);
 // A slow producer holds the whole buffer, never more.
 assert.equal(playbackRunwayFrames({...base,producedFps:5}),60);
 // Near the end of the timeline only the remaining frames are needed.
 assert.equal(playbackRunwayFrames({...base,producedFps:5,horizonFrames:8}),8);
 // Faster playback raises the deficit.
 assert.ok(playbackRunwayFrames({...base,producedFps:25,consumedFps:45})>playbackRunwayFrames({...base,producedFps:25}));
});

test('production rate is pictures per second of production time over the latest pictures',()=>{
 const rate=new ProductionRate(4,2);
 assert.equal(rate.fps,null);
 rate.record(40);assert.equal(rate.fps,null);
 rate.record(40);assert.equal(rate.fps,25);
 for(const ms of [10,10,10,10])rate.record(ms);
 assert.equal(rate.fps,100,'only the latest window counts');
 rate.clear();assert.equal(rate.fps,null);
 // The slowest tenth (decoders starting after a seek) does not set the rate.
 const window=new ProductionRate(30,5);
 for(let i=0;i<27;i++)window.record(30);
 for(let i=0;i<3;i++)window.record(400);
 assert.ok(Math.abs(window.fps!-1000/30)<1e-9,`fps ${window.fps}`);
 // A producer slow throughout is still measured as slow.
 for(let i=0;i<30;i++)window.record(50);
 assert.equal(window.fps,20);
});

/**
 * Deterministic playback against a producer slower than playback: virtual time, a sequential
 * producer taking `produceMs` per picture, and a transport consuming one frame per `1000/fps` ms
 * that holds whenever its next picture is not ready (as GpuPlaybackComposition does).
 */
async function simulate({produceMs,frames,capacity,policy}:{produceMs:number;frames:number;capacity:number;policy:'runway'|'resume-at-once'}){
 let now=0;const timers:Array<{at:number;run:()=>void}>=[];
 const later=(ms:number)=>new Promise<void>(resolve=>timers.push({at:now+ms,run:resolve}));
 const flush=async()=>{for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));};
 const queue=new GpuPictureQueue(async(frame:number)=>{await later(produceMs);return {frame,bytes:1,close(){}};},()=>{},capacity,error=>{throw error;});
 queue.now=()=>now;
 const fps=30,interval=1000/fps,end=frames;
 const episodes:Array<{frame:number;ms:number}>=[];let playedTo=0,done=false;
 const hold=async(frame:number)=>{
  if(policy==='runway')await queue.holdRunway(frame,fps,15);
 };
 const transport=(async()=>{
  // Play: the startup runway, then play; each late picture is a hold (one episode).
  let started=now;await queue.request(0,end);await hold(0);episodes.push({frame:0,ms:now-started});
  let base=now,from=0;
  for(let frame=1;frame<end;frame++){
   const due=base+(frame-from)*interval;
   if(due>now)await later(due-now);
   if(queue.has(frame)){await queue.request(frame,end);playedTo=frame;continue;}
   started=now;await queue.request(frame,end);await hold(frame);episodes.push({frame,ms:now-started});
   base=now;from=frame;playedTo=frame;
  }
  done=true;
 })();
 while(!done){
  await flush();
  if(done)break;
  timers.sort((a,b)=>a.at-b.at);
  const next=timers.shift();if(!next)throw Error(`stuck at frame ${playedTo}`);
  now=Math.max(now,next.at);next.run();
 }
 await transport;queue.close();
 return {episodes,playedTo};
}

test('a producer behind playback buffers once, then plays through without stopping',async()=>{
 // 25 pictures a second against 30: resuming on each late picture stops again every few frames.
 const naive=await simulate({produceMs:40,frames:150,capacity:60,policy:'resume-at-once'});
 assert.ok(naive.episodes.length>10,`resume-at-once stalled ${naive.episodes.length} times`);
 const runway=await simulate({produceMs:40,frames:150,capacity:60,policy:'runway'});
 assert.equal(runway.playedTo,149,'playback resumes and reaches the end');
 assert.equal(runway.episodes.length,1,`one hold (at Play), got ${JSON.stringify(runway.episodes)}`);
 assert.equal(runway.episodes[0].frame,0);
});

test('a stall mid-play holds once for the runway, then resumes to the end',async()=>{
 // The producer is measured only once playback has fallen behind: the first hold is mid-play.
 const result=await simulate({produceMs:36,frames:240,capacity:60,policy:'runway'});
 assert.equal(result.playedTo,239);
 assert.ok(result.episodes.length<=2,`holds ${JSON.stringify(result.episodes)}`);
});

test('a display buffer too small for the deficit holds a full buffer each time, not every few frames',async()=>{
 const naive=await simulate({produceMs:60,frames:150,capacity:20,policy:'resume-at-once'});
 const runway=await simulate({produceMs:60,frames:150,capacity:20,policy:'runway'});
 assert.equal(runway.playedTo,149);
 // Each hold fills the 20-picture buffer, which plays 20 / (30 − 16.7) ≈ 1.5 s before the next.
 assert.ok(runway.episodes.length<=5,`holds ${runway.episodes.length}`);
 assert.ok(naive.episodes.length>runway.episodes.length*5,`naive ${naive.episodes.length} vs runway ${runway.episodes.length}`);
});

/** A virtual-time producer for the queue: `ms(frame)` is the production time, `cached(frame)` marks a replay-cache picture. */
function virtualQueue({ms,cached=()=>false,capacity=30,onCost}:{ms:(frame:number)=>number;cached?:(frame:number)=>boolean;capacity?:number;onCost?:(frame:number,cost:number)=>void}){
 const clock={now:0};const timers:Array<{at:number;run:()=>void}>=[];
 const queue=new GpuPictureQueue(async(frame:number)=>{await new Promise<void>(resolve=>timers.push({at:clock.now+ms(frame),run:resolve}));return {frame,replayHit:cached(frame),bytes:1,close(){}};},()=>{},capacity,error=>{throw error;},undefined,
  {capacity:8,thresholdMs:33,cost:()=>0,onCost});
 queue.now=()=>clock.now;queue.cached=picture=>picture.replayHit;
 const run=async(until:()=>boolean)=>{
  for(let guard=0;guard<10000&&!until();guard++){
   for(let i=0;i<10;i++)await new Promise(resolve=>setImmediate(resolve));
   if(until())break;
   timers.sort((a,b)=>a.at-b.at);const next=timers.shift();if(!next)break;clock.now=Math.max(clock.now,next.at);next.run();
  }
 };
 return {queue,clock,run};
}

test('a runway hold is not recorded as the stalled frame\'s cost; a genuinely slow picture still is',async()=>{
 const costs:Array<[number,number]>=[];
 const {queue,clock,run}=virtualQueue({ms:frame=>frame===40?400:40,onCost:(frame,cost)=>costs.push([frame,cost])});
 // Playing at 10 (as GpuPlaybackComposition does on a stall): the wait is measured when the picture arrives, then the hold runs.
 const requestedAt=clock.now;let got=false;
 const picture=queue.request(10,200).then(()=>{got=true;});
 await run(()=>got);await picture;
 const pictureWaitMs=clock.now-requestedAt;
 let held=false;const hold=queue.holdRunway(10,30,15).then(()=>{held=true;});
 await run(()=>held);await hold;
 assert.ok(clock.now-requestedAt>1000,`the hold took ${clock.now-requestedAt} ms`);
 queue.recordPlaybackWait(10,pictureWaitMs);
 assert.deepEqual(costs,[],'a 40 ms picture is not remembered as costly');
 assert.equal(queue.replayStats.retained,0);
 // Frame 40 takes 400 ms to make; playback that waited for it records it.
 const slowAt=clock.now;let slow=false;
 const waited=queue.request(40,200).then(()=>{slow=true;});
 await run(()=>slow);await waited;
 queue.recordPlaybackWait(40,clock.now-slowAt);
 assert.equal(costs.length,1);assert.equal(costs[0][0],40);assert.ok(costs[0][1]>=400);
 queue.close();
});

test('replay-cache pictures do not count as production; the runway into an uncached stretch uses real production',async()=>{
 // Frames below 100 replay from the cache (2 ms); from 100 on they are composited at 50 ms (20 per second).
 const {queue,run}=virtualQueue({ms:frame=>frame<100?2:50,cached:frame=>frame<100});
 let got=false;const first=queue.request(60,400).then(()=>{got=true;});
 await run(()=>got&&queue.has(89));await first;
 assert.equal(queue.productionFps,null,'cached pictures alone do not measure the producer');
 // Playback reaches the uncached stretch: a few composited pictures set the rate.
 let reached=false;const at=queue.request(100,400).then(()=>{reached=true;});
 await run(()=>reached&&queue.has(106));await at;
 assert.equal(queue.productionFps,20);
 // 20 against 30 per second over 300 frames needs the whole buffer, not the minimum.
 assert.equal(queue.runway(100,30,15),30);
 queue.close();
});
