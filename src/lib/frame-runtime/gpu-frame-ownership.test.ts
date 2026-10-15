import test from 'node:test';
import assert from 'node:assert/strict';
import {FrameStore, type CachedFrame} from '../gpu-preview/frame-store';
import {GpuFrameController} from '../gpu-preview/frame-controller';
function fixture(budget=30) {
  const freed: string[] = [], store = new FrameStore<string>(budget), controller = new GpuFrameController(store);
  const frame=(sourceKey:string,timestampUs:number,durationUs=10,bytes=10):CachedFrame<string>=>({sourceKey,timestampUs,durationUs,bytes,value:`${sourceKey}:${timestampUs}`,release:()=>freed.push(`${sourceKey}:${timestampUs}`)});
  return {freed,store,controller,frame};
}
test('speculative cache probes preserve actual consumption priority and half-open intervals',()=>{
 const {store,frame,freed}=fixture(20);
 store.put(frame('future',0));store.put(frame('displayed',0));
 const displayed=store.acquire('displayed',0)!;displayed.release();
 for(let i=0;i<30;i++)assert.equal(store.has('future',5),true);
 assert.equal(store.has('future',10),false);assert.equal(store.has('future',-1),false);
 assert.equal(store.has('future',NaN),false);assert.equal(store.has('missing',0),false);
 store.put(frame('next',0));
 assert.deepEqual(freed,['future:0']);assert.equal(store.has('displayed',0),true);
 store.invalidate('displayed');assert.equal(store.has('displayed',0),false);
 store.close();assert.equal(store.has('next',0),false);assert.equal(store.bytes,0);
});
test('partial RGB/mask readiness cannot publish; all slots use their declared source time',()=>{
  const {controller:c,frame}=fixture();
  const t=c.request('scene',12,[{slot:'rgb',sourceKey:'rgb',timeUs:10},{slot:'mask',sourceKey:'mask',timeUs:10}]);
  c.offer(t,frame('rgb',10)); c.offer(t,frame('mask',0));
  assert.equal(c.acquire(t),null);
  c.offer(t,frame('mask',10));
  const p=c.acquire(t)!;assert.ok(p);const drawn:string[]=[];
  assert.equal(c.submit(p,m=>drawn.push(...[...m.values()].map(f=>f.value))),true);
  assert.deepEqual(drawn,['rgb:10','mask:10']);c.close();
});
test('a seek between acquisition and submission rejects old packet and late decode',()=>{
  const {controller:c,frame,freed}=fixture();
  const a=c.request('scene',1,[{slot:'rgb',sourceKey:'rgb',timeUs:10}]);c.offer(a,frame('rgb',10));
  const p=c.acquire(a)!;c.invalidatePending();
  const b=c.request('scene',0,[{slot:'rgb',sourceKey:'rgb',timeUs:0}]);
  assert.equal(c.offer(a,frame('rgb',20)),false);
  assert.equal(c.submit(p,()=>assert.fail('Stale submission')),false);
  c.offer(b,frame('rgb',0));assert.equal(c.submit(c.acquire(b)!,m=>assert.equal(m.get('rgb')?.timestampUs,0)),true);
  c.close();assert.deepEqual(freed.sort(),['rgb:0','rgb:10','rgb:20']);
});
test('VFR intervals are half-open; duplicate source layers can select different frames',()=>{
  const {controller:c,frame}=fixture();
  const t=c.request('scene',3,[{slot:'back',sourceKey:'rgb',timeUs:6},{slot:'front',sourceKey:'rgb',timeUs:7}]);
  c.offer(t,frame('rgb',0,7));c.offer(t,frame('rgb',7,21));
  const p=c.acquire(t)!;assert.equal(p.frames.get('back')?.timestampUs,0);assert.equal(p.frames.get('front')?.timestampUs,7);p.release();
  const end=c.request('scene',4,[{slot:'back',sourceKey:'rgb',timeUs:28}]);assert.equal(c.acquire(end),null);c.close();
});
test('leased resources survive eviction and invalidation, with a strict byte budget',()=>{
  const {store:s,frame,freed}=fixture(20);
  s.put(frame('a',0));const held=s.acquire('a',0)!;s.put(frame('b',0));s.put(frame('c',0));
  assert.deepEqual(freed,['b:0']);assert.equal(s.bytes,20);
  s.invalidate('a');assert.equal(s.acquire('a',0),null);assert.equal(s.bytes,20);
  const other=s.acquire('c',0)!;assert.equal(s.put(frame('d',0)),false);
  s.close();assert.equal(s.bytes,20);held.release();held.release();other.release();
  assert.equal(s.bytes,0);assert.deepEqual(freed,['b:0','d:0','a:0','c:0']);
});
test('revising text reuses an unchanged source mask; replacement source never hits old identity',()=>{
  const {controller:c,store:s,frame}=fixture();
  const a=c.request('text-one',0,[{slot:'mask',sourceKey:'mask-hash',timeUs:0}]);c.offer(a,frame('mask-hash',0));
  const b=c.request('text-two',0,[{slot:'mask',sourceKey:'mask-hash',timeUs:0}]);assert.equal(c.acquire(a),null);
  const p=c.acquire(b)!;assert.ok(p);p.release();
  const changed=c.request('text-two',0,[{slot:'mask',sourceKey:'new-mask-hash',timeUs:0}]);assert.equal(c.acquire(changed),null);assert.equal(s.size,1);c.close();
});
test('failed draw releases leases; invalid and duplicate resources are closed',()=>{
  const {controller:c,store:s,frame,freed}=fixture();
  const t=c.request('scene',0,[{slot:'rgb',sourceKey:'rgb',timeUs:0}]);c.offer(t,frame('rgb',0));c.offer(t,frame('rgb',0));
  assert.equal(s.put(frame('invalid',0,0)),false);
  assert.throws(()=>c.submit(c.acquire(t)!,()=>{throw Error('device lost');}),/device lost/);
  c.close();assert.equal(s.bytes,0);assert.deepEqual(freed,['rgb:0','invalid:0','rgb:0']);
});

test('a released or already submitted packet cannot reuse closed resources',()=>{
  const {controller:c,frame}=fixture();
  const t=c.request('scene',0,[{slot:'rgb',sourceKey:'rgb',timeUs:0}]);c.offer(t,frame('rgb',0));
  const p=c.acquire(t)!;assert.equal(c.submit(p,()=>{}),true);
  assert.equal(c.submit(p,()=>assert.fail('Double submit')),false);
  const q=c.acquire(t)!;q.release();assert.equal(c.submit(q,()=>assert.fail('Released submit')),false);c.close();
});

test('pending layers stay pinned while lookahead fills the bounded cache',()=>{
  const {controller:c,store:s,frame}=fixture(20);
  s.put(frame('rgb',0));
  const t=c.request('scene',0,[{slot:'rgb',sourceKey:'rgb',timeUs:0},{slot:'mask',sourceKey:'mask',timeUs:0}]);
  c.cache(frame('rgb',10));c.cache(frame('rgb',20));
  c.cache(frame('mask',0));
  // Both dependencies are now pinned, even before asynchronous text is ready.
  assert.equal(c.cache(frame('rgb',30)),false);
  assert.equal(s.bytes,20);
  assert.equal(c.submit(c.acquire(t)!,m=>assert.deepEqual([...m.values()].map(f=>f.value),['rgb:0','mask:0'])),true);
  assert.equal(c.cache(frame('rgb',30)),true);c.close();assert.equal(s.bytes,0);
});
test('cancelled preparation releases pins without cancelling a newer request',()=>{
  const {controller:c,store:s,frame}=fixture(10);
  const old=c.request('scene',0,[{slot:'rgb',sourceKey:'rgb',timeUs:0}]);c.offer(old,frame('rgb',0));
  c.invalidatePending();
  const next=c.request('scene',1,[{slot:'rgb',sourceKey:'rgb',timeUs:10}]);c.offer(next,frame('rgb',10));
  c.finish(old);assert.equal(c.cache(frame('other',0)),false);
  c.finish(next);assert.equal(c.cache(frame('other',0)),true);c.close();assert.equal(s.bytes,0);
});
test('a re-delivered picture stretched across a millisecond-rounding gap keeps the longer span',()=>{
 // WebM at 30 fps: a picture at 933000 us with a 33 ms container duration, the next at 967000 us.
 const {store,frame,freed}=fixture(100);
 store.put(frame('webm',933_000,33_000));
 assert.equal(store.has('webm',966_667),false);
 // The sequential reader bridges the 1 ms gap to the next picture and delivers it again.
 assert.equal(store.put(frame('webm',933_000,34_000)),true);
 assert.equal(store.has('webm',966_667),true);
 assert.equal(store.size,1);assert.deepEqual(freed,['webm:933000']);
 // A shorter re-delivery never shrinks what is cached.
 store.put(frame('webm',933_000,33_000));
 assert.equal(store.has('webm',966_667),true);
});
