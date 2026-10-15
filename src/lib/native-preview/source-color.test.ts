import test from 'node:test';import assert from 'node:assert/strict';import {nativeSourceColor} from './source-color';
test('declared color metadata wins over resolution defaults',()=>{
 assert.deepEqual(nativeSourceColor({width:160,height:160,pix_fmt:'yuv420p',color_space:'bt709',color_primaries:'bt709',color_transfer:'iec61966-2-1',color_range:'pc'}),{matrix:1,primaries:1,transfer:13,range:1});
 assert.deepEqual(nativeSourceColor({width:1920,height:1080,pix_fmt:'yuv420p',color_space:'smpte170m',color_primaries:'smpte170m',color_transfer:'smpte170m'}),{matrix:6,primaries:6,transfer:13,range:0});
});
test('untagged SD, HD and RGB input assumptions are explicit',()=>{
 assert.deepEqual(nativeSourceColor({width:160,height:160,pix_fmt:'yuv420p'}),{matrix:6,primaries:6,transfer:13,range:0});
 assert.deepEqual(nativeSourceColor({width:1920,height:1080,pix_fmt:'yuv420p'}),{matrix:1,primaries:1,transfer:13,range:0});
 assert.deepEqual(nativeSourceColor({width:16,height:16,pix_fmt:'rgba'}),{matrix:0,primaries:1,transfer:13,range:1});
 assert.throws(()=>nativeSourceColor({color_transfer:'invented'}),/Unsupported/);
});

test('SDR display interpretation matches Chromium without changing primaries or HDR transfer',()=>{
 for(const color_transfer of ['bt709','smpte170m','bt2020-10','bt2020-12']) {
  const color=nativeSourceColor({color_transfer,color_space:'bt2020nc',color_primaries:'bt2020',color_range:'tv'});
  assert.deepEqual(color,{matrix:9,primaries:9,transfer:13,range:0});
 }
 for(const [color_transfer,expected] of [['smpte2084',16],['arib-std-b67',18],['linear',8],['gamma22',4]] as const)
  assert.equal(nativeSourceColor({color_transfer}).transfer,expected);
});
