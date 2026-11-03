import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ProposalAdjustments} from './ProposalAdjustments';
import type {ProposalOptionReview} from './timeline-client';

test('proposal timing slider exposes the full valid delay instead of a local window', () => {
  const option: ProposalOptionReview = {
    option_id:'fixture', label:'Pause', recommended:true, summary:'Pause', requested_mutations:1, impact:'Timing',
    review_controls:[{operation_index:0,target:'timing_control',field:'spacing_seconds'}],
    rows:[{element_id:'timing:pause',element_label:'Pause',element_type:'effect',action:'Adjust hold',changes:[{
      field:'spacing_seconds',label:'Pause',before:'—',after:'0.8s',after_value:.8,
      target:'timing_control',operation_index:0,control_range:{min:.5,max:2},control_unit:'seconds',
    }]}],
  };
  const html=renderToStaticMarkup(React.createElement(ProposalAdjustments,{option,valueFor:()=>undefined,onChange:()=>{}}));
  const slider=html.match(/<[^>]*type="range"[^>]*>/)?.[0];
  assert.ok(slider,'timing slider must render');
  assert.match(slider,/min="0.5"/);
  assert.match(slider,/max="2"/);
  assert.match(slider,/aria-valuenow="0.8"/);
});

test('proposal mask exact-value inputs preserve fractional percentages', () => {
  for (const [field, label, native, expected] of [
    ['mask_inset_left','Crop left',.463,'46.3'],
    ['mask_inset_right','Crop right',.472,'47.2'],
    ['mask_inset_top','Crop top',.105,'10.5'],
    ['mask_inset_bottom','Crop bottom',.255,'25.5'],
    ['mask_feather','Mask feather',.005,'0.5'],
  ] as const) {
    const option: ProposalOptionReview = {
      option_id:'mask',label:'Mask',recommended:true,summary:'Mask',requested_mutations:1,impact:'Mask',
      review_controls:[{operation_index:0,target:'create_visual',field}],
      rows:[{element_id:'mask',element_label:'Mask',element_type:'video_clip',action:'Add',changes:[{
        field,label,before:'—',after:expected+'%',after_value:native,target:'create_visual',operation_index:0,
      }]}],
    };
    const html=renderToStaticMarkup(React.createElement(ProposalAdjustments,{option,valueFor:()=>undefined,onChange:()=>{}}));
    const exactInput=html.match(/<input\b[^>]*>/g)?.find(tag=>tag.includes('numeric value'));
    assert.ok(exactInput,field+' must expose its exact value');
    assert.match(exactInput,new RegExp('value="'+expected.replace('.','\\.')+'"'),field+' must not round to whole percent');
    assert.match(exactInput,/step="0.1"/,field+' must allow the displayed precision to be adjusted');
  }
});
