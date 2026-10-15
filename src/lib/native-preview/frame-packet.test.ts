import test from 'node:test';import assert from 'node:assert/strict';import {encodeFramePacket,decodeFramePacket} from './frame-packet';
const a={id:'a',width:1,height:1,pixels:new Uint8Array([20,40,60,128])},b={id:'b',width:2,height:1,pixels:new Uint8Array([1,2,3,255,4,5,6,0])};
test('atomic frame packets preserve separate source geometry and alpha',()=>{assert.deepEqual(decodeFramePacket(encodeFramePacket([a,b]),['a','b']),[a,b]);});
test('incomplete, reordered, duplicate and trailing batches never publish a subset',()=>{
 const packet=encodeFramePacket([a,b]);assert.throws(()=>decodeFramePacket(packet.subarray(0,packet.length-1),['a','b']),/frame/);
 assert.throws(()=>decodeFramePacket(packet,['b','a']),/frame/);assert.throws(()=>decodeFramePacket(packet,['a','a']),/membership/);
 const extra=new Uint8Array(packet.length+1);extra.set(packet);assert.throws(()=>decodeFramePacket(extra,['a','b']),/Trailing/);
 assert.throws(()=>decodeFramePacket(new Uint8Array([255,255,255,255]),[]),/header/);
});

test('full-HD and 4K source dimensions are accepted without silently scaling down',()=>{
 const frame={id:'4k',width:2160,height:3840,pixels:new Uint8Array(2160*3840*4)};
 const result=decodeFramePacket(encodeFramePacket([frame]),['4k'])[0];
 assert.equal(result.width,2160);assert.equal(result.height,3840);assert.equal(result.pixels.length,2160*3840*4);
});
