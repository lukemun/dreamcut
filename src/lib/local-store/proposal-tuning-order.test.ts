import test, {after} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createProject,readTimelineSnapshot} from './store';
import {saveProposal,resolveProposal} from './proposals';
import {validateEditorAgentProposalAgainstProject} from '../agent/timeline-editor-agent-apply';
import {saveProposalTuning,readProposalTuning} from './proposal-tuning';

const root=fs.mkdtempSync(path.join(os.tmpdir(),'proposal-tuning-order-'));
process.env.TIMELINE_PROJECTS_DIR=root;process.env.DREAMCUT_PROFILE_DIR=path.join(root,'profile');
after(()=>fs.rmSync(root,{recursive:true,force:true}));
function fixture(id:string) {
  createProject(id,'web');const revision=readTimelineSnapshot(id).revision;
  const proposal=validateEditorAgentProposalAgainstProject({schema_version:2,project_id:id,expected_revision:revision,mode:'workshop',decision:'propose',summary:'Level',assumptions:[],unresolved_gaps:[],caps:{max_mutations:20,max_renders:0},options:[{id:'sound',label:'Sound',recommended:true,summary:'Level',operations:[{element_id:'11111111-1111-4111-8111-111111111111',create_audio:{source_url:`/api/projects/${id}/media/sound.wav`,type:'sound_effect',title:'Sound',timeline_start:0,source_duration_seconds:1,source_start_seconds:0,source_end_seconds:1,volume:1,lane_key:'sound_effect_0',lane_index:0}}]}]},20,id);
  return {proposal:saveProposal(id,proposal).proposal_id,revision};
}
const overrides=[{operation_index:0,target:'create_audio',field:'volume',value:.5}];
test('late older writes and duplicate acknowledgements cannot undo a newer reset',async()=>{
  const id='ordered',f=fixture(id),stamp=(sequence:number)=>({client_id:'writer',sequence,expected_revision:f.revision});
  await saveProposalTuning(id,f.proposal,'sound',[],stamp(2));
  await saveProposalTuning(id,f.proposal,'sound',overrides,stamp(1));
  assert.deepEqual(readProposalTuning(id,f.proposal),{sound:[]});
  await saveProposalTuning(id,f.proposal,'sound',[],stamp(2));
  await assert.rejects(()=>saveProposalTuning(id,f.proposal,'sound',overrides,stamp(2)),/already used/);
  assert.deepEqual(readProposalTuning(id,f.proposal),{sound:[]});
});
test('legacy tuning stays readable and ordered writes preserve the existing tuning interface',async()=>{
  const id='legacy',f=fixture(id);await saveProposalTuning(id,f.proposal,'sound',overrides);
  assert.deepEqual(readProposalTuning(id,f.proposal),{sound:overrides});
  await saveProposalTuning(id,f.proposal,'sound',[],{client_id:'writer',sequence:1,expected_revision:f.revision});
  assert.deepEqual(readProposalTuning(id,f.proposal),{sound:[]});
});
test('wrong revisions and resolved proposals refuse new writes without modifying review state',async()=>{
  const id='guards',f=fixture(id),write={client_id:'writer',sequence:1,expected_revision:'0'.repeat(64)};
  await assert.rejects(()=>saveProposalTuning(id,f.proposal,'sound',overrides,write),/timeline changed/);
  assert.deepEqual(readProposalTuning(id,f.proposal),{});
  resolveProposal(id,f.proposal,'rejected',{});
  await assert.rejects(()=>saveProposalTuning(id,f.proposal,'sound',overrides,{...write,expected_revision:f.revision}),/already resolved/);
  assert.deepEqual(readProposalTuning(id,f.proposal),{});
  const approved=fixture('approved-guard');resolveProposal('approved-guard',approved.proposal,'approved',{});
  await assert.rejects(()=>saveProposalTuning('approved-guard',approved.proposal,'sound',overrides,{...write,expected_revision:approved.revision}),/already resolved/);
  assert.deepEqual(readProposalTuning('approved-guard',approved.proposal),{});
});
