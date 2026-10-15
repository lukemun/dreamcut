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
