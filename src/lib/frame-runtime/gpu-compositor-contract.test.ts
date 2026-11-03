import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuPreviewRuntime} from '../gpu-preview/runtime';
import type {GpuFrameCompositor} from '../gpu-preview/frame-compositor';

function fixture(ready=Promise.resolve(),failDraw=false){
 let draws=0,closes=0;
 const compositor:GpuFrameCompositor={ready,bytes:128,
  draw(layers){assert.deepEqual(layers,[]);if(failDraw)throw Error('Unsupported packet');draws++;},
  close(){closes++;},
 };
 // No GPU methods may be needed for an injected compositor and an empty scene.
 const runtime=new GpuPreviewRuntime({} as GPUDevice,{} as GPUCanvasContext,
  'rgba8unorm',[],[],'compositor-contract',320,320,30,compositor);
 return {runtime,stats:()=>({draws,closes})};
}

test('injected compositor uses runtime readiness, latest-seek ownership and cleanup',async()=>{
 let finish!:()=>void;
 const f=fixture(new Promise<void>(resolve=>{finish=resolve;}));
 const old=f.runtime.present(0,'old');const rejected=assert.rejects(old);
 const current=f.runtime.present(12,'current');
 assert.equal(f.stats().draws,0);finish();await rejected;
 assert.equal(await current,true);assert.equal(f.runtime.lastPresentation?.frame,12);
 assert.equal(f.stats().draws,1);assert.ok(f.runtime.bytes>=128);
 f.runtime.close();f.runtime.close();assert.equal(f.stats().closes,1);
 await assert.rejects(f.runtime.present(13,'closed'),/closed/);
});

test('alternate compositor failure cannot publish a successful presentation',async()=>{
 const f=fixture(Promise.resolve(),true);
 try{await assert.rejects(f.runtime.present(0,'failure'),/Unsupported packet/);
  assert.equal(f.runtime.lastPresentation,undefined);
 }finally{f.runtime.close();}
});
