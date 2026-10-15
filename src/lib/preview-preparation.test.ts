import test from 'node:test';import assert from 'node:assert/strict';
import {parsePreviewPreparation,shouldUsePreparedPicture} from './preview-preparation';
test('existing users retain prepared playback; direct mode is explicit and persisted values are bounded',()=>{
 for(const value of [undefined,null,'unknown','prepared'])assert.equal(parsePreviewPreparation(value),'prepared');
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
 assert.equal(parsePreviewPreparation(undefined),'prepared');
});
