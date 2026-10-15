import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuReplaySegmentCache,chooseReplayEncoderConfig,replayEncodeSize,type ReplayChunkLike,type ReplayDeps} from '../gpu-preview/replay-segment-cache';

const FPS=10;
function harness(budget=1_000_000,{holdOutputs=false}={}){
 const live=new Set<number>();let peak=0,decoders=0;
 const deps:ReplayDeps<{frame:number}>={
  createEncoder(output){
   let first=true;
   return {configure(){},encode(frame,{keyFrame}){const chunk:ReplayChunkLike={timestamp:frame.timestamp,byteLength:100,type:keyFrame?'key':'delta'};const meta=first?{decoderConfig:{codec:'fake'}}:undefined;first=false;queueMicrotask(()=>output(chunk,meta));},
    flush:()=>new Promise(resolve=>setTimeout(resolve,0)),close(){}};
  },
  createDecoder(output){
   decoders++;const held:ReplayChunkLike[]=[];
   const emit=(chunk:ReplayChunkLike)=>{const index=Math.round(chunk.timestamp/(1e6/FPS));live.add(index);peak=Math.max(peak,live.size);output({timestamp:chunk.timestamp,close(){live.delete(index);}});};
   return {configure(){},decode(chunk){if(holdOutputs)held.push(chunk);else setTimeout(()=>emit(chunk),0);},
    flush:async()=>{await new Promise(resolve=>setTimeout(resolve,0));for(const chunk of held.splice(0))emit(chunk);},close(){}};
  },
  captureFrame:(timestamp)=>({timestamp,close(){}}),
  present:(frame)=>({frame:Math.round(frame.timestamp/(1e6/FPS))}),
 };
 const cache=new GpuReplaySegmentCache(FPS,{codec:'fake',width:2,height:2},budget,deps);
 return {cache,stats:()=>({peak,live:live.size,decoders})};
}
const settle=()=>new Promise(resolve=>setTimeout(resolve,10));

test('a played stretch replays every frame from its segment without compositing',async()=>{
 const {cache,stats}=harness();
 for(let frame=0;frame<25;frame++)cache.record(frame,25);
 await settle();
 assert.equal(cache.stats.segments,3,'two full segments and the short final one');
 for(let frame=0;frame<25;frame++)assert.deepEqual(await cache.take(frame),{frame});
 assert.equal(cache.stats.hits,25);
 // Streaming decode keeps only a few frames open (a hardware decoder has a small pool).
 assert.ok(stats().peak<=6,`peak open frames ${stats().peak}`);
 assert.equal(stats().decoders,3,'one decode pass per segment');
});

test('a gap leaves that segment unrecorded instead of storing a broken stream',async()=>{
 const {cache}=harness();
 for(let frame=0;frame<10;frame++)if(frame!==4)cache.record(frame,30);
 for(let frame=10;frame<20;frame++)cache.record(frame,30);
 await settle();
 assert.equal(await cache.take(2),null);
 assert.deepEqual(await cache.take(12),{frame:12});
});

test('out-of-order pictures do not interrupt an in-progress segment',async()=>{
 const {cache}=harness();
 for(let frame=0;frame<10;frame++){cache.record(frame,40);if(frame===5)cache.record(27,40);}
 await settle();
 assert.deepEqual(await cache.take(9),{frame:9});
});

test('seeking back inside a segment restarts from its key frame',async()=>{
 const {cache,stats}=harness();
 for(let frame=0;frame<10;frame++)cache.record(frame,10);
 await settle();
 assert.deepEqual(await cache.take(7),{frame:7});
 assert.deepEqual(await cache.take(2),{frame:2});
 assert.equal(stats().decoders,2);
});

test('a decoder that holds output until flush still delivers the frame',async()=>{
 const {cache}=harness(1_000_000,{holdOutputs:true});
 for(let frame=0;frame<10;frame++)cache.record(frame,10);
 await settle();
 assert.deepEqual(await cache.take(0),{frame:0});
});

test('a scene change clears every recorded segment',async()=>{
 const {cache}=harness();
 for(let frame=0;frame<10;frame++)cache.record(frame,10);
 await settle();cache.clear();
 assert.equal(cache.stats.segments,0);
 assert.equal(await cache.take(3),null);
});

test('the byte budget evicts the least recently replayed segment',async()=>{
 const {cache}=harness(2500);
 for(let frame=0;frame<30;frame++)cache.record(frame,30);
 await settle();
 assert.equal(cache.stats.segments,2);
 assert.equal(cache.has(0),false);
 assert.equal(cache.has(25),true);
});

test('encoded pictures use even dimensions',()=>{
 assert.deepEqual(replayEncodeSize(500,889),{width:500,height:888});
 assert.deepEqual(replayEncodeSize(1,1),{width:2,height:2});
});

test('a backed-up encoder skips the segment instead of slowing playback',async()=>{
 const encoded:number[]=[];
 const cache=new GpuReplaySegmentCache(FPS,{codec:'fake',width:2,height:2},1_000_000,{
  createEncoder:()=>({encodeQueueSize:20,configure(){},encode(frame){encoded.push(frame.timestamp);},flush:async()=>{},close(){}}),
  createDecoder:()=>{throw Error('unused');},captureFrame:(timestamp)=>({timestamp,close(){}}),present:()=>({}),
 });
 for(let frame=0;frame<10;frame++)cache.record(frame,10);
 await settle();
 assert.equal(cache.stats.segments,0);
 assert.equal(encoded.length,0);
});

test('replay encoding prefers software H.264, so the first recording never stalls new decoders', async () => {
 const asked: VideoEncoderConfig[] = [];
 const globals = globalThis as Record<string, unknown>;
 const previous = {encoder: globals.VideoEncoder, decoder: globals.VideoDecoder};
 globals.VideoDecoder = class {};
 globals.VideoEncoder = {isConfigSupported: async (config: VideoEncoderConfig) => { asked.push(config); return {supported: true, config}; }};
 try {
  const chosen = await chooseReplayEncoderConfig(1920, 1080, 30);
  assert.equal(chosen?.codec, 'avc1.640034');
  assert.equal(chosen?.hardwareAcceleration, 'prefer-software');
  assert.equal(asked.length, 1);
 } finally { globals.VideoEncoder = previous.encoder; globals.VideoDecoder = previous.decoder; }
});
