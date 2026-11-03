/** Framed Rust replies: one allocation per payload, even when the pipe splits every byte. */
export class NativeReplyReader {
 private header=Buffer.alloc(5);private headerUsed=0;
 private payload:Buffer|null=null;private payloadUsed=0;private status=0;
 push(chunk:Buffer):Array<{status:number;data:Buffer}>{
  const replies:Array<{status:number;data:Buffer}>=[];let offset=0;
  while(offset<chunk.length){
   if(!this.payload){
    const count=Math.min(5-this.headerUsed,chunk.length-offset);
    chunk.copy(this.header,this.headerUsed,offset,offset+count);this.headerUsed+=count;offset+=count;
    if(this.headerUsed<5)break;
    this.status=this.header[0];const size=this.header.readUInt32LE(1);
    if(this.status>1||size>4*4096*4096)throw Error('Invalid native reply header');
    this.payload=Buffer.allocUnsafe(size);this.payloadUsed=0;
   }
   const count=Math.min(this.payload.length-this.payloadUsed,chunk.length-offset);
   chunk.copy(this.payload,this.payloadUsed,offset,offset+count);this.payloadUsed+=count;offset+=count;
   if(this.payloadUsed===this.payload.length){replies.push({status:this.status,data:this.payload});this.payload=null;this.headerUsed=0;}
  }
  return replies;
 }
}
