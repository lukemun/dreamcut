/** Atomic RGBA source batch. Header and all payloads must validate before publication. */
export type DecodedFrame={id:string;width:number;height:number;pixels:Uint8Array};
export function encodeFramePacket(frames:DecodedFrame[]):Uint8Array{
 const header=new TextEncoder().encode(JSON.stringify(frames.map(({id,width,height,pixels})=>({id,width,height,bytes:pixels.length}))));
 const output=new Uint8Array(4+header.length+frames.reduce((n,f)=>n+f.pixels.length,0));
 new DataView(output.buffer).setUint32(0,header.length,true);output.set(header,4);let offset=4+header.length;
 for(const frame of frames){output.set(frame.pixels,offset);offset+=frame.pixels.length;}return output;
}
export function decodeFramePacket(packet:Uint8Array,expectedIds:string[]):DecodedFrame[]{
 if(packet.length<4)throw Error('Incomplete native batch header');
 const size=new DataView(packet.buffer,packet.byteOffset,packet.byteLength).getUint32(0,true);
 if(size>65536||4+size>packet.length)throw Error('Invalid native batch header');
 const entries:unknown=JSON.parse(new TextDecoder().decode(packet.subarray(4,4+size)));
 if(!Array.isArray(entries)||entries.length!==expectedIds.length||entries.length>8||new Set(expectedIds).size!==expectedIds.length)throw Error('Native batch membership mismatch');
 let offset=4+size;const frames:DecodedFrame[]=[];
 for(let i=0;i<entries.length;i++){
  const e=entries[i];if(e.id!==expectedIds[i]||!Number.isInteger(e.width)||!Number.isInteger(e.height)||e.width<1||e.height<1||e.width>4096||e.height>4096||e.bytes!==e.width*e.height*4||offset+e.bytes>packet.length)throw Error('Invalid native batch frame');
  frames.push({id:e.id,width:e.width,height:e.height,pixels:packet.subarray(offset,offset+e.bytes)});offset+=e.bytes;
 }
 if(offset!==packet.length)throw Error('Trailing native batch data');return frames;
}
