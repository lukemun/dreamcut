import test from 'node:test';
import assert from 'node:assert/strict';
import {gpuWorkerBundle} from './gpu-worker-bundle';
test('worker bundle excludes DOM typography and concurrent requests share one generation',async()=>{
 const first=gpuWorkerBundle(),second=gpuWorkerBundle();assert.equal(first,second);
 const code=await first;
 assert.ok(code.length<2*1024*1024,`Worker unexpectedly includes large DOM/font dependencies: ${code.length}`);
 assert.ok(!code.includes('data-gpu-caption-measure'));
 assert.equal(await gpuWorkerBundle(),code);
});
