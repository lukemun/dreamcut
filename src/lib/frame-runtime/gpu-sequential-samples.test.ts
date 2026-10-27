import test from 'node:test';
import assert from 'node:assert/strict';
import {SequentialSamples} from '../gpu-preview/sequential-samples';

function fixture(){
 let opens=0,returns=0,closed=0;
 const sample=(timestamp:number):any=>({timestamp,duration:.1,clone(){return sample(timestamp);},close(){closed++;}});
 const reader=new SequentialSamples<any>(start=>{
  opens++;let time=Math.floor((start+1e-7)*10)/10;
  return {async next(){const value=sample(time);time+=.1;return {value,done:false};},async return(){returns++;return {value:undefined,done:true};},[Symbol.asyncIterator](){return this;}} as AsyncGenerator<any,void,unknown>;
 },()=>128);
 return {reader,get opens(){return opens;},get returns(){return returns;},get closed(){return closed;}};
}
test('forward batches reuse a decoder and return independently owned samples',async()=>{
 const f=fixture(),signal=new AbortController().signal;
 const first=await f.reader.read(0,signal),same=await f.reader.read(50_000,signal);
 assert.notEqual(first,same);assert.equal(first.timestamp,same.timestamp);
 first.close();same.close();
 const next=await f.reader.read(100_000,signal);assert.equal(next.timestamp,.1);next.close();
 assert.equal(f.opens,1);assert.equal(f.closed,4);assert.equal(f.reader.bytes,128);
 f.reader.close();assert.equal(f.closed,5);assert.equal(f.returns,1);assert.equal(f.reader.bytes,0);
 await assert.rejects(f.reader.read(0,signal),/closed/);
});
test('backward seeks and distant jumps reset instead of decoding the intervening source',async()=>{
 const f=fixture(),signal=new AbortController().signal;
 for(const time of [200_000,100_000,1_000_000]){const sample=await f.reader.read(time,signal);sample.close();}
 assert.equal(f.opens,3);assert.equal(f.returns,2);f.reader.close();assert.equal(f.returns,3);
});
test('cancellation closes the stream and rejects late decoded samples',async()=>{
 let deliver!:(value:IteratorResult<any,void>)=>void,returned=0,closed=0;
 const reader=new SequentialSamples<any>(()=>({next(){return new Promise(resolve=>{deliver=resolve;});},async return(){returned++;return {done:true,value:undefined};},[Symbol.asyncIterator](){return this;}} as AsyncGenerator<any,void,unknown>));
 const controller=new AbortController(),pending=reader.read(0,controller.signal);
 controller.abort();assert.equal(returned,1);
 deliver({done:false,value:{timestamp:0,duration:.1,close(){closed++;},clone(){assert.fail();}}});
 await assert.rejects(pending,{name:'AbortError'});assert.equal(closed,1);reader.close();assert.equal(returned,1);
});
test('session close cannot retain or publish a late sample',async()=>{
 let deliver!:(value:IteratorResult<any,void>)=>void,closed=0;
 const reader=new SequentialSamples<any>(()=>({next(){return new Promise(resolve=>{deliver=resolve;});},async return(){return {done:true,value:undefined};},[Symbol.asyncIterator](){return this;}} as AsyncGenerator<any,void,unknown>));
 const pending=reader.read(0,new AbortController().signal);reader.close();
 deliver({done:false,value:{timestamp:0,duration:.1,close(){closed++;},clone(){assert.fail();}}});
 await assert.rejects(pending,/superseded/);assert.equal(closed,1);assert.equal(reader.bytes,0);
});

test('a backward seek waits for asynchronous decoder retirement before opening its replacement',async()=>{
 let opens=0,finish!:()=>void;
 const sample=(timestamp:number):any=>({timestamp,duration:.1,clone(){return sample(timestamp);},close(){}});
 const reader=new SequentialSamples<any>(start=>{
  const index=++opens;
  return {async next(){return {done:false,value:sample(Math.floor(start*10)/10)};},async return(){if(index===1)await new Promise<void>(resolve=>{finish=resolve;});return {done:true,value:undefined};},[Symbol.asyncIterator](){return this;}} as AsyncGenerator<any,void,unknown>;
 });
 (await reader.read(200_000,new AbortController().signal)).close();
 const second=reader.read(0,new AbortController().signal);
 await Promise.resolve();assert.equal(opens,1);
 finish();(await second).close();assert.equal(opens,2);await reader.close();
});

test('cancelling a retirement wait does not open a decoder and close still awaits cleanup',async()=>{
 let finish!:()=>void,opens=0;
 const sample:any={timestamp:.2,duration:.1,clone(){return {...this};},close(){}};
 const reader=new SequentialSamples<any>(()=>{opens++;return {async next(){return {done:false,value:sample};},async return(){await new Promise<void>(resolve=>{finish=resolve;});return {done:true,value:undefined};},[Symbol.asyncIterator](){return this;}} as AsyncGenerator<any,void,unknown>;});
 (await reader.read(200_000,new AbortController().signal)).close();
 const abort=new AbortController(),pending=reader.read(0,abort.signal);abort.abort();
 await assert.rejects(pending,{name:'AbortError'});assert.equal(opens,1);
 let drained=false;const close=reader.close().then(()=>{drained=true;});
 await Promise.resolve();assert.equal(drained,false);finish();await close;assert.equal(drained,true);
});

test('failed decoder cleanup prevents replacement instead of claiming released capacity',async()=>{
 let opens=0;
 const sample:any={timestamp:.2,duration:.1,clone(){return {...this};},close(){}};
 const reader=new SequentialSamples<any>(()=>{opens++;return {async next(){return {done:false,value:sample};},async return(){throw Error('cleanup failed');},[Symbol.asyncIterator](){return this;}} as AsyncGenerator<any,void,unknown>;});
 (await reader.read(200_000,new AbortController().signal)).close();
 await assert.rejects(reader.read(0,new AbortController().signal),/cleanup failed/);
 assert.equal(opens,1);await assert.rejects(reader.close(),/cleanup failed/);
});

test('quantized WebM PTS holds the previous picture through only the rounding gap',async()=>{
 let closed=0;
 const sample=(timestamp:number):any=>({timestamp,duration:.033333,clone(){return sample(timestamp);},close(){closed++;}});
 const reader=new SequentialSamples<any>(async function*(){yield sample(.7);yield sample(.734);yield sample(.767);},()=>128);
 const signal=new AbortController().signal;
 const held=await reader.read(733333,signal);
 assert.equal(held.timestamp,.7);
 assert.deepEqual(reader.interval(held),{timestampUs:700000,durationUs:34000});
 assert.equal(reader.bytes,256);held.close();
 const next=await reader.read(734000,signal);assert.equal(next.timestamp,.734);next.close();
 await reader.close();assert.equal(closed,4);assert.equal(reader.bytes,0);
});

test('does not conceal a missing frame or extend the final picture past EOF',async()=>{
 const sample=(timestamp:number):any=>({timestamp,duration:.033333,clone(){return sample(timestamp);},close(){}});
 for(const timestamps of [[.7,.8],[.7]]){
  const reader=new SequentialSamples<any>(async function*(){for(const at of timestamps)yield sample(at);});
  await assert.rejects(reader.read(733333,new AbortController().signal),/No sequential picture|ended before/);
  await reader.close();assert.equal(reader.bytes,0);
 }
});

test('unknown WebM duration uses the next presentation timestamp without altering the sample',async()=>{
 let closed=0;
 const sample=(timestamp:number,duration:number):any=>({timestamp,duration,clone(){return sample(timestamp,duration);},close(){closed++;}});
 const reader=new SequentialSamples<any>(async function*(){yield sample(.7,0);yield sample(.734,.033);});
 const held=await reader.read(733333,new AbortController().signal);
 assert.equal(held.timestamp,.7);assert.equal(held.duration,0);
 assert.deepEqual(reader.interval(held),{timestampUs:700000,durationUs:34000});
 held.close();await reader.close();assert.equal(closed,3);
});
