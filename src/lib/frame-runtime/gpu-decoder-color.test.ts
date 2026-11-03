import {test} from 'node:test';import assert from 'node:assert/strict';
import {completeDecoderColor,colorNormalizedTrack} from '../gpu-preview/decoder-color';
test('untagged SD and HD retain the existing source color fallback',()=>{
 assert.deepEqual(completeDecoderColor({codec:'avc1',codedWidth:320,codedHeight:320}).colorSpace,{primaries:'smpte170m',transfer:'smpte170m',matrix:'smpte170m',fullRange:false});
 assert.equal(completeDecoderColor({codec:'avc1',codedWidth:1920,codedHeight:1080}).colorSpace?.matrix,'bt709');
});
test('explicit color tags and range are preserved without mutating the input',()=>{
 const config={codec:'vp09',codedWidth:320,codedHeight:320,colorSpace:{matrix:'bt709' as const,fullRange:true}};
 assert.deepEqual(completeDecoderColor(config).colorSpace,{primaries:'smpte170m',transfer:'smpte170m',matrix:'bt709',fullRange:true});assert.equal(config.colorSpace.matrix,'bt709');assert.equal('primaries'in config.colorSpace,false);
});
test('track adaptation changes only config and preserves method receiver identity',async()=>{
 const track={async getDecoderConfig(){assert.equal(this,track);return {codec:'vp09',codedWidth:320,codedHeight:320};},async getCodec(){assert.equal(this,track);return 'vp9';}};
 const adapted=colorNormalizedTrack(track as any);assert.equal(await adapted.getCodec(),'vp9');assert.equal((await adapted.getDecoderConfig())?.colorSpace?.matrix,'smpte170m');assert.equal('colorSpace'in await track.getDecoderConfig(),false);
});

test('untagged alpha retains the browser RGB-primary default while normalizing YUV matrix',()=>{
 const color=completeDecoderColor({codec:'vp09',codedWidth:320,codedHeight:320},true).colorSpace;assert.equal(color?.primaries,'bt709');assert.equal(color?.matrix,'smpte170m');
});
