import test from 'node:test';
import assert from 'node:assert/strict';
import {textAlphaBounds,gpuTextBounds,setGpuTextBounds} from '../gpu-preview/text-bounds';

test('caption crop retains faint shadows, isolated dots and filter padding',()=>{
  const pixels=new Uint8ClampedArray(100*80*4);
  pixels[(30*100+40)*4+3]=255;
  pixels[(34*100+58)*4+3]=1;
  pixels[(22*100+45)*4+3]=180;
  assert.deepEqual(textAlphaBounds(pixels,100,80),{x:38,y:20,width:23,height:17});
});
test('empty and edge-touching captions remain valid bounded textures',()=>{
  const pixels=new Uint8ClampedArray(10*8*4);
  assert.deepEqual(textAlphaBounds(pixels,10,8),{x:0,y:0,width:1,height:1});
  pixels[3]=255;pixels[pixels.length-1]=1;
  assert.deepEqual(textAlphaBounds(pixels,10,8),{x:0,y:0,width:10,height:8});
  assert.throws(()=>textAlphaBounds(pixels,10,9),/Invalid/);
});
test('cached crop retains its original composition position across repeated draws',()=>{
  const canvas={} as OffscreenCanvas,rect={x:300,y:100,width:120,height:60};
  assert.deepEqual(gpuTextBounds(canvas,1080,1920),{x:0,y:0,width:1080,height:1920});
  setGpuTextBounds(canvas,rect);
  assert.deepEqual(gpuTextBounds(canvas,1080,1920),rect);
  assert.deepEqual(gpuTextBounds(canvas,1080,1920),rect);
});
