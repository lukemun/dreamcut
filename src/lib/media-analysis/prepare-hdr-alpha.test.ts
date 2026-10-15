import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {createProject} from '../local-store/store';
import {ingestMediaPath} from '../local-store/media-ingest';
import {readPreparation,preparationSourcePath} from '../local-store/media-preparation';
import {prepareEditorMedia} from './prepare-editor-media';
import {probeVideo,createColorManagedVideoPair} from '../../../scripts/lib/color-managed-video';
import {COLOR_MANAGED_ALPHA_VIDEO_RECIPE} from './color-profile';
import {probeHasAlphaChannel} from './alpha-channel';

for(const {rate,duration,frames} of [{rate:'30',duration:.4,frames:12},{rate:'30000/1001',duration:1.1,frames:33},{rate:'30000/1001',duration:6.6,frames:198}])
test(`unregistered HDR VP9-alpha at ${rate} fps preserves alpha, timing, audio and the edit`, {skip:process.platform!=='darwin'},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hdr-alpha-preparation-'));
 const keys=['TIMELINE_PROJECTS_DIR','MEDIA_PREPARATION_AUTOSTART','DREAMCUT_IMPORT_AUTOSTART'] as const;
 const old=keys.map(key=>process.env[key]);
 process.env.TIMELINE_PROJECTS_DIR=path.join(root,'projects');
 process.env.MEDIA_PREPARATION_AUTOSTART='0';process.env.DREAMCUT_IMPORT_AUTOSTART='0';
 try{
  createProject('fixture','web');
  const source=path.join(root,'alpha.webm');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=red:size=64x64:rate=${rate}:duration=${duration},format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='255*mod(X+N*4,W)/(W-1)'`,'-f','lavfi','-i',`sine=frequency=440:duration=${duration}`,'-map','0:v:0','-map','1:a:0','-c:a','libopus','-c:v','libvpx-vp9','-lossless','1','-auto-alt-ref','0','-color_primaries','bt2020','-color_trc','arib-std-b67','-colorspace','bt2020nc',path.join(root,'encoded.webm')]);
  execFileSync('ffmpeg',['-v','error','-i',path.join(root,'encoded.webm'),'-c','copy','-color_primaries','bt2020','-color_trc','arib-std-b67','-colorspace','bt2020nc',source]);
  const original=fs.readFileSync(source);
  assert.throws(()=>createColorManagedVideoPair({sourcePath:source,renderAuthorityPath:path.join(root,'invalid.webm'),previewProxyPath:path.join(root,'invalid-preview.webm'),previewWidth:64,previewHeight:64,fps:24}),/30 fps/);
  assert.equal(fs.existsSync(path.join(root,'invalid.webm')),false);
  assert.equal(probeVideo(source).color_transfer,"arib-std-b67",JSON.stringify(probeVideo(source)));
  const imported=ingestMediaPath({projectId:'fixture',sourcePath:source});
  const project=path.join(root,'projects','fixture');
  const timeline=fs.readFileSync(path.join(project,'timeline.json'));
  const metadata=fs.readFileSync(path.join(project,'metadata.json'));
  const record=readPreparation('fixture',imported.media_path)!;
  const ready=prepareEditorMedia('fixture',record);
  assert.equal(ready.state,'ready',ready.error);
  assert.ok(ready.audio,'Dedicated audio preview must survive preparation');
  const renderAudio=JSON.parse(execFileSync('ffprobe',['-v','error','-select_streams','a:0','-show_entries','stream=codec_name','-of','json',preparationSourcePath('fixture',ready.render!)],{encoding:'utf8'}));
  assert.equal(renderAudio.streams[0]?.codec_name,'opus','Full-quality authority must retain embedded audio');
  assert.equal(ready.alpha,true);assert.notEqual(ready.render,record.source);
  assert.equal(ready.preview_probe?.frame_count,frames);assert.equal(ready.preview_probe?.duration_seconds,duration);
  const receipt=ready.color_management!;
  assert.equal(receipt.recipe_id,COLOR_MANAGED_ALPHA_VIDEO_RECIPE);
  assert.equal(receipt.alpha_preservation!.source_plane_sha256,receipt.alpha_preservation!.render_plane_sha256);
  assert.ok(receipt.alpha_preservation!.preview_parity_samples.every(sample=>sample.ssim_all>=.97));
  assert.ok(receipt.parity_samples.every(sample=>sample.ssim_all>=.97));
  for(const relative of [ready.render!,ready.preview!]){
   const probe=probeVideo(preparationSourcePath('fixture',relative),{countFrames:true});
   assert.equal(probe.codec,'vp9');assert.equal(probeHasAlphaChannel(probe),true);
   assert.equal(probe.color_transfer,'bt709');assert.equal(probe.color_primaries,'bt709');assert.equal(probe.color_space,'bt709');
   assert.equal(probe.frame_count,frames);assert.equal(probe.frame_rate,'30/1');
  }
  assert.deepEqual(fs.readFileSync(source),original);
  assert.deepEqual(fs.readFileSync(preparationSourcePath('fixture',record.source)),original);
  assert.deepEqual(fs.readFileSync(path.join(project,'timeline.json')),timeline);
  assert.deepEqual(fs.readFileSync(path.join(project,'metadata.json')),metadata);
  assert.equal(readPreparation('fixture',record.source)?.state,'ready');
  assert.ok(!fs.readdirSync(path.dirname(preparationSourcePath('fixture',ready.render!))).some(name=>name.startsWith('.alpha-color-')));
 }finally{
  keys.forEach((key,i)=>{if(old[i]===undefined)delete process.env[key];else process.env[key]=old[i];});
  fs.rmSync(root,{recursive:true,force:true});
 }
});

test('higher-precision HDR alpha does not silently become an 8-bit authority',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hdr-alpha-precision-'));
 try{
  const source=path.join(root,'source.mov'),render=path.join(root,'render.webm');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=red@0.5:size=32x32:rate=30:duration=0.1,format=yuva444p10le','-c:v','prores_ks','-profile:v','4','-alpha_bits','16','-color_primaries','bt2020','-color_trc','arib-std-b67','-colorspace','bt2020nc',source]);
  assert.throws(()=>createColorManagedVideoPair({sourcePath:source,renderAuthorityPath:render,previewProxyPath:path.join(root,'preview.webm'),previewWidth:32,previewHeight:32}),/higher-precision alpha/);
  assert.equal(fs.existsSync(render),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
