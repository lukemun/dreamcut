import test from 'node:test';
import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {TransitionMenu} from './TransitionMenu';
import {TIMELINE_TRANSITION_TYPES} from '@/lib/timeline/contracts';
import type {TimelineTransition} from './types';

function markup(type: TimelineTransition['type'], layout: 'vertical'|'horizontal', params: TimelineTransition['params'] = {}) {
  return renderToStaticMarkup(createElement(TransitionMenu, {
    transition: {id:'join',project_id:'fixture',from_element_id:'a',to_element_id:'b',type,duration_seconds:.5,params} as TimelineTransition,
    layout,fromLabel:'Lake',toLabel:'Sunset',patchTransition:()=>{},deleteTransition:()=>{},
  }));
}
for (const layout of ['vertical','horizontal'] as const) {
  test(`every transition retains duration, type choice and relevant controls in ${layout}`,()=>{
    for (const type of TIMELINE_TRANSITION_TYPES) {
      const html=markup(type,layout);
      assert.match(html,/Transition duration numeric value/);
      assert.match(html,/Remove transition/);
      assert.doesNotMatch(html,/Applied at this join and included in export/);
      const accent=['film_burn','camera_flash','blackout'].includes(type);
      assert.equal(html.includes('Strength numeric value'),accent,type);
      assert.equal(html.includes('Peak hold numeric value'),accent,type);
      assert.equal(html.includes('Page curl numeric value'),type==='page_turn',type);
      assert.equal(html.includes('Motion blur numeric value'),['whip','slide'].includes(type),type);
    }
  });
  test(`peak hold has no explanatory copy and smear controls remain conditional in ${layout}`,()=>{
    assert.doesNotMatch(markup('camera_flash',layout,{accent_hold:.4}),/Share of the total duration/);
    assert.match(markup('camera_flash',layout,{accent_hold:.4}),/Peak hold numeric value/);
    assert.doesNotMatch(markup('whip',layout),/Smear zoom numeric value/);
    assert.match(markup('whip',layout,{motion:'smear'}),/Smear zoom numeric value/);
    assert.match(markup('slide',layout,{motion:'smear'}),/Smear travel numeric value/);
  });
}
