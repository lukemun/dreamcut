import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import fs from 'node:fs';
import type {NativeScene} from './scene';
import {NativeReplyReader} from './reply-reader';
import {idleNativeSession} from './worker-capacity';
import {NativeRequestScheduler} from './request-scheduler';
import {nativePreviewBinary} from './binary';
let pinnedBinary:string|undefined;
const binaryPath=()=>pinnedBinary??nativePreviewBinary();
/** Detached preparation pins its executable to the immutable runtime generation. */
export function setNativeBinary(file:string){pinnedBinary=file;}
class NativeWorker {
 child:ChildProcessWithoutNullStreams;
 binaryMtime=fs.statSync(binaryPath()).mtimeMs;
 pending:{resolve:(b:Buffer)=>void;reject:(e:Error)=>void;timer:ReturnType<typeof setTimeout>}|null=null;
 stopped=false;lastUsed=Date.now();
 reader=new NativeReplyReader();idle:ReturnType<typeof setTimeout>|null=null;
 constructor(readonly close:()=>void){
  this.child=spawn(binaryPath(),[],{stdio:'pipe'});
  this.child.stdout.on('data',(data:Buffer)=>{
   try{for(const reply of this.reader.push(data)){
    const pending=this.pending;if(!pending){this.stop(new Error('Unexpected native reply'));return;}
    this.pending=null;clearTimeout(pending.timer);
    if(reply.status)pending.reject(new Error(reply.data.toString()));else pending.resolve(reply.data);
   }}catch(error){this.stop(error instanceof Error?error:new Error(String(error)));}
  });
  this.child.stderr.on('data',()=>{});
  this.child.stdin.on('error',e=>this.stop(e));
  this.child.on('error',e=>this.stop(e));this.child.on('exit',()=>this.stop(new Error('Native preview stopped')));
 }
 stop(error:Error){if(this.stopped)return;this.stopped=true;const p=this.pending;this.pending=null;if(p){clearTimeout(p.timer);p.reject(error);}if(this.idle)clearTimeout(this.idle);this.child.kill();this.close();}
 async render(scene:NativeScene,timeoutMs=8000){
  if(this.pending)throw Error('Native session already has an outstanding frame');
  if(this.idle)clearTimeout(this.idle);this.lastUsed=Date.now();
  return new Promise<Buffer>((resolve,reject)=>{this.pending={resolve,reject,timer:setTimeout(()=>this.stop(new Error('Native frame timed out')),timeoutMs)};this.child.stdin.write(JSON.stringify(scene)+'\n');this.idle=setTimeout(()=>this.stop(new Error('Native session expired')),Math.max(30000,timeoutMs+1000));});
 }
}
const globalWorkers=globalThis as typeof globalThis & {dreamcutNativeWorkers?:Map<string,NativeWorker>;dreamcutNativeScheduler?:NativeRequestScheduler};
const workers=globalWorkers.dreamcutNativeWorkers??=new Map<string,NativeWorker>();
const scheduler=globalWorkers.dreamcutNativeScheduler??=new NativeRequestScheduler();
export async function renderNative(session:string,scene:NativeScene,timeoutMs=8000){
 return scheduler.run(session,async()=>{
 let worker=workers.get(session);
 if(worker&&worker.binaryMtime!==fs.statSync(binaryPath()).mtimeMs){worker.stop(new Error('Native helper updated'));worker=undefined;}
 if(!worker){if(workers.size>=4){const idle=idleNativeSession(workers,Date.now(),0);if(idle)workers.get(idle)?.stop(new Error('Idle native session reclaimed'));}if(workers.size>=4)throw Error('Native preview session limit reached');if(!fs.existsSync(binaryPath()))throw Error('Build the experimental Rust helper first');worker=new NativeWorker(()=>workers.delete(session));workers.set(session,worker);}
 return worker.render(scene,Math.min(60000,Math.max(1000,timeoutMs)));
 },Math.min(60000,Math.max(1000,timeoutMs)));
}

export function releaseNative(session:string){workers.get(session)?.stop(new Error("Native session released"));}
