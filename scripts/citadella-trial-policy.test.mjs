import test from 'node:test';
import assert from 'node:assert/strict';
import { assertCitadellaTrialProposal } from './lib/citadella-trial-policy.mjs';
const scope={projectId:'fixture',revision:'frozen',elementIds:['actor']};
const draft=()=>({project_id:'fixture',proposal:{project_id:'fixture',expected_revision:'frozen',caps:{max_renders:0},decision:'propose',responds_to_feedback_ids:['feedback'],options:[{operations:[{element_id:'actor',patch:{timeline_start:1,duration:2}}]}]}});
test('scoped timing patches are accepted',()=>assert.doesNotThrow(()=>assertCitadellaTrialProposal(draft(),scope)));
test('cross-project, stale, render, non-target and non-timing changes are denied',()=>{
 for(const mutate of [d=>d.project_id='other',d=>d.proposal.expected_revision='stale',d=>d.proposal.caps.max_renders=1,d=>d.proposal.options[0].operations[0].element_id='other',d=>d.proposal.options[0].operations[0].patch.volume=0,d=>d.proposal.options[0].operations[0].create_visual={},d=>d.proposal.responds_to_feedback_ids=[]]){
 const d=draft();mutate(d);assert.throws(()=>assertCitadellaTrialProposal(d,scope));
 }
});
