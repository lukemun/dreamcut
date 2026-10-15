import test from 'node:test';import assert from 'node:assert/strict';
import {idleNativeSession} from './worker-capacity';
test('session pressure reclaims the oldest paused decoder without interrupting active or recently used frames',()=>{
 const pool=new Map([['busy',{pending:{},lastUsed:0}],['recent',{pending:null,lastUsed:9500}],['paused',{pending:null,lastUsed:1000}],['paused2',{pending:null,lastUsed:2000}]]);
 assert.equal(idleNativeSession(pool,10000),'paused');pool.delete('paused');pool.delete('paused2');assert.equal(idleNativeSession(pool,10000),undefined);
});
test('an admitted request may reclaim recent but never actively decoding sessions',()=>{
 const pool=new Map([['busy',{pending:{},lastUsed:0}],['recent',{pending:null,lastUsed:9999}]]);
 assert.equal(idleNativeSession(pool,10000),undefined);
 assert.equal(idleNativeSession(pool,10000,0),'recent');
 pool.delete('recent');assert.equal(idleNativeSession(pool,10000,0),undefined);
});
