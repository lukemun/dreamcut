import assert from 'node:assert/strict';
import test from 'node:test';
import type {CompositionElement} from '@/lib/render/composition-adapters';
import {samePictureSources} from './scene-media-key';

const still={id:'a',type:'still',source_url:'/x.png',props:{media_scale:.85,media_offset_x:0,title:'A'},timeline_start:1,duration:2,lane_key:'visual_0',lane_index:0,volume:1,playback_rate:1,trim_start:0,trim_end:null,fade_in:0,fade_out:0} as CompositionElement;

test('moving or sizing a layer keeps the decoded media; anything else does not', () => {
 assert.equal(samePictureSources([still],[{...still,props:{...still.props,media_offset_x:-.4,media_scale:1.2}}]),true);
 assert.equal(samePictureSources([still],[{...still,source_url:'/y.png'}]),false);
 assert.equal(samePictureSources([still],[{...still,timeline_start:1.5}]),false);
 assert.equal(samePictureSources([still],[{...still,props:{...still.props,grade_saturation:2}}]),false);
 assert.equal(samePictureSources([still],[still,{...still,id:'b'}]),false);
});
