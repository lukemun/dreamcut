import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {isolateDevelopmentUpdates,stopEncoder} from './browser-renderer';
test('long captures suppress HMR messages without disconnecting the browser',async()=>{
 let route:((socket:any)=>void)|undefined,message:((data:string)=>void)|undefined;const sent:string[]=[];let closed=0;
 const server={onMessage:(fn:(data:string)=>void)=>{message=fn;},close:()=>{closed++;}};
 const socket={connectToServer:()=>server,send:(data:string)=>sent.push(data),close:()=>{closed++;},onMessage:()=>{}};
 const freeze=await isolateDevelopmentUpdates({routeWebSocket:async(_pattern:unknown,fn:(socket:any)=>void)=>{route=fn;}} as never);
 route!(socket);message!('initial setup');freeze();message!('reload during capture');
 assert.deepEqual(sent,['initial setup']);assert.equal(closed,0);
 // A reconnect must not cause another browser disconnect/reload loop either.
 route!(socket);assert.equal(closed,0);
});

test('an encoder that is no longer needed exits instead of waiting on its input forever',async()=>{
  const encoder=spawn('ffmpeg',['-hide_banner','-loglevel','error','-f','image2pipe','-i','pipe:0','-f','null','-'],{stdio:['pipe','ignore','ignore']});
  await new Promise(resolve=>setTimeout(resolve,300));
  const exited=new Promise(resolve=>encoder.once('exit',()=>resolve(true)));
  stopEncoder(encoder);
  const result=await Promise.race([exited,new Promise(resolve=>setTimeout(()=>resolve(false),3000))]);
  if(!result)encoder.kill('SIGKILL');
  assert.equal(result,true);
});
