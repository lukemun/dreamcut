import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {resolveRenderAsset,createRenderAssetHasher} from './render-assets';
test('catalog and project sources share a verified resolver; only referenced assets invalidate',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'render-assets-')),origin='http://localhost:3123';
 const before={projects:process.env.TIMELINE_PROJECTS_DIR,sfx:process.env.TIMELINE_SFX_CATALOG_DIR};
 process.env.TIMELINE_PROJECTS_DIR=path.join(root,'projects');process.env.TIMELINE_SFX_CATALOG_DIR=path.join(root,'sfx');
 try {
  const project=path.join(root,'projects/p/media/a.mp4'),sfx=path.join(root,'sfx/audio/licensed/sike.mp3'),pub=path.join(root,'public');
  for(const file of [project,sfx]){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'source');}
  fs.mkdirSync(pub);fs.writeFileSync(path.join(pub,'irrelevant.txt'),'before');
  assert.equal(resolveRenderAsset('/api/projects/p/media/a.mp4',origin,pub),project);
  const source='/api/sfx-catalog/media/licensed/sike.mp3';assert.equal(resolveRenderAsset(source,origin,pub),sfx);
  const hash=createRenderAssetHasher('pinned-runtime',pub),key=hash({source},origin);
  fs.writeFileSync(path.join(pub,'irrelevant.txt'),'after');assert.equal(hash({source},origin),key);
  fs.writeFileSync(sfx,'changed');assert.notEqual(hash({source},origin),key);
  assert.throws(()=>resolveRenderAsset('/api/sfx-catalog/media/%2e%2e%2fsecret',origin,pub));
  assert.throws(()=>resolveRenderAsset('https://example.com/audio.mp3',origin,pub));
  assert.throws(()=>resolveRenderAsset('/api/sfx-catalog/media/licensed/missing.mp3',origin,pub));
  assert.throws(()=>resolveRenderAsset(source+'?dynamic=1',origin,pub));
 }finally{
  if(before.projects===undefined)delete process.env.TIMELINE_PROJECTS_DIR;else process.env.TIMELINE_PROJECTS_DIR=before.projects;
  if(before.sfx===undefined)delete process.env.TIMELINE_SFX_CATALOG_DIR;else process.env.TIMELINE_SFX_CATALOG_DIR=before.sfx;
  fs.rmSync(root,{recursive:true,force:true});
 }
});
