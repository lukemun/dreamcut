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
test('software drawing previews at half size unless Full HD or 4K playback is chosen; export never goes below 1',async()=>{
 const {previewPixelScale}=await import('../gpu-preview/display-buffer');
 const {validCanvasKitPixelScale}=await import('../gpu-preview/canvaskit-pixel-scale');
 assert.equal(previewPixelScale(1080,1920,'prepared',true),0.5);
 assert.equal(previewPixelScale(1080,1920,'balanced',true),0.5);
 assert.equal(previewPixelScale(1080,1920,'hd',true),1);
 assert.equal(previewPixelScale(1080,1920,'uhd',true),1);
 assert.equal(previewPixelScale(1080,1920,'prepared',false),1);
 assert.equal(previewPixelScale(1081,1920,'prepared',true),1,'an odd size cannot halve to whole pixels');
 assert.equal(previewPixelScale(1080,1920,'prepared'),1,'without a browser there is no software WebGL to detect');
 assert.equal(validCanvasKitPixelScale(0.5),0.5);
 assert.throws(()=>validCanvasKitPixelScale(0.25));
});
test('a settling player size keeps the GPU session; only pixel scale or picture budget starts a new one',async()=>{
 const {gpuDisplaySessionKey}=await import('../gpu-preview/display-buffer');
 // The sizes week-recap's player measured on mount, each of which used to start a new worker.
 const sizes=[[508,286],[748,421],[1022,575],[891,501]].map(([w,h])=>({...gpuDisplayBuffer(1920,1080,w,h,1,30),pixelScale:1}));
 assert.equal(new Set(sizes.map(gpuDisplaySessionKey)).size,1);
 assert.notEqual(gpuDisplaySessionKey({...sizes[0],pixelScale:0.5}),gpuDisplaySessionKey(sizes[0]));
 const fullscreen={...gpuDisplayBuffer(1920,1080,3840,2160,1,30),pixelScale:1};
 assert.notEqual(gpuDisplaySessionKey(fullscreen),gpuDisplaySessionKey(sizes[0]),'a larger picture budget needs a new queue');
});
