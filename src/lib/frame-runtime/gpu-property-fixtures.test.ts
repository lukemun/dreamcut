import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderContractCases} from '../render/effect-render-contract';
import {gpuPropertyFixtures,GPU_PROPERTY_FIXTURE_SVGS,type GpuPropertyFixtureAssets} from '../gpu-preview/property-fixtures';
const assets:GpuPropertyFixtureAssets={picture:'/picture.png',fullCanvas:'/full.png',backdrop:'/backdrop.png',video:{url:'/video.mp4',durationSeconds:3},gridMask:{source_url:'/api/projects/test/media/grid',source_start_seconds:0,fps:.1,frame_count:1,width:160,height:160,source_sha256:'0'.repeat(64)}};
test('projection covers every registered render obligation without supported-subset filtering',()=>{
 const actual=gpuPropertyFixtures(assets),expected=renderContractCases();assert.equal(actual.length,62);
 assert.deepEqual(actual.map(c=>c.property),expected.map(c=>c.property));
 for(const [i,c] of actual.entries()){
  assert.equal(c.caseIndex,i);assert.equal(c.minimumChangedPixels,expected[i].minimumChangedPixels);
  assert.deepEqual(c.reset,c.baseline);assert.notEqual(c.reset,c.baseline);
  assert.deepEqual(c.active.elements[0].props?.[c.property],expected[i].value);
  assert.deepEqual(c.baseline.elements[0].props?.[c.property],expected[i].identity);
  assert.equal(c.active.elements[0].type,c.sourceType==='video'?'video_clip':'still');
  assert.deepEqual(c.active.laneOrderKeys,['visual_0','visual_1']);
 }
});
test('fixture contexts survive reset and caller mutation cannot contaminate future cases',()=>{
 const cases=gpuPropertyFixtures(assets),feather=cases.find(c=>c.property==='iris_feather')!;
 assert.equal(feather.reset.elements[0].props?.iris_radius,.7);
 const grid=cases.find(c=>c.property==='grid_matte_coverage')!;
 assert.equal(grid.active.elements[0].props?.grid_matte_cell_size,180);
 assert.deepEqual(grid.reset.elements[0].props?.grid_matte_mask,assets.gridMask);
 (grid.active.elements[0].props!.grid_matte_mask as {source_url:string}).source_url='changed';
 assert.notEqual((grid.reset.elements[0].props!.grid_matte_mask as {source_url:string}).source_url,'changed');
 assert.deepEqual(gpuPropertyFixtures(assets).find(c=>c.property===grid.property)!.active.elements[0].props!.grid_matte_mask,assets.gridMask);
 const video=cases.find(c=>c.property==='chroma_key_softness')!;
 assert.equal(video.active.elements[0].props?.chroma_key_color,'#00ff00');
 assert.equal(video.active.elements[0].source_url,assets.video.url);
 assert.equal(cases.find(c=>c.property==='window_open_duration')!.active.elements[0].source_url,assets.fullCanvas);
});
test('portable artwork stays identical to existing Standard fixture sources',()=>{
 const standard=fs.readFileSync(new URL('../remotion/RendererContractFixture.tsx',import.meta.url),'utf8');
 for(const key of ['picture','fullCanvas','backdrop'] as const)assert.ok(standard.includes(GPU_PROPERTY_FIXTURE_SVGS[key]),`${key} artwork drifted`);
 const verifier=fs.readFileSync(new URL('../../../scripts/verify-renderer-contract.ts',import.meta.url),'utf8');
 assert.ok(verifier.includes(GPU_PROPERTY_FIXTURE_SVGS.video));
});
test('missing source handles or incompatible mask fixtures fail before rendering',()=>{
 assert.throws(()=>gpuPropertyFixtures({...assets,video:{url:'/short.mp4',durationSeconds:1}}),/incomplete/);
 assert.throws(()=>gpuPropertyFixtures({...assets,gridMask:{...assets.gridMask,width:320}}),/standard source/);
});
