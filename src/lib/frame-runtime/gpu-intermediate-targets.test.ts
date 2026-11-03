import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuIntermediateTargets} from '../gpu-preview/intermediate-targets';
import {postBlurPlan} from '../gpu-preview/post-blur-pass';

function fixture(budget=800){
  const events:string[]=[];
  let live=0,peak=0,failAt='';
  const device={limits:{maxTextureDimension2D:4096},createTexture(descriptor:GPUTextureDescriptor){
    const name=descriptor.label!;
    if(name===failAt)throw Error('allocation failed');
    const [w,h]=descriptor.size as number[],bytes=w*h*(descriptor.format==='rgba16float'?8:descriptor.format==='r16float'?2:4);
    live+=bytes;peak=Math.max(peak,live);events.push(`create:${name}`);
    let destroyed=false;
    return {destroy(){assert.equal(destroyed,false,'target destroyed twice');destroyed=true;live-=bytes;events.push(`destroy:${name}`);}} as GPUTexture;
  }} as Pick<GPUDevice,'createTexture'|'limits'>;
  // WebGPU constants do not exist in Node; the fake device records ownership only.
  const previous=Object.getOwnPropertyDescriptor(globalThis,'GPUTextureUsage');
  Object.defineProperty(globalThis,'GPUTextureUsage',{configurable:true,value:{COPY_SRC:1,COPY_DST:2,TEXTURE_BINDING:4,RENDER_ATTACHMENT:16}});
  const pool=new GpuIntermediateTargets(device,budget);
  return {pool,events,fail(name:string){failAt=`DreamCut ${name}`;},stats:()=>({live,peak}),close(){pool.close();if(previous)Object.defineProperty(globalThis,'GPUTextureUsage',previous);else Reflect.deleteProperty(globalThis,'GPUTextureUsage');}};
}

test('fractional final reductions with equal storage dimensions cannot read their own render target',()=>{
  const plan=postBlurPlan(320,320,67,2);
  const last=plan.reductions.at(-1)!,previous=plan.reductions.at(-2)!;
  assert.equal(last.width,previous.width);assert.equal(last.height,previous.height);
  const f=fixture(1024*1024);
  try{
    const targets=f.pool.prepare(plan.reductions.map(size=>({key:size.key,width:size.width,height:size.height})));
    assert.equal(targets.size,plan.reductions.length);
    assert.notEqual(targets.get(last.key)!.texture,targets.get(previous.key)!.texture);
    assert.ok(f.stats().peak<=1024*1024);
  }finally{f.close();}
  assert.equal(f.stats().live,0);
});

test('targets reuse identities and retire obsolete surfaces before resizing within budget',()=>{
  const f=fixture();try{
    const first=f.pool.prepare([{key:'actor',width:10,height:10},{key:'blur',width:10,height:10}]);
    const again=f.pool.prepare([{key:'blur',width:10,height:10},{key:'actor',width:10,height:10}]);
    assert.equal(first.get('actor')!.texture,again.get('actor')!.texture);
    assert.equal(f.events.length,2);
    f.pool.prepare([{key:'actor',width:20,height:10}]);
    assert.equal(f.pool.bytes,800);assert.equal(f.stats().peak,800);
    assert.deepEqual(f.events.slice(2),['destroy:DreamCut actor','destroy:DreamCut blur','create:DreamCut actor']);
    f.pool.prepare([]);assert.equal(f.pool.bytes,0);assert.equal(f.stats().live,0);
  }finally{f.close();}
});

test('invalid complete plans leave existing resources untouched',()=>{
  const f=fixture();try{
    f.pool.prepare([{key:'keep',width:10,height:10}]);
    for(const plan of [
      [{key:'large',width:20,height:20}],
      [{key:'bad',width:0,height:10}],
      [{key:'bad',width:4097,height:1}],
      [{key:'bad',width:NaN,height:1}],
      [{key:'same',width:1,height:1},{key:'same',width:1,height:1}],
      [{key:'',width:1,height:1}],
    ])assert.throws(()=>f.pool.prepare(plan));
    assert.deepEqual(f.events,['create:DreamCut keep']);assert.equal(f.pool.bytes,400);
  }finally{f.close();}
});

test('allocation failure rolls back new surfaces, retains compatible resources and permits retry',()=>{
  const f=fixture(1200);try{
    const original=f.pool.prepare([{key:'keep',width:10,height:10}]).get('keep')!.texture;
    f.fail('fail');
    const plan=['keep','new','fail'].map(key=>({key,width:10,height:10}));
    assert.throws(()=>f.pool.prepare(plan),/allocation failed/);
    assert.equal(f.pool.bytes,400);assert.equal(f.stats().live,400);
    f.fail('');
    const retry=f.pool.prepare(plan);assert.equal(retry.get('keep')!.texture,original);
    assert.equal(f.pool.bytes,1200);assert.equal(f.stats().peak,1200);
    f.pool.close();f.pool.close();assert.equal(f.stats().live,0);
    assert.throws(()=>f.pool.prepare([]),/closed/);
  }finally{f.close();}
});

test('higher precision filter targets account for eight bytes per pixel and cannot reuse RGBA8 storage',()=>{
 const f=fixture(800);try{
  const first=f.pool.prepare([{key:'actor',width:10,height:10}]).get('actor')!.texture;
  const next=f.pool.prepare([{key:'actor',width:10,height:10,format:'rgba16float'}]);
  assert.notEqual(next.get('actor')!.texture,first);assert.equal(f.pool.bytes,800);assert.equal(f.stats().peak,800);
  assert.throws(()=>f.pool.prepare([{key:'actor',width:11,height:10,format:'rgba16float'}]),/budget/);
 }finally{f.close();}
});

test('alpha-only half-float targets preserve precision with one quarter of RGBA storage',()=>{
 const f=fixture(800);try{
  const rgba=f.pool.prepare([{key:'mask',width:10,height:10,format:'rgba16float'}]).get('mask')!;
  assert.equal(rgba.bytes,800);
  const alpha=f.pool.prepare([{key:'mask',width:10,height:10,format:'r16float'}]).get('mask')!;
  assert.equal(alpha.bytes,200);assert.notEqual(alpha.texture,rgba.texture);
  assert.equal(f.stats().peak,800);assert.equal(f.stats().live,200);
  f.pool.close();assert.equal(f.stats().live,0);
 }finally{f.close();}
});

test('blend scene and backdrop use distinct bounded BGRA textures and retire on return to normal',()=>{
 const f=fixture(1200);
 try{
  const targets=f.pool.prepare(['blend-scene','blend-backdrop','blend-actor'].map(key=>({key,width:10,height:10,format:key==='blend-actor'?'rgba8unorm' as const:'bgra8unorm' as const})));
  assert.notEqual(targets.get('blend-scene')!.texture,targets.get('blend-backdrop')!.texture);
  assert.equal(f.pool.bytes,1200);
  assert.throws(()=>f.pool.prepare([{key:'blend-scene',width:20,height:20,format:'bgra8unorm'}]),/budget/);
  assert.equal(f.pool.bytes,1200,'failed plan preserves the current complete scene');
  f.pool.prepare([]);assert.equal(f.stats().live,0);
 }finally{f.close();}
});
