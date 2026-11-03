import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {validatePreviewProxy} from './preview-proxy-validation';

test('server proxy revision stays stable until a same-URL media replacement',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'proxy-revision-')),previous=process.env.TIMELINE_PROJECTS_DIR;
 process.env.TIMELINE_PROJECTS_DIR=root;
 try{
  const media=path.join(root,'fixture','media');fs.mkdirSync(media,{recursive:true});
  const file=path.join(media,'proxy.mp4'),url='/api/projects/fixture/media/proxy.mp4';
  for(const color of ['red','blue'])execFileSync('ffmpeg',['-v','error','-f','lavfi','-i',`color=${color}:size=32x32:rate=30:duration=0.1`,'-c:v','libx264','-pix_fmt','yuv420p',path.join(media,`${color}.mp4`)]);
  fs.renameSync(path.join(media,'red.mp4'),file);
  const first=validatePreviewProxy(url,false);assert.equal(first.ok,true);assert.ok('revision' in first);assert.equal('has_alpha' in first&&first.has_alpha,false);
  assert.deepEqual(validatePreviewProxy(url,false),first);
  fs.renameSync(path.join(media,'blue.mp4'),file);
  const second=validatePreviewProxy(url,false);assert.equal(second.ok,true);assert.ok('revision' in second);
  assert.notEqual(second.revision,first.revision);
  assert.equal(second.width,first.width);assert.equal(second.height,first.height);
 }finally{
  if(previous===undefined)delete process.env.TIMELINE_PROJECTS_DIR;else process.env.TIMELINE_PROJECTS_DIR=previous;
  fs.rmSync(root,{recursive:true,force:true});
 }
});


test('caption hydration replaces saved claims with measured alpha and rejects nonlocal preview evidence',async()=>{
 const {hydrateCaptionFill}=await import('./timeline-payload');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'caption-preview-')),previous=process.env.TIMELINE_PROJECTS_DIR;
 process.env.TIMELINE_PROJECTS_DIR=root;
 try{
  const media=path.join(root,'fixture','media');fs.mkdirSync(media,{recursive:true});
  execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=red@0.3:size=32x32:rate=30:duration=0.1,format=yuva420p','-c:v','libvpx-vp9','-auto-alt-ref','0',path.join(media,'alpha.webm')]);
  const preview='/api/projects/fixture/media/alpha.webm';
  const evidence=hydrateCaptionFill({mediaFillVideoUrl:'/original.mov',mediaFillVideoPreviewUrl:preview,runtime_media_fill_preview:{alpha:false,validation:{ok:true}}},'detail')!;
  assert.equal(evidence.alpha,true);assert.equal(evidence.validation.ok,true);assert.equal(evidence.previewUrl,preview);
  assert.equal(hydrateCaptionFill({mediaFillVideoUrl:'/original.mov'},'detail'),null);
  assert.equal(hydrateCaptionFill({mediaFillVideoUrl:'/original.mov',mediaFillVideoPreviewUrl:'https://example.invalid/proxy.mp4'},'detail')?.validation.ok,false);
 }finally{
  if(previous===undefined)delete process.env.TIMELINE_PROJECTS_DIR;else process.env.TIMELINE_PROJECTS_DIR=previous;
  fs.rmSync(root,{recursive:true,force:true});
 }
});
