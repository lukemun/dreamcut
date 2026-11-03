import test from 'node:test';
import assert from 'node:assert/strict';
import {GpuPlaybackMetrics,GpuSeekMetrics} from '../gpu-preview/playback-metrics';
test('playback evidence preserves stalls between sparse observers and resets on seek',()=>{
 const metrics=new GpuPlaybackMetrics(),frame=(frame:number)=>({frame,resourceMs:12,submitMs:5});
 metrics.record(1,true,0,frame(0));metrics.record(1,true,33,frame(1));
 const stalled=metrics.record(1,true,500,frame(2))!;
 assert.equal(stalled.maxGapMs,467);assert.equal(stalled.stalls.length,1);assert.equal(stalled.elapsedMs,500);
 assert.equal(metrics.record(1,false,900,frame(2)),undefined);
 assert.equal(metrics.record(2,true,1000,frame(20))!.stalls.length,0);
 for(let i=1;i<60;i++)metrics.record(2,true,1000+i*500,frame(20+i));
 assert.equal(metrics.record(2,true,31000,frame(80))!.stalls.length,32);
});
test('late presentations and skipped frames are counted per playback run',()=>{
 const metrics=new GpuPlaybackMetrics(),frame=(frame:number)=>({frame,resourceMs:1,submitMs:1});
 metrics.record('run',true,0,frame(0));metrics.record('run',true,33,frame(1));
 // The clock moved on two frames while one picture decoded for 120 ms.
 const late=metrics.record('run',true,153,frame(4))!;
 assert.equal(late.latePresentations,1);assert.equal(late.skippedFrames,2);
 assert.equal(metrics.record('next',true,200,frame(10))!.latePresentations,0,'a new run starts clean');
});
test('seek latency reports a bounded recent window and the decode-free share',()=>{
 const seeks=new GpuSeekMetrics();
 for(let i=1;i<=100;i++)seeks.record(i,{cacheMisses:i%4===0?1:0});
 const summary=seeks.record(1000,{cacheMisses:2,replayHit:true})!;
 assert.equal(summary.seeks,101);assert.equal(summary.p50Ms,51);assert.equal(summary.p95Ms,96);assert.equal(summary.maxMs,1000);
 assert.ok(Math.abs(summary.decodeFreeRate-76/101)<1e-9,'replay hits count as decode-free');
 for(let i=0;i<200;i++)seeks.record(5,{cacheMisses:0});
 const recent=seeks.record(5,{cacheMisses:0})!;
 assert.equal(recent.window,128);assert.equal(recent.maxMs,5,'old seeks leave the window');
 assert.equal(seeks.record(Number.NaN,{cacheMisses:0}),undefined);
});
