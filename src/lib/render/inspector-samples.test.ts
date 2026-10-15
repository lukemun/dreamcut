import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {inspectorSampleSpecs} from './inspector-samples';

test('every selectable transition and basic effect has an intact recorded preview and first-frame poster',()=>{
 const root='public/inspector-previews/';
 const manifest=JSON.parse(fs.readFileSync(root+'manifest.json','utf8'));
 assert.ok(['owned','public-domain-and-derived'].includes(manifest.rights));
 assert.deepEqual(manifest.entries.map((entry:{name:string})=>entry.name),inspectorSampleSpecs.map(spec=>spec.name));
 const hash=(file:string)=>createHash('sha256').update(fs.readFileSync(root+file)).digest('hex');
 for(const entry of manifest.entries){
  assert.equal(entry.width/entry.height,9/16);
  assert.equal(entry.frames,31);assert.equal(entry.fps,30);assert.equal(entry.treatment_frames,15);
  assert.equal(hash(entry.name+'.mp4'),entry.video_sha256);
  assert.equal(hash(entry.name+'.jpg'),entry.poster_sha256);
 }
 for(const source of manifest.sources)assert.equal(hash(source.file),source.sha256);
});
