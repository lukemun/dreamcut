import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

// Exercise the pinned dependency's actual private wrapper, with controllable
// workers. A GC-based test is nondeterministic; count every owned sample instead.
const require=createRequire(import.meta.url);
const root=path.resolve(path.dirname(require.resolve('mediabunny')),'../..');
const source=readFileSync(path.join(root,'dist/modules/src/media-sink.js'),'utf8');
const wrapper=source.slice(source.indexOf('class VideoDecoderWrapper extends'),source.indexOf('let mergerWorkerUrl'));
function fixture(){
 const samples:{closed:number;close():void}[]=[];
 const Wrapper=vm.runInNewContext(`(${wrapper})`,{
  DecoderWrapper:class {}, assert,
  VideoSample:class {closed=0;constructor(){samples.push(this);}close(){this.closed++;}},
  promiseWithResolvers:()=>Promise.withResolvers(),
  removeItem:(items:unknown[],item:unknown)=>{const i=items.indexOf(item);if(i>=0)items.splice(i,1);},
 });
 const pending:ReturnType<typeof Promise.withResolvers>[]=[];
 const emitted:unknown[]=[];
 const errors:unknown[]=[];
 const decoder=Object.assign(Object.create(Wrapper.prototype),{
  mergeAlphaPromises:[],finalSamples:[],sampleQueue:[],colorQueue:[],alphaQueue:[],
  decoder:{state:'configured',close(){this.state='closed';}},
  merger:{merge(){const result=Promise.withResolvers();pending.push(result);return result.promise;},close(){}},
  sampleHandler:(sample:unknown)=>emitted.push(sample),onError:(error:unknown)=>errors.push(error),
 });
 return {decoder,pending,samples,emitted,errors};
}
test('transparent decoder closes a completed sample stranded behind a cancelled merge',async()=>{
 const f=fixture();const first=f.decoder.mergeAlpha({},{}),second=f.decoder.mergeAlpha({},{});
 f.pending[1].resolve({});await second;
 assert.equal(f.samples.length,1);assert.equal(f.emitted.length,0);
 f.decoder.close();f.pending[0].reject(Error('Worker terminated'));await first;
 assert.equal(f.samples[0].closed,1);assert.equal(f.decoder.finalSamples.length,0);
});
test('transparent decoder closes a merge that finishes after shutdown',async()=>{
 const f=fixture();const job=f.decoder.mergeAlpha({},{});
 f.decoder.close();f.pending[0].resolve({});await job;
 assert.equal(f.emitted.length,0);assert.equal(f.samples[0].closed,1);
});
test('transparent decoder preserves order and transfers successful samples to its consumer',async()=>{
 const f=fixture();const first=f.decoder.mergeAlpha({},{}),second=f.decoder.mergeAlpha({},{});
 f.pending[1].resolve({});await second;f.pending[0].resolve({});await first;
 assert.deepEqual(f.emitted,[f.samples[1],f.samples[0]]);
 f.decoder.close();assert.ok(f.samples.every(sample=>sample.closed===0));
 for(const sample of f.samples)sample.close();
});
test('transparent decoder rejects late callbacks without restarting workers',async()=>{
 const f=fixture();f.decoder.close();f.decoder.close();
 let closed=0;const frame=()=>({close(){closed++;}});
 await f.decoder.mergeAlpha(frame(),frame());
 assert.equal(closed,2);assert.equal(f.pending.length,0);assert.equal(f.samples.length,0);
 assert.equal(f.decoder.finalSamples.length,0);
});
