import {test} from 'node:test';import assert from 'node:assert/strict';
import {previewSettingsPlacement as place} from './preview-settings-placement';
test('wide preview menu fits fully even when neither side of the gear has enough room',()=>{
 for(const width of [800,1280]){const p=place({top:300,bottom:338,right:248},{width,height:720},440);assert.ok(p.top>=346);assert.ok(p.top+p.maxHeight<=708);assert.ok(p.left>=12);}
});
test('tall preview prefers the space above its gear and short screens retain scrolling',()=>{
 assert.equal(place({top:650,bottom:680,right:1000},{width:1280,height:720},440).top,202);
 const p=place({top:80,bottom:110,right:250},{width:300,height:300},440);assert.equal(p.maxHeight,170);assert.equal(p.top,118);assert.equal(p.left,12);
});

test('tall viewer bounds keep the menu out of the neighboring tools panel',()=>{
 const p=place({top:920,bottom:950,right:330},{width:1543,height:954},210,{left:0,right:340,top:48,bottom:954});
 assert.equal(p.width,316);assert.equal(p.left,12);assert.ok(p.left+p.width<=328);assert.ok(p.top>=60);
});
