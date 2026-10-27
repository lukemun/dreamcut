import test from 'node:test';import assert from 'node:assert/strict';
import {parsePreviewPreparation,resolvePreviewPreparation,shouldUsePreparedPicture} from './preview-preparation';
test('direct playback is the default while explicit prepared choices persist',()=>{
 for(const value of [undefined,null,'unknown'])assert.equal(parsePreviewPreparation(value),'live');
 assert.equal(parsePreviewPreparation('prepared'),'prepared');
 assert.equal(parsePreviewPreparation('live'),'live');
});
test('preparation policy is independent of backend and layer count',()=>{
 assert.equal(shouldUsePreparedPicture('prepared',1800),true);
 assert.equal(shouldUsePreparedPicture('live',100),false);
 assert.equal(shouldUsePreparedPicture('prepared',1801),false);
 assert.equal(shouldUsePreparedPicture('prepared',0),false);
});
test('GPU preview is opt-in and never requests a prepared movie',()=>{
 assert.equal(parsePreviewPreparation('gpu'),'gpu');
 assert.equal(shouldUsePreparedPicture('gpu',120),false);
 assert.equal(parsePreviewPreparation(undefined),'live');
});
test('switching renderers never introduces prepared playback without a saved choice',()=>{
 for(const renderer of ['standard','rust']) {
  assert.equal(resolvePreviewPreparation(renderer,parsePreviewPreparation(null)),'live');
  assert.equal(resolvePreviewPreparation(renderer,'gpu'),'live');
  for(const saved of ['live','prepared','rolling','selective'] as const) {
   assert.equal(resolvePreviewPreparation('gpu',saved),'gpu');
   assert.equal(resolvePreviewPreparation(renderer,saved),saved);
  }
 }
});
