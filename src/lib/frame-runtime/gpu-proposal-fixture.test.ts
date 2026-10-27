import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fixtureDirectory,assertProposalOnlyRequest} from '../../../scripts/verify-gpu-proposal-preview';
test('GPU proposal proof refuses existing or unscoped projects',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gpu-proposal-guard-'));
 try{
  assert.throws(()=>fixtureDirectory(root,'creator-project'));
  const fixture=fixtureDirectory(root,'gpu-proposal-proof-abc123');fs.mkdirSync(fixture);
  assert.throws(()=>fixtureDirectory(root,'gpu-proposal-proof-abc123'));
  assert.throws(()=>fixtureDirectory(root,'gpu-proposal-proof-../../project'));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('proposal proof network guard allows review but blocks all timeline or decision writes',()=>{
 const base='http://localhost/api/projects/fixture/timeline';
 for(const [method,suffix]of [['POST',''],['POST','/elements'],['PATCH','/elements/a'],['POST','/proposals/a/approve'],['DELETE','/proposals/a'],['POST','/history/restore']]as const)assert.throws(()=>assertProposalOnlyRequest(method,base+suffix));
 for(const suffix of ['/proposals','/proposals/preflight','/proposals/a/tuning','/proposals/a/preview'])assert.doesNotThrow(()=>assertProposalOnlyRequest('POST',base+suffix));
 assert.doesNotThrow(()=>assertProposalOnlyRequest('GET',base));
 assert.doesNotThrow(()=>assertProposalOnlyRequest('DELETE','http://localhost/api/projects/gpu-proposal-proof-abc123/prepared-preview?id=fixture'));
 assert.throws(()=>assertProposalOnlyRequest('DELETE','http://localhost/api/projects/creator/prepared-preview?id=fixture'));
});
