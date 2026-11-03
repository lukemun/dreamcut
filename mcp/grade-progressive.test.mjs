import test from 'node:test';
import assert from 'node:assert/strict';
import {gradeProgressive} from './grade-progressive.mjs';
test('owned-model grading requires discovery, registered schemas and matching reported marker',()=>{
 const probe={run_id:'fixture',profile:'editing',events:[{kind:'listed',has_cutout_status:false},{kind:'call',tool:'capability_catalog',action:'load',family:'cutout-preparation'},{kind:'list_changed'},{kind:'listed',has_cutout_status:true},{kind:'call',tool:'cutout_status'},{kind:'probe_result'}]};
 const client={run_id:'fixture',events:[{kind:'registered',names:['capability_catalog']},{kind:'dispatch',tool:'capability_catalog',arguments:{action:'search'}},{kind:'dispatch',tool:'capability_catalog',arguments:{action:'load',id:'cutout-preparation'}},{kind:'registered',names:['capability_catalog','cutout_status']},{kind:'dispatch',tool:'cutout_status'},{kind:'result',tool:'cutout_status',result:{content:[{type:'text',text:'{"probe_nonce":"fresh"}'}]}}]};
 assert.equal(gradeProgressive(probe,client,'fresh').pass,true);
 assert.equal(gradeProgressive(probe,client,'wrong').pass,false);
 assert.equal(gradeProgressive(probe,{...client,run_id:'another-run'},'fresh').pass,false);
 for(let i=0;i<client.events.length;i++)assert.equal(gradeProgressive(probe,{...client,events:client.events.filter((_,j)=>j!==i)},'fresh').pass,false);
 assert.equal(gradeProgressive(probe,{...client,events:[...client.events,{kind:'rejected'}]},'fresh').pass,false);
});
