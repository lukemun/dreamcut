import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareFixture} from './prepare-editing-fixture.mjs';

test('preparation copies only verified inputs, refuses reuse and detects corruption',t=>{
 const dir=fs.mkdtempSync(path.resolve('private/eval-setup-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
 const fixture=path.join(dir,'fixture');fs.mkdirSync(path.join(fixture,'input'),{recursive:true});
 fs.writeFileSync(path.join(fixture,'input/task.txt'),'request');fs.writeFileSync(path.join(fixture,'answer.json'),'hidden');
 const manifest={version:1,case_id:'test',inputs:[{path:'input/task.txt',sha256:createHash('sha256').update('request').digest('hex')}]};
 const save=()=>fs.writeFileSync(path.join(fixture,'manifest.json'),JSON.stringify(manifest));save();
 const output=path.join(dir,'attempt');prepareFixture(fixture,output);
 assert.equal(fs.readFileSync(path.join(output,'task.txt'),'utf8'),'request');assert.ok(!fs.existsSync(path.join(output,'answer.json')));
 assert.throws(()=>prepareFixture(fixture,output),/already exists/);
 fs.writeFileSync(path.join(fixture,'input/task.txt'),'changed');assert.throws(()=>prepareFixture(fixture,path.join(dir,'other')),/mismatch/);
 manifest.inputs[0].path='input/../answer.json';save();assert.throws(()=>prepareFixture(fixture,path.join(dir,'other')),/Only input/);
 assert.throws(()=>prepareFixture(fixture,path.resolve('projects/eval-test')),/inside private/);
});
