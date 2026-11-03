import test from 'node:test';
import assert from 'node:assert/strict';
import { proposalControlInventory } from './proposal-control-inventory';
import type { EditorAgentOption } from './timeline-editor-agent-apply';
import type { TimelineFile } from '../local-store/store';
test('inventory separates changed and retained controls and preserves deliberate selection', () => {
  const timeline = {elements:[{id:'actor',type:'still',props:{media_offset_x:0,media_offset_y:0,media_scale:1}}],transitions:[]} as TimelineFile;
  const option = {id:'place',label:'Place',recommended:true,summary:'Place',requested_mutations:3,operations:[{element_id:'actor',props:{media_offset_x:0.2,media_offset_y:0,media_scale:1}}],review_controls:[{operation_index:0,target:'props',field:'media_offset_x'},{operation_index:0,target:'props',field:'media_offset_y'}]} as EditorAgentOption;
  const snapshot=JSON.stringify(option);
  const rows=proposalControlInventory(timeline,option);
  assert.deepEqual(rows[0]!.controls.map(c=>[c.field,c.changed,c.selected]),[['media_offset_x',true,true],['media_offset_y',false,true],['media_scale',false,false]]);
  assert.equal(JSON.stringify(option),snapshot);
});
test('new actors report configured geometry including zero coordinates without exposing source URLs', () => {
  const option={id:'new',label:'New',recommended:true,summary:'New',requested_mutations:5,operations:[{element_id:'new',create_visual:{title:'Card',source_url:'/private/source.png',media_offset_x:0,media_offset_y:0,media_scale:1}}],review_controls:[]} as unknown as EditorAgentOption;
  const [actor]=proposalControlInventory({elements:[],transitions:[]},option);
  assert.equal(actor!.new_element,true);
  assert.equal(actor!.controls.length,3);
  assert.ok(actor!.controls.every(c=>c.changed && !c.selected && c.selection_hint.includes('New placement')));
  assert.ok(!JSON.stringify(actor).includes('/private/'));
});
