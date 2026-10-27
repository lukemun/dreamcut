import test from 'node:test';
import assert from 'node:assert/strict';
import {createNativeUsageReader} from './native-model-usage';
import {normalizeActivity} from './agent-activity';
function usage(offset:number,input:number,total:number){return normalizeActivity({timestamp:'2026-10-08T10:00:00Z',type:'event_msg',payload:{type:'token_count',info:{last_token_usage:{input_tokens:input,cached_input_tokens:input/2,output_tokens:10},total_token_usage:{input_tokens:total,cached_input_tokens:total/2,output_tokens:total/input*10}}}},'codex','fixture',offset)[0];}
test('native checkpoints reconcile repeated events without adding cumulative totals',()=>{
 const r=createNativeUsageReader();r.consume(normalizeActivity({timestamp:'2026-10-08',type:'turn_context',payload:{model:'fixture-model',private:'never retained'}},'codex','fixture',0)[0]);
 r.consume(usage(1,100,100));r.consume(usage(1,100,100));r.consume(usage(2,100,100));r.consume(usage(3,100,200));
 const report=r.report();assert.equal(report.tokens.input_tokens,200);assert.equal(report.tokens.output_tokens,20);
 assert.equal(report.coverage.duplicate_snapshots,1);assert.equal(report.coverage.unreconciled_intervals,0);
 assert.equal(report.rows[0].responses,2);assert.equal(report.rows[0].model,'fixture-model');
});
test('missing intervals and reset counters remain explicit instead of billing guessed deltas',()=>{
 const r=createNativeUsageReader();r.consume(usage(1,100,100));r.consume(usage(2,100,400));r.consume(usage(3,100,100));
 const report=r.report();assert.equal(report.coverage.unreconciled_intervals,1);assert.equal(report.coverage.counter_resets,1);assert.equal(report.tokens.input_tokens,100);
});
test('capture beginning mid-session labels prior usage and keeps it out of scoped totals',()=>{
 const r=createNativeUsageReader();r.consume(usage(1,100,500));
 assert.equal(r.report().coverage.prior_input_tokens,400);assert.equal(r.report().tokens.input_tokens,100);assert.equal(r.report().latest_cumulative?.input_tokens,500);
});
