import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {prepareStillPreview,hydrateStillPreview} from './still-preview';
import {stripRuntimePreviewProps} from '../timeline/runtime-preview-props';
import {resolveStillPlaybackSource} from '../remotion/video-preview-source';
import {resolveGpuImageSource} from '../gpu-preview/source';
import {nativeScene} from '../native-preview/scene';
import {preparedPreviewIdentity} from '../timeline/prepared-preview';

test('prepared stills share source selection, quality, orientation and alpha without changing originals',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'still-preview-')),previous=process.env.TIMELINE_PROJECTS_DIR;
 process.env.TIMELINE_PROJECTS_DIR=root;
 try{
  const media=path.join(root,'fixture','media');fs.mkdirSync(media,{recursive:true});
  const file=path.join(media,'photo.jpg'),url='/api/projects/fixture/media/photo.jpg';
  await sharp({create:{width:900,height:1800,channels:3,background:'#b04291'}}).withMetadata({orientation:6}).jpeg().toFile(file);
  const original=fs.readFileSync(file);
  const result=await prepareStillPreview('fixture',url,'economy');
  assert.equal(result.width,360);assert.equal(result.height,180);
  const props=hydrateStillPreview('fixture',url,{title:'Photo'},'economy');
  assert.deepEqual(stripRuntimePreviewProps(props),{title:'Photo'});
  assert.equal(resolveStillPlaybackSource(url,false,10,props),result.url);
  assert.equal(resolveGpuImageSource({source_url:url,duration:10,props},'scope').url,result.url);
  assert.equal(resolveStillPlaybackSource(url,true,10,props),url);
  const actor={id:'still',type:'still',source_url:url,timeline_start:0,duration:10,lane_key:'visual_0',lane_index:0,volume:0,trim_start:0,trim_end:null,playback_rate:1,fade_in:0,fade_out:0,props};
  assert.equal(nativeScene([actor],[],0,320,320).layers[0].path,result.url);
  assert.equal(nativeScene([actor],[],0,320,320,true).layers[0].path,url);
  const input={width:320,height:320,fps:30,durationInFrames:300,inputProps:{elements:[actor]}};
  const canonical=JSON.parse(preparedPreviewIdentity(input));
  assert.equal(resolveGpuImageSource(canonical.inputProps.elements[0],'scope').url,result.url);
  assert.notEqual(preparedPreviewIdentity(input),preparedPreviewIdentity({...input,inputProps:{elements:[{...actor,props:{title:'Photo'}}]}}));
  assert.equal(resolveStillPlaybackSource(url,false,10,{...props,contour_model:'data'}),url);
  const detailed=await prepareStillPreview('fixture',url,'detail');assert.equal(detailed.width,960);assert.notEqual(detailed.url,result.url);
  assert.deepEqual(fs.readFileSync(file),original);
  const alphaFile=path.join(media,'alpha.png'),alphaUrl='/api/projects/fixture/media/alpha.png';
  await sharp({create:{width:100,height:200,channels:4,background:{r:20,g:30,b:40,alpha:.5}}}).png().toFile(alphaFile);
  const alpha=await prepareStillPreview('fixture',alphaUrl,'detail');
  const png=path.join(media,alpha.url.split('/media/')[1]);
  const {data,info}=await sharp(png).raw().toBuffer({resolveWithObject:true});
  assert.equal(info.channels,4);assert.equal(data[3],128);assert.equal(alpha.width,100);assert.equal(alpha.height,200);
  assert.equal(fs.existsSync(path.join(root,'fixture','timeline.json')),false);
  const output=path.join(media,result.url.split('/media/')[1]);fs.writeFileSync(output,'corrupt');
  const rebuilt=await prepareStillPreview('fixture',url,'economy');assert.equal(rebuilt.preview_hash,result.preview_hash);
  await sharp({create:{width:900,height:1800,channels:3,background:'#109030'}}).jpeg().toFile(file);
  const changed=await prepareStillPreview('fixture',url,'economy');assert.notEqual(changed.url,result.url);assert.notEqual(changed.source_hash,result.source_hash);
  await assert.rejects(prepareStillPreview('fixture','https://example.com/photo.jpg','detail'),/Unsupported/);
  assert.equal(hydrateStillPreview('fixture',alphaUrl,{edge_aura:0},'detail').runtime_still_preview,undefined);
 }finally{if(previous===undefined)delete process.env.TIMELINE_PROJECTS_DIR;else process.env.TIMELINE_PROJECTS_DIR=previous;fs.rmSync(root,{recursive:true,force:true});}
});

test('high-depth and malformed still failures preserve originals without repeated retries',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'still-preview-failure-')),previous=process.env.TIMELINE_PROJECTS_DIR;
 process.env.TIMELINE_PROJECTS_DIR=root;
 try{
  const media=path.join(root,'fixture','media');fs.mkdirSync(media,{recursive:true});
  const file=path.join(media,'deep.png'),url='/api/projects/fixture/media/deep.png';
  await sharp({create:{width:32,height:32,channels:3,background:'#305090'}}).toColourspace('rgb16').png().toFile(file);
  assert.equal((await sharp(file).metadata()).depth,'ushort');
  const before=fs.readFileSync(file);
  await assert.rejects(prepareStillPreview('fixture',url,'detail'),/8-bit/);
  for(let i=0;i<3;i++){
   const props=hydrateStillPreview('fixture',url,{},'detail');
   assert.equal((props.runtime_preview_preparation as any).upgrade_state,'failed');
   assert.equal(resolveStillPlaybackSource(url,false,.1,props),url);
  }
  assert.deepEqual(fs.readFileSync(file),before);
  const bad=path.join(media,'bad.jpg');fs.writeFileSync(bad,'not an image');
  await assert.rejects(prepareStillPreview('fixture','/api/projects/fixture/media/bad.jpg','detail'));
  await assert.rejects(prepareStillPreview('fixture','/api/projects/fixture/media/%2e%2e/secret.jpg','detail'),/Unsupported/);
  // The shared media resolver supports linked local libraries. Preparation must
  // write its derivative inside the project and leave that linked source intact.
  const outside=path.join(root,'library.jpg');
  await sharp({create:{width:32,height:32,channels:3,background:'#304050'}}).jpeg().toFile(outside);
  const linkedBytes=fs.readFileSync(outside);fs.symlinkSync(outside,path.join(media,'linked.jpg'));
  const linked=await prepareStillPreview('fixture','/api/projects/fixture/media/linked.jpg','detail');
  assert.match(linked.url,/\/fixture\/media\/\.prepared\//);assert.deepEqual(fs.readFileSync(outside),linkedBytes);
  await sharp({create:{width:32,height:32,channels:3,background:'#305090'}}).png().toFile(file);
  const first=prepareStillPreview('fixture',url,'detail'),second=prepareStillPreview('fixture',url,'detail');
  assert.equal(first,second,'One source/quality job must be shared');
  const ready=await first;assert.ok(ready.preview_hash);
  assert.equal((hydrateStillPreview('fixture',url,{},'detail').runtime_preview_preparation as any).state,'ready');
 }finally{if(previous===undefined)delete process.env.TIMELINE_PROJECTS_DIR;else process.env.TIMELINE_PROJECTS_DIR=previous;fs.rmSync(root,{recursive:true,force:true});}
});
