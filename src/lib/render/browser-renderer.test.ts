import test from 'node:test';import assert from 'node:assert/strict';
import {isolateDevelopmentUpdates} from './browser-renderer';
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
