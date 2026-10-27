import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {internalGridMatteDirectory} from './internal-masks';
import {listMediaFiles, resolveMediaPath} from './media';
test('internal masks stay outside Library while historical media paths preserve bytes', () => {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'internal-masks-'));
 const old=process.env.TIMELINE_PROJECTS_DIR; process.env.TIMELINE_PROJECTS_DIR=root;
 try {
 const media=path.join(root,'fixture','media');
 fs.mkdirSync(path.join(media,'grid-mattes','cutout'),{recursive:true});
 fs.writeFileSync(path.join(media,'grid-mattes','cutout','00000.png'),'mask bytes');
 fs.writeFileSync(path.join(media,'original.png'),'source bytes');
 assert.deepEqual(listMediaFiles('fixture').map(x=>x.relPath),['original.png']);
 const internal=internalGridMatteDirectory('fixture');
 assert.equal(internal,path.join(root,'fixture','instruments','grid-mattes'));
 assert.equal(fs.readFileSync(resolveMediaPath('fixture',['grid-mattes','cutout','00000.png'])!,'utf8'),'mask bytes');
 assert.equal(internalGridMatteDirectory('fixture'),internal);
 assert.deepEqual(listMediaFiles('fixture').map(x=>x.relPath),['original.png']);
 } finally {if(old===undefined) delete process.env.TIMELINE_PROJECTS_DIR;else process.env.TIMELINE_PROJECTS_DIR=old;fs.rmSync(root,{recursive:true,force:true});}
});
