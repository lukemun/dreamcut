import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticPreviewQuality,previewDimensions} from './preview-quality';
test('default alpha preview retains viewer detail; explicit lightweight remains available',()=>{
 assert.deepEqual(previewDimensions('prepared',true),{edge:960,short:540});
 assert.equal(previewDimensions('economy',true).edge,360);
 assert.equal(previewDimensions('balanced',true).edge,640);
 assert.equal(previewDimensions('prepared',false).edge,640);
});

test('Automatic picks the smallest size that fills the player, never larger than the video',()=>{
 assert.equal(automaticPreviewQuality(400,1920),'economy');
 assert.equal(automaticPreviewQuality(700,1920),'balanced');
 assert.equal(automaticPreviewQuality(1060,1920),'detail','up to 15% enlargement is allowed');
 assert.equal(automaticPreviewQuality(1474,1920),'hd');
 assert.equal(automaticPreviewQuality(5000,1920),'hd','a 1080p video never prepares at 4K');
 assert.equal(automaticPreviewQuality(5000,3840),'uhd');
});
