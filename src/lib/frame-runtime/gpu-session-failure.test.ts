import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuSessionFailure} from '../gpu-preview/session-failure';

test('device loss disposes the session before reporting and retains its first error',()=>{
 const events:string[]=[];
 const failure=new GpuSessionFailure(()=>false,()=>events.push('close'),reason=>events.push(reason));
 failure.fail(Error('GPU device lost'));
 failure.fail(Error('Decode aborted'));
 failure.fail(Error('GPU destroyed'));
 assert.equal(failure.failed,true);
 assert.deepEqual(events,['close','GPU device lost']);
});

test('unmount suppresses a late device loss rather than failing a replacement session',()=>{
 let cancelled=false,closes=0,reports=0;
 const old=new GpuSessionFailure(()=>cancelled,()=>closes++,()=>reports++);
 cancelled=true;old.fail(Error('old device destroyed'));
 assert.equal(old.failed,false);assert.equal(closes,0);assert.equal(reports,0);
 const next=new GpuSessionFailure(()=>false,()=>closes++,()=>reports++);
 next.fail('new device lost');
 assert.equal(next.failed,true);assert.equal(closes,1);assert.equal(reports,1);
});

test('reentrant disposal callbacks cannot overwrite a timeout or dispose twice',()=>{
 const errors:string[]=[];let closes=0;
 const failure=new GpuSessionFailure(()=>false,()=>{closes++;failure.fail(Error('aborted decode'));},reason=>errors.push(reason));
 failure.fail(Error('frame preparation timed out'));
 assert.equal(closes,1);assert.deepEqual(errors,['frame preparation timed out']);
});

test('cleanup failure remains terminal and reports both useful cause and cleanup limit',()=>{
 const errors:string[]=[];
 const failure=new GpuSessionFailure(()=>false,()=>{throw Error('texture release failed');},reason=>errors.push(reason));
 assert.doesNotThrow(()=>failure.fail(Error('device lost')));
 failure.fail(Error('later rejection'));
 assert.equal(failure.failed,true);
 assert.deepEqual(errors,['device lost Cleanup failed: texture release failed']);
});

test('synchronous scene update failure disposes readiness and reports once instead of escaping React',()=>{
 const events:string[]=[];const failure=new GpuSessionFailure(()=>false,()=>{events.push('close');events.push('clear-readiness');},reason=>events.push(reason));
 assert.equal(failure.guard(()=>{throw Error('invalid replacement scene');}),false);
 assert.equal(failure.guard(()=>events.push('late-presentation')),false);failure.close();
 assert.deepEqual(events,['close','clear-readiness','invalid replacement scene']);
});
test('unmount disposal is idempotent and keeps later device/decode errors silent',()=>{
 let closes=0,reports=0;const failure=new GpuSessionFailure(()=>false,()=>closes++,()=>reports++);
 failure.close();failure.close();failure.fail(Error('device destroyed'));assert.equal(failure.failed,true);assert.equal(closes,1);assert.equal(reports,0);
});

test('the first failure reaches error reporting with its original error, and reporting cannot block the fallback',()=>{
 const captured:unknown[]=[],reasons:string[]=[];
 const original=Error('CanvasKit GPU context lost',{cause:Error('driver reset')});
 const failure=new GpuSessionFailure(()=>false,()=>{},reason=>reasons.push(reason),error=>{captured.push(error);throw Error('reporter offline');});
 failure.fail(original);failure.fail(Error('late'));
 assert.deepEqual(captured,[original]);
 assert.deepEqual(reasons,['CanvasKit GPU context lost']);
});

test('worker failures keep their stack across the message boundary',async()=>{
 const {workerFailure,workerError}=await import('../gpu-preview/worker-protocol');
 const source=TypeError('texture upload failed');
 const rebuilt=workerError(structuredClone(workerFailure(source)));
 assert.equal(rebuilt.message,'texture upload failed');
 assert.equal(rebuilt.name,'TypeError');
 assert.equal(rebuilt.stack,source.stack);
 assert.deepEqual(workerFailure('plain'),{error:'plain'});
});
