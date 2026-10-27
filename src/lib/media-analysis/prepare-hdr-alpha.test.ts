import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {createProject} from '../local-store/store';
import {ingestMediaPath} from '../local-store/media-ingest';
import {readPreparation,preparationSourcePath,preparedPlacement,preparedCodeValues,enqueueMediaPreparation,writePreparation} from '../local-store/media-preparation';
import {appendCustomCutout,type CustomCutoutReceipt} from '../local-store/custom-cutouts';
import {sdrExportSources} from '../local-store/export-render-sources';
import type {TimelineElement} from '@/components/studio/timeline/types';
import {prepareEditorMedia} from './prepare-editor-media';
import {probeVideo,createColorManagedVideoPair,measureAlphaDeviation,alphaDeviationWithinTolerance,ALPHA_AUTHORITY_TOLERANCE} from '../../../scripts/lib/color-managed-video';
import {COLOR_MANAGED_ALPHA_VIDEO_RECIPE,HDR_CODE_ALPHA_VIDEO_RECIPE,HDR_CODE_VIDEO_RECIPE} from './color-profile';
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
  assert.equal(receipt.recipe_id,HDR_CODE_ALPHA_VIDEO_RECIPE);
  assert.deepEqual(receipt.source_encoding,{transfer:'hlg',primaries:'rec2020',max_cll_nits:null},'the cutout decodes HLG in the grade shader');
  const kept=receipt.alpha_preservation!;
  assert.ok(kept.authority_encoding==='vp9-crf18'||kept.authority_encoding==='vp9-lossless');
  assert.equal(kept.measured!.frames,frames,'every cadence-mapped frame is measured');
  assert.ok(alphaDeviationWithinTolerance(kept.measured!),JSON.stringify(kept.measured));
  assert.deepEqual(kept.tolerance,ALPHA_AUTHORITY_TOLERANCE);
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

test('the alpha tolerance check passes a faithful authority and catches a damaged one',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-tolerance-'));
 try{
  const make=(name:string,alpha:string)=>{const file=path.join(root,name);execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=red:size=96x96:rate=30:duration=0.5,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='${alpha}'`,'-c:v','libvpx-vp9','-lossless','1','-auto-alt-ref','0',file]);return file;};
  // An opaque disc with a soft rim on a clear background, as a cutout matte has.
  const disc='clip((40-hypot(X-48,Y-48))*64,0,255)';
  const source=make('source.webm',disc);
  const same=measureAlphaDeviation(source,probeVideo(source),make('same.webm',disc),probeVideo(path.join(root,'same.webm')),30);
  assert.equal(same.frames,15);assert.equal(same.max_abs,0);assert.ok(alphaDeviationWithinTolerance(same));
  // The same matte with a visible ghost in the clear corner.
  const ghost=make('ghost.webm',`if(lt(X,16)*lt(Y,16),80,${disc})`);
  const damaged=measureAlphaDeviation(source,probeVideo(source),ghost,probeVideo(ghost),30);
  assert.ok(damaged.violation_fraction>ALPHA_AUTHORITY_TOLERANCE.max_violation_fraction,JSON.stringify(damaged));
  assert.equal(alphaDeviationWithinTolerance(damaged),false);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

test('an authority CRF 18 cannot hold within tolerance is re-made lossless',{skip:process.platform!=='darwin'},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'alpha-fallback-'));
 try{
  const encoded=path.join(root,'encoded.webm'),source=path.join(root,'source.webm'),render=path.join(root,'render.webm');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',"color=red:size=64x64:rate=30:duration=0.4,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='255*mod(X+N*4,W)/(W-1)'",'-c:v','libvpx-vp9','-lossless','1','-auto-alt-ref','0',encoded]);
  execFileSync('ffmpeg',['-v','error','-i',encoded,'-c','copy','-color_primaries','bt2020','-color_trc','arib-std-b67','-colorspace','bt2020nc',source]);
  // A moving soft ramp: a lossy encode cannot keep every soft pixel exact, so the pair must fall back to the lossless
  // authority. Lossless VP9 can still move an opaque 255 to 254, hence one level elsewhere.
  const exact={edge_mean_abs:0,worst_frame_edge_mean_abs:0,max_abs:1,clear_or_opaque_deviation:1,max_violation_fraction:0};
  const receipt=createColorManagedVideoPair({sourcePath:source,renderAuthorityPath:render,previewProxyPath:path.join(root,'preview.webm'),previewWidth:64,previewHeight:64,alphaTolerance:exact});
  assert.equal(receipt.alpha_preservation!.authority_encoding,'vp9-lossless');
  assert.equal(receipt.alpha_preservation!.measured!.edge_mean_abs,0);
  assert.deepEqual(receipt.alpha_preservation!.tolerance,exact);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});

/** RGB of one frame, read as the browser reads a BT.709-tagged file: the decoded code values, before any shader. */
function codeValueFrame(file:string,second:number,width:number,height:number){
 const decode=file.endsWith('.webm')?['-c:v','libvpx-vp9']:[];
 return execFileSync('ffmpeg',['-v','error','-ss',String(second),...decode,'-i',file,'-frames:v','1','-vf',`scale=${width}:${height}:in_color_matrix=bt709:in_range=tv:out_range=pc:flags=accurate_rnd+full_chroma_int,format=rgba`,'-f','rawvideo','-pix_fmt','rgba','pipe:1']);
}

// hlg-hevc-10bit with transparency: a cutout and the footage it was cut from must take one decode path.
test('an HDR cutout decodes like the footage it was cut from, before and after the footage is prepared again',{skip:process.platform!=='darwin'},()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'hdr-cutout-match-'));
 const keys=['TIMELINE_PROJECTS_DIR','MEDIA_PREPARATION_AUTOSTART','DREAMCUT_IMPORT_AUTOSTART'] as const;
 const old=keys.map(key=>process.env[key]);
 process.env.TIMELINE_PROJECTS_DIR=path.join(root,'projects');
 process.env.MEDIA_PREPARATION_AUTOSTART='0';process.env.DREAMCUT_IMPORT_AUTOSTART='0';
 try{
  createProject('fixture','web');
  const footageFile=path.join(root,'hdr.mov');
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=256x256:rate=30:duration=1','-c:v','libx265','-x265-params','log-level=error','-pix_fmt','yuv420p10le','-tag:v','hvc1','-color_primaries','bt2020','-color_trc','arib-std-b67','-colorspace','bt2020nc',footageFile]);
  const footage=ingestMediaPath({projectId:'fixture',sourcePath:footageFile});
  // As cutout_prepare's direct-source-decode makes it: the footage's own HLG/BT.2020 values, 8-bit, with a matte.
  const encoded=path.join(root,'cut-encoded.webm'),cutFile=path.join(root,'cutout.webm');
  execFileSync('ffmpeg',['-v','error','-i',footageFile,'-vf',"scale=flags=accurate_rnd+full_chroma_int,format=yuv420p,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='clip((90-hypot(X-128,Y-128))*32,0,255)'",'-c:v','libvpx-vp9','-lossless','1','-auto-alt-ref','0','-color_primaries','bt2020','-color_trc','arib-std-b67','-colorspace','bt2020nc',encoded]);
  execFileSync('ffmpeg',['-v','error','-i',encoded,'-c','copy','-color_primaries','bt2020','-color_trc','arib-std-b67','-colorspace','bt2020nc',cutFile]);
  const cut=ingestMediaPath({projectId:'fixture',sourcePath:cutFile});
  appendCustomCutout('fixture',{cutout_id:'hdr-cutout',output_relative_path:cut.media_path,source_relative_path:footage.media_path} as CustomCutoutReceipt);

  const footageReady=prepareEditorMedia('fixture',readPreparation('fixture',footage.media_path)!);
  assert.equal(footageReady.state,'ready',footageReady.error);
  assert.equal(footageReady.color_management?.recipe_id,HDR_CODE_VIDEO_RECIPE);
  // A cutout prepared by the superseded recipe (tone-mapped to SDR) is queued again and not reused.
  const cutFirst=prepareEditorMedia('fixture',readPreparation('fixture',cut.media_path)!);
  assert.equal(cutFirst.state,'ready',cutFirst.error);
  const {source_encoding:_dropped,...sdrReceipt}=cutFirst.color_management!;
  writePreparation('fixture',{...cutFirst,color_management:{...sdrReceipt,recipe_id:COLOR_MANAGED_ALPHA_VIDEO_RECIPE}});
  const requeued=enqueueMediaPreparation('fixture',cut.media_path)!;
  assert.equal(requeued.state,'preparing','an SDR-converted HDR authority is prepared again');
  const cutReady=prepareEditorMedia('fixture',requeued);
  assert.equal(cutReady.state,'ready',cutReady.error);
  assert.notEqual(cutReady.render,cutFirst.render,'the superseded authority is not reused');
  assert.equal(cutReady.color_management?.recipe_id,HDR_CODE_ALPHA_VIDEO_RECIPE);
  assert.deepEqual(cutReady.color_management?.source_encoding,footageReady.color_management?.source_encoding);
  assert.equal(enqueueMediaPreparation('fixture',cut.media_path)!.state,'ready','a current code-value package is not prepared again');
  writePreparation('fixture',{...cutReady,color_management:{...cutReady.color_management!,recipe_id:'ffmpeg-hdr-code-alpha-authority-v1' as never}});
  assert.equal(enqueueMediaPreparation('fixture',cut.media_path)!.state,'preparing','an earlier code-value build is prepared again');
  writePreparation('fixture',cutReady);

  // Both bind with the same decode description, so the grade shader treats both pictures alike.
  const url=(relative:string)=>`/api/projects/fixture/media/${relative}`;
  const footagePlaced=preparedPlacement('fixture',url(footage.media_path),{});
  const cutPlaced=preparedPlacement('fixture',url(cut.media_path),{});
  assert.ok(footagePlaced.props.source_color_space);
  assert.deepEqual(cutPlaced.props.source_color_space,footagePlaced.props.source_color_space);
  // And both authorities hold the same code values where the cutout is opaque.
  for(const relative of [cutReady.render!,cutReady.preview!]){
   const probe=probeVideo(preparationSourcePath('fixture',relative));
   assert.equal(probeHasAlphaChannel(probe),true);
   assert.deepEqual([probe.color_space,probe.color_transfer,probe.color_primaries],['bt709','bt709','bt709']);
  }
  const a=codeValueFrame(preparationSourcePath('fixture',cutReady.render!),.5,256,256);
  const b=codeValueFrame(preparationSourcePath('fixture',footageReady.render!),.5,256,256);
  // A colour shift shows as a bias per channel; the per-pixel error is only the two encoders' noise on a sharp test chart.
  let pixels=0,error=0;const bias=[0,0,0];
  for(let i=0;i<a.length;i+=4)if(a[i+3]===255){pixels++;for(let c=0;c<3;c++){bias[c]+=a[i+c]-b[i+c];error+=Math.abs(a[i+c]-b[i+c]);}}
  assert.ok(pixels>10000,`opaque cutout pixels: ${pixels}`);
  assert.ok(bias.every(sum=>Math.abs(sum/pixels)<1),`cutout colour is offset from the footage by ${bias.map(sum=>(sum/pixels).toFixed(2))} levels`);
  assert.ok(error/pixels/3<5,`cutout and footage code values differ by ${(error/pixels/3).toFixed(2)} levels per pixel`);

  // Preparing the footage again around its existing authority keeps the receipt as render_color_management;
  // binding, thumbnails and export still read how to decode it.
  const resize={...footageReady,state:'preparing' as const,preview_quality:'hd' as const};
  writePreparation('fixture',resize);
  const again=prepareEditorMedia('fixture',resize);
  assert.equal(again.state,'ready',again.error);
  assert.equal(again.render,footageReady.render,'the authority is reused');
  assert.equal(again.color_management,undefined);
  assert.ok(again.render_color_management?.source_encoding);
  assert.deepEqual(preparedPlacement('fixture',url(footage.media_path),{}).props.source_color_space,footagePlaced.props.source_color_space);
  assert.equal(preparedCodeValues('fixture',again.render!)?.space.transfer,'hlg');
  // A clip still bound to the HDR original exports from the prepared authority with its decode description.
  const [exported]=sdrExportSources('fixture',[{id:'clip',type:'video_clip',source_url:url(footage.media_path),props:{}} as unknown as TimelineElement]);
  assert.equal(exported.source_url,url(again.render!));
  assert.deepEqual(exported.props?.source_color_space,footagePlaced.props.source_color_space);
 }finally{
  keys.forEach((key,i)=>{if(old[i]===undefined)delete process.env[key];else process.env[key]=old[i];});
  fs.rmSync(root,{recursive:true,force:true});
 }
});
