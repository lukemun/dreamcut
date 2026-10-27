import test from 'node:test';import assert from 'node:assert/strict';import {NativeReplyReader} from './reply-reader';
function packet(status:number,data:Buffer){const header=Buffer.alloc(5);header[0]=status;header.writeUInt32LE(data.length,1);return Buffer.concat([header,data]);}
test('every pipe split preserves complete payloads, including header and adjacent reply boundaries',()=>{
 const payload=Buffer.from([0,1,2,255,128,64,8,9]),combined=Buffer.concat([packet(0,payload),packet(1,Buffer.from('failure')),packet(0,Buffer.alloc(0))]);
 for(let split=1;split<=combined.length;split++){
  const reader=new NativeReplyReader(),replies=[];
  for(let offset=0;offset<combined.length;offset+=split)replies.push(...reader.push(combined.subarray(offset,offset+split)));
  assert.deepEqual(replies,[{status:0,data:payload},{status:1,data:Buffer.from('failure')},{status:0,data:Buffer.alloc(0)}]);
 }
});
test('partial payloads do not publish and oversized or unknown headers fail before allocation',()=>{
 const reader=new NativeReplyReader(),data=packet(0,Buffer.alloc(100,7));assert.deepEqual(reader.push(data.subarray(0,70)),[]);assert.equal(reader.push(data.subarray(70))[0].data.length,100);
 const huge=Buffer.alloc(5);huge.writeUInt32LE(4*4096*4096+1,1);assert.throws(()=>new NativeReplyReader().push(huge),/Invalid/);
 assert.throws(()=>new NativeReplyReader().push(Buffer.from([2,0,0,0,0])),/Invalid/);
});
