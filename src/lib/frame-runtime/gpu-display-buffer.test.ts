import test from 'node:test';
import assert from 'node:assert/strict';
import {GPU_DISPLAY_BUFFER_BYTES,gpuDisplayBuffer} from '../gpu-preview/display-buffer';
test('display cache preserves aspect, physical pixels, and a bounded two-second runway',()=>{
 const small=gpuDisplayBuffer(1080,1920,500,900,1,30);
 assert.equal(small.deliveryWidth,500);assert.equal(small.deliveryHeight,889);assert.equal(small.capacity,60);
 const fullscreen=gpuDisplayBuffer(1080,1920,2000,2200,2,30);
 assert.deepEqual(fullscreen,{deliveryWidth:1080,deliveryHeight:1920,capacity:32});
 for(const buffer of [small,fullscreen])assert.ok(buffer.capacity*buffer.deliveryWidth*buffer.deliveryHeight*4<=GPU_DISPLAY_BUFFER_BYTES);
 assert.throws(()=>gpuDisplayBuffer(1080,1920,0,900,1,30));
});
test('decoded frames are budgeted at their real size, with an RGBA fallback',async()=>{
 const {decodedFrameBytes}=await import('../gpu-preview/browser-frame-provider');
 assert.equal(decodedFrameBytes({codedWidth:1920,codedHeight:1088,allocationSize:()=>1920*1088*1.5}),1920*1088*1.5);
 assert.equal(decodedFrameBytes({codedWidth:1920,codedHeight:1088,allocationSize:()=>{throw Error('closed');}}),1920*1088*4);
});
