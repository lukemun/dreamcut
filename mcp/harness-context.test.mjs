import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {projectToolContext,projectInitialTimelineContext} from './harness-context.mjs';
async function dir(t){const directory=await mkdtemp(path.join(os.tmpdir(),'harness-context-'));t.after(()=>rm(directory,{recursive:true,force:true}));return directory;}
const timeline={elements:[{id:'clip',_peaks:[0.1,0.5],duration:2,volume:0.4,props:{_peaks:'semantic property preserved',color:'red'},_audioDuration:3}],revision:19,editing_context:{preferences:{_peaks:'preserve preference',locked:['timing']}}};

test('removes only element waveform field, minifies text and archives exact source result',async t=>{
 const directory=await dir(t);
 const image={type:'image',mimeType:'image/png',data:'untouchedpixels'};
 const result={content:[{type:'text',text:JSON.stringify(timeline,null,2)},image],structuredContent:timeline,isError:false};
 const before=JSON.stringify(result);
 const projected=await projectToolContext({name:'timeline_get',result,directory});
 const metadata=JSON.parse(projected.content[0].text).context_projection;
 const expected=structuredClone(timeline);delete expected.elements[0]._peaks;
 assert.deepEqual(JSON.parse(projected.content[1].text),expected);
 assert.equal(projected.content[1].text,JSON.stringify(expected));
 assert.deepEqual(projected.structuredContent,expected);
 assert.strictEqual(projected.content[2],image);
 assert.equal(JSON.stringify(result),before);
 assert.equal(await readFile(path.join(directory,metadata.source.artifact),'utf8'),before);
 assert.equal(metadata.source.sha256,createHash('sha256').update(before).digest('hex'));
 assert.deepEqual(metadata.omitted_paths,['/content/0/text(json)/elements/0/_peaks','/structuredContent/elements/0/_peaks']);
 assert.match(metadata.notice,/waveform sample values were omitted/);
});

test('initial timeline projection follows identical omission rule and preserves preferences',async t=>{
 const directory=await dir(t);
 const result=await projectInitialTimelineContext({timeline,directory});
 assert.deepEqual(result.timeline.editing_context,timeline.editing_context);
 assert.deepEqual(result.timeline.elements[0].props,timeline.elements[0].props);
 assert.equal(result.timeline.elements[0]._audioDuration,3);
 assert.deepEqual(result.projection.omitted_paths,['/elements/0/_peaks']);
 assert.deepEqual(JSON.parse(await readFile(path.join(directory,result.projection.source.artifact),'utf8')),timeline);
});

test('other tools and unrecognized timeline results remain exactly unchanged',async()=>{
 const result={content:[{type:'text',text:JSON.stringify(timeline)}]};
 assert.strictEqual(await projectToolContext({name:'proposal_get',result}),result);
 const error={isError:true,content:[{type:'text',text:'not JSON'}]};
 assert.strictEqual(await projectToolContext({name:'timeline_get',result:error}),error);
});

test('compact tool content minifies JSON and drops waveform peaks from timeline_get only', async () => {
  const { compactToolContent } = await import('./harness-context.mjs');
  const timeline = { elements: [{ id: 'a', _peaks: [1, 2, 3], props: { x: 1 } }] };
  const content = compactToolContent('timeline_get', [{ type: 'text', text: JSON.stringify(timeline, null, 2) }]);
  assert.match(content[0].text, /waveform/);
  assert.equal(content[1].text, JSON.stringify({ elements: [{ id: 'a', props: { x: 1 } }] }));
  const other = compactToolContent('proposal_get', [{ type: 'text', text: '{\n  "_peaks": [1]\n}' }, { type: 'image', data: 'x' }]);
  assert.deepEqual(other, [{ type: 'text', text: '{"_peaks":[1]}' }, { type: 'image', data: 'x' }]);
});
