import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {nativeSourcePath} from './source-path';
test('native visual catalog sources retain real-path confinement and project isolation',()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'native-catalog-')),old=process.env.TIMELINE_VISUAL_CATALOG_DIR;
 process.env.TIMELINE_VISUAL_CATALOG_DIR=temp;
 try{
  fs.mkdirSync(path.join(temp,'media'));fs.writeFileSync(path.join(temp,'media','clip.mp4'),'fixture');fs.writeFileSync(path.join(temp,'private'),'private');fs.symlinkSync(path.join(temp,'private'),path.join(temp,'media','escape.mp4'));
  assert.equal(nativeSourcePath('test','/api/visual-catalog/media/clip.mp4').file,fs.realpathSync(path.join(temp,'media','clip.mp4')));
  assert.throws(()=>nativeSourcePath('test','/api/visual-catalog/media/escape.mp4'),/outside/);
  assert.throws(()=>nativeSourcePath('test','/api/visual-catalog/media/../private'),/outside/);
  assert.throws(()=>nativeSourcePath('test','/api/projects/other/media/clip.mp4'),/this project/);
  assert.throws(()=>nativeSourcePath('test','https://external.invalid/movie.mp4'),/local media/);
 }finally{if(old===undefined)delete process.env.TIMELINE_VISUAL_CATALOG_DIR;else process.env.TIMELINE_VISUAL_CATALOG_DIR=old;fs.rmSync(temp,{recursive:true,force:true});}
});
