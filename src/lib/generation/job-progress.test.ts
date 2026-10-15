import assert from 'node:assert/strict';
import test from 'node:test';
import { generationProgress, downloadPercent } from './job-progress';
import type { AssetJob } from './assets';
const job = (status: AssetJob['status'], progress?: AssetJob['progress']) => ({ status, progress } as AssetJob);
test('provider queue remains queue until generation actually starts', () => {
 assert.equal(generationProgress(job('running', { providerStatus:'IN_QUEUE',checkedAt:'',queuePosition:0 })).stage,0);
 assert.match(generationProgress(job('running', { providerStatus:'IN_QUEUE',checkedAt:'',queuePosition:0 })).detail,/0 requests ahead/);
 assert.equal(generationProgress(job('running', { providerStatus:'IN_PROGRESS',checkedAt:'' })).stage,1);
 assert.match(generationProgress(job('running')).label,/Checking/);
});
test('download progress needs an actual content length and never invents generation percent', () => {
 assert.equal(downloadPercent(job('running')),undefined);
 assert.equal(downloadPercent(job('saving',{providerStatus:'COMPLETED',checkedAt:'',downloadedBytes:10})),undefined);
 assert.equal(downloadPercent(job('saving',{providerStatus:'COMPLETED',checkedAt:'',downloadedBytes:25,totalBytes:100})),25);
 assert.match(generationProgress(job('saving',{providerStatus:'COMPLETED',checkedAt:'',phase:'verifying'})).label,/Checking downloaded/);
});
test('external handoff and terminal states do not show a running spinner', () => {
 for(const state of ['waiting_codex','failed','uncertain','canceled','ready'] as const) assert.equal(generationProgress(job(state)).active,false);
});
