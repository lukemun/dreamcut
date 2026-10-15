import test from 'node:test';
import assert from 'node:assert/strict';
import {previewDimensions} from './preview-quality';
test('default alpha preview retains viewer detail; explicit lightweight remains available',()=>{
 assert.deepEqual(previewDimensions('prepared',true),{edge:960,short:540});
 assert.equal(previewDimensions('economy',true).edge,360);
 assert.equal(previewDimensions('balanced',true).edge,640);
 assert.equal(previewDimensions('prepared',false).edge,640);
});
