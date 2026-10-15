import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { createToolSelection, queryCatalog, recipeCompileRequest } from './capability-catalog.mjs';
import { compileRevealSequence } from '../src/lib/agent/proposal-reveal-sequence.ts';
import { revealEvalPacket, gradeRevealOption } from '../src/lib/agent/reveal-sequence-eval.ts';

const catalog = profile => JSON.parse(spawnSync(process.execPath, ['mcp/server.mjs', '--catalog', `--profile=${profile}`], {encoding:'utf8',env:{...process.env,DREAMCUT_TOOL_FAMILIES:''}}).stdout);

test('profiles are smaller, discovery paginates, fixed allowlist cannot expand', () => {
  const full = catalog('full'), editing = catalog('editing');
  assert.ok(editing.tools.length < full.tools.length / 2);
  assert.equal(editing.catalog_sha256, full.catalog_sha256);
  const selection = createToolSelection({profile:'editing',allowedFamilies:['proposal-authoring']});
  assert.equal(selection.enabled.has('cutout_prepare'), false);
  assert.throws(()=>selection.load('cutout-preparation'), /allowlist/);
  assert.throws(()=>selection.load('typo'), /valid family/);
  assert.ok(selection.load('proposal-authoring').includes('proposal_reveal_sequence'));
  assert.deepEqual(selection.load('proposal-authoring'), []);
  assert.equal(queryCatalog({limit:1}, selection, full.tools).next_offset, 1);
  assert.throws(()=>queryCatalog({limit:0}, selection, []));
  const found = queryCatalog({query:'prepared-reveal-sequence'}, selection, full.tools);
  assert.equal(found.entries[0].executable, true);
  // get names tools this session already registered instead of repeating their schemas (F4);
  // a session that has not registered recipe_compile still receives its full schema.
  assert.deepEqual(queryCatalog({action:'get',id:'prepared-reveal-sequence'}, selection, full.tools).tools[0], {name:'recipe_compile', registered:true, schema:'Already registered in tools/list; not repeated here.'});
  const unregistered = createToolSelection({profile:'editing', allowedFamilies:[]});
  assert.ok(queryCatalog({action:'get',id:'prepared-reveal-sequence'}, unregistered, full.tools).tools[0].inputSchema.properties.inputs);
});

test('MCP loads schemas with notification, rejects hidden calls and compiles recipes through existing owner', {timeout:20000}, async t => {
  const paths=[];
  const server=createServer(async(req,res)=>{
    let raw='';for await(const chunk of req) raw+=chunk;
    res.setHeader('content-type','application/json');
    if(req.url.startsWith('/api/agent/') && /tool-events|product-signals/.test(req.url)) {res.end('{}');return;}
    paths.push(req.url);
    try { res.end(JSON.stringify(compileRevealSequence(JSON.parse(raw)))); }
    catch(error) {res.statusCode=400;res.end(JSON.stringify({error:error.message}));}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>server.close());
  const child=spawn(process.execPath,['mcp/server.mjs','--profile=editing'],{env:{...process.env,DREAMCUT_TOOL_FAMILIES:'proposal-authoring,editing-context,cutout-preparation',TIMELINE_EDITOR_BASE_URL:`http://127.0.0.1:${server.address().port}`},stdio:['pipe','pipe','pipe']});t.after(()=>child.kill());
  const pending=new Map(),notifications=[];let id=0;
  createInterface({input:child.stdout}).on('line',line=>{const msg=JSON.parse(line);if(msg.id)pending.get(msg.id)?.(msg.result);else notifications.push(msg.method);});
  const request=(method,params)=>new Promise(resolve=>{const key=++id;pending.set(key,resolve);child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n');});
  const call=(name,args)=>request('tools/call',{name,arguments:args});
  assert.equal((await request('initialize',{})).capabilities.tools.listChanged,true);
  assert.equal((await call('cutout_prepare',{})).structuredContent.code,'TOOL_NOT_LOADED');
  assert.equal(paths.length,0);
  await call('capability_catalog',{action:'load',id:'cutout-preparation'});
  assert.ok(notifications.includes('notifications/tools/list_changed'));
  assert.ok((await request('tools/list',{})).tools.some(t=>t.name==='cutout_prepare'));
  assert.equal((await call('capability_catalog',{action:'load',id:'workspace-editing'})).structuredContent.code,'CAPABILITY_NOT_ALLOWED');
  assert.equal((await call('recipe_compile',{project_id:'fixture.v2',recipe_id:'unknown',recipe_version:1,inputs:{}})).structuredContent.code,'UNSUPPORTED_RECIPE');
  assert.equal(paths.length,0);
  for(const caseId of ['shared-gap-first','independent-gaps-followup']) {
    const packet=revealEvalPacket(caseId);
    const result=await call('recipe_compile',{project_id:'fixture.v2',recipe_id:'prepared-reveal-sequence',recipe_version:1,inputs:{...packet.input,gap_mode:caseId==='shared-gap-first'?'shared':'independent'}});
    assert.equal(result.isError,undefined,JSON.stringify(result));
    const value=JSON.parse(result.content[0].text);
    assert.equal(gradeRevealOption(caseId,value.option).pass,true);
    assert.deepEqual(value.recipe,{id:'prepared-reveal-sequence',version:1});
  }
  assert.ok(paths.every(p=>p==='/api/projects/fixture.v2/timeline/proposals/reveal-sequence'));
  const packet=revealEvalPacket('shared-gap-first');
  const bad=await call('recipe_compile',{project_id:'fixture.v2',recipe_id:'prepared-reveal-sequence',recipe_version:1,inputs:{...packet.input,option:{...packet.input.option,timing_controls:[{}]}}});
  assert.equal(bad.isError,true);
});

test('recipe envelope rejects source injection, versions and unknown inputs before dispatch',()=>{
  const schema=catalog('full').tools.find(t=>t.name==='proposal_reveal_sequence').inputSchema;
  const args={project_id:'fixture.v2',recipe_id:'prepared-reveal-sequence',recipe_version:1,inputs:{}};
  assert.throws(()=>recipeCompileRequest({...args,recipe_version:2},schema));
  assert.throws(()=>recipeCompileRequest({...args,project_id:'../other'},schema));
  assert.equal(recipeCompileRequest({...args,project_id:'film.v2'},schema).project_id,'film.v2');
  for(const project_id of ['.', '..', '', 'x'.repeat(129), 'a/b', 'a%2Fb']) assert.throws(()=>recipeCompileRequest({...args,project_id},schema));
  assert.throws(()=>recipeCompileRequest({...args,inputs:{project_id:'other'}},schema));
  assert.throws(()=>recipeCompileRequest({...args,inputs:{command:'anything'}},schema));
});

test('common language and normalized aliases discover capabilities without loading them', () => {
  const selection = createToolSelection({profile:'editing', allowedFamilies:['proposal-authoring']});
  const cases = [
    ['masking', 'cutout-preparation'], ['MASKS!', 'cutout-preparation'],
    ['Can you please remove the background?', 'cutout-preparation'],
    ['isolate a person', 'cutout-preparation'], ['background-removal', 'cutout-preparation'],
    ['rotoscoping', 'cutout-preparation'], ['scratch pad', 'cutout-treatment'],
    ['subtitles', 'speech-preparation'], ['speech-to-text', 'speech-preparation'],
    ['proxies', 'media-readiness'], ['contact sheet', 'visual-evidence'],
    ['compare takes', 'assembly-auditions'], ['cutter', 'workspace-editing'],
    ['bring in files', 'media-intake-generation'], ['beats', 'spatial-rhythm'],
    ['personal style', 'editing-context'], ['nested clip', 'compound-preparation'],
    ['tool calls', 'tool-accounting'], ['find tools', 'capability-discovery'],
    ['dials', 'proposal-authoring'], ['cutout_prepare', 'cutout-preparation'],
    ['recast this video', 'storyboard-recast'], ['remake this video with me as the singer', 'storyboard-recast'],
  ];
  for (const [query, expected] of cases) {
    const result = queryCatalog({query}, selection, []);
    assert.equal(result.entries[0]?.id, expected, query);
  }
  const found = queryCatalog({query:'masking'}, selection, []).entries[0];
  assert.equal(found.allowed, false);
  assert.equal(found.loaded, false);
  assert.equal(selection.enabled.has('cutout_prepare'), false);
  assert.throws(() => selection.load(found.id), /allowlist/);
  assert.equal(queryCatalog({query:'intergalactic banana'}, selection, []).total, 0);
  assert.equal(queryCatalog({query:'please can you'}, selection, []).total, 0);
  // Feature entries make "mask" match more than one page, so compare the same 20-entry window.
  const all = queryCatalog({query:'mask', limit:20}, selection, []);
  const first = queryCatalog({query:'mask', limit:1}, selection, []);
  const rest = queryCatalog({query:'mask', offset:1, limit:19}, selection, []);
  assert.deepEqual([...first.entries,...rest.entries], all.entries);
});

// docs/tools/audits/2026-10-10-agent-tool-usability-audit.md, "Natural requests that missed
// the catalog": request, intended capability, and the feature paths (below operations[], or
// timing_controls) of which at least one must also be in the top 3.
const AUDIT_MISSES = [
  ['slow this down', 'proposal-authoring', ['patch.playback_rate', 'props.playback_speed_steps']],
  ['slow motion', 'proposal-authoring', ['patch.playback_rate', 'props.playback_speed_steps']],
  ['fade the music', 'proposal-authoring', ['patch.fade_in', 'patch.fade_out', 'props.volume_envelope']],
  ['fade out the audio', 'proposal-authoring', ['patch.fade_out']],
  ['make the music quieter', 'proposal-authoring', ['patch.volume', 'props.volume_envelope']],
  ['duck the music under the voice', 'proposal-authoring', ['props.volume_envelope']],
  ['turn down the volume', 'proposal-authoring', ['patch.volume', 'props.volume_envelope']],
  ['green screen', 'proposal-authoring', ['props.chroma_key_color']],
  ['chroma key', 'proposal-authoring', ['props.chroma_key_color']],
  ['color grade', 'proposal-authoring', ['props.grade_exposure_ev', 'props.grade_contrast', 'props.grade_saturation', 'props.grade_temperature']],
  ['make it warmer', 'proposal-authoring', ['props.grade_temperature']],
  ['brighten the shot', 'proposal-authoring', ['props.grade_exposure_ev']],
  ['increase saturation', 'proposal-authoring', ['props.grade_saturation']],
  ['zoom in', 'proposal-authoring', ['props.media_scale']],
  ['crop the video', 'proposal-authoring', ['props.mask_inset']],
  ['flip the video horizontally', 'proposal-authoring', ['props.media_mirror']],
  ['move it to the top left', 'proposal-authoring', ['props.semanticLayout']],
  ['add a title', 'proposal-authoring', ['create_text']],
  ['add text', 'proposal-authoring', ['create_text']],
  ['text animation', 'proposal-authoring', ['props.animationIn', 'props.animationOut']],
  ['lower third', 'proposal-authoring', ['create_text', 'props.positionPreset']],
  ['cut out the silence', 'proposal-authoring', ['source_range_cut']],
  ['remove the pause', 'proposal-authoring', ['source_range_cut']],
  ['delete this part', 'proposal-authoring', ['source_range_cut', 'remove_visual']],
  ['stabilize the shaky footage', 'proposal-authoring', ['use_video_stabilization']],
  ['clean up the voice', 'proposal-authoring', ['use_voice_enhancement']],
  ['remove background noise', 'proposal-authoring', ['use_voice_enhancement']],
  ['enhance audio', 'proposal-authoring', ['use_voice_enhancement']],
  ['make it vertical', 'proposal-authoring', ['set_output_format']],
  ['change to 9:16', 'proposal-authoring', ['set_output_format']],
  ['resize for tiktok', 'proposal-authoring', ['set_output_format']],
  ['sync cuts to the beat', 'spatial-rhythm', []],
  ['find clips of a dog', 'media-intake-generation', []],
  ['glow around the subject', 'proposal-authoring', ['props.subject_glow']],
  ['blur the background', 'proposal-authoring', []],
  ['pick the best take', 'assembly-auditions', []],
  ['ken burns', 'proposal-authoring', ['props.transition_keyframes', 'props.media_scale_keyframes']],
  ['picture in picture', 'proposal-authoring', ['create_visual', 'props.semanticLayout']],
  ['freeze frame', 'proposal-authoring', ['timing_controls']],
  ['hold on the last frame', 'proposal-authoring', ['timing_controls']],
  ['bring to front', 'proposal-authoring', ['set_lane_order']],
];
// Requests feature entries cannot fix. Each runs as a todo so a later fix shows up.
const EXPECTED_GAPS = {
  'blur the background': 'No single background-blur control: it is a cutout plus blur composite, so cutout-preparation ranks first and no one field is correct.',
};
const searchTop = (query, n = 3) => queryCatalog({query, limit: 20}, {permitted:new Set(), enabled:new Set(), load:()=>[]}, []).entries.slice(0, n);
const reaches = (entry, capability) => entry.id === capability || (entry.kind === 'feature' && entry.capability === capability);

test('the audit\'s 41 missed requests reach their capability and field in the top 3', () => {
  assert.equal(AUDIT_MISSES.length, 41);
  for (const [query, capability, fields] of AUDIT_MISSES) {
    if (EXPECTED_GAPS[query]) continue;
    const top = searchTop(query);
    assert.ok(top.some(entry => reaches(entry, capability)), `${query}: got ${top.map(entry => entry.id).join(', ')}`);
    if (fields.length) assert.ok(top.some(entry => fields.map(field => `feature:${field}`).includes(entry.id)), `${query}: no ${fields.join('/')} in ${top.map(entry => entry.id).join(', ')}`);
  }
});
for (const [query, reason] of Object.entries(EXPECTED_GAPS)) {
  const [, capability] = AUDIT_MISSES.find(([request]) => request === query);
  test(`expected gap: ${query}`, {todo: reason}, () => assert.ok(searchTop(query).some(entry => reaches(entry, capability))));
}

test('working-timeline and audio requests route to proposal features, not workspace or segmentation (F5)', () => {
  for (const query of ['cut out the silence', 'remove the pause', 'remove background noise', 'clean up the voice', 'enhance audio', 'fade the music', 'turn down the volume']) {
    assert.notEqual(searchTop(query, 1)[0]?.id, 'cutout-preparation', query);
    assert.equal(searchTop(query, 1)[0]?.capability ?? searchTop(query, 1)[0]?.id, 'proposal-authoring', query);
  }
  for (const query of ['trim the clip', 'add a transition', 'make it vertical', 'delete this part', 'reorder layers']) {
    const top = searchTop(query, 20).map(entry => entry.capability ?? entry.id);
    assert.equal(top[0], 'proposal-authoring', query);
    const workspace = top.indexOf('workspace-editing');
    assert.ok(workspace === -1 || workspace > top.indexOf('proposal-authoring'), query);
  }
  const silence = searchTop('cut out the silence', 1)[0];
  assert.deepEqual([silence.kind, silence.tool, silence.field_path], ['feature', 'proposal_create', 'proposal.options[].operations[].source_range_cut']);
});

test('get names registered tools, shares a repeated schema once and returns a feature\'s own field schema (F4)', () => {
  const tools = catalog('full').tools;
  const fullSession = createToolSelection({profile:'full'});
  assert.ok(JSON.stringify(queryCatalog({action:'get', id:'proposal-authoring'}, fullSession, tools)).length < 20_000);
  const nothingRegistered = {permitted:new Set(), enabled:new Set(), load:()=>[]};
  const detail = queryCatalog({action:'get', id:'proposal-authoring'}, nothingRegistered, tools);
  const create = detail.tools.find(tool => tool.name === 'proposal_create'), preflight = detail.tools.find(tool => tool.name === 'proposal_spatial_preflight');
  assert.ok(create.inputSchema.properties.proposal.properties.options, 'the first tool carries the full proposal schema');
  // Preflight publishes the proposal once by reference and names the tool whose schema validates it.
  assert.equal(preflight.inputSchema.properties.proposal.properties, undefined);
  assert.match(preflight.inputSchema.properties.proposal.description, /proposal_create/);
  assert.equal(preflight._meta?.dreamcut_validated_as, 'proposal_create');
  const proposalBytes = JSON.stringify(tools.find(tool => tool.name === 'proposal_create').inputSchema.properties.proposal).length;
  assert.ok(JSON.stringify(detail).length < 2 * proposalBytes - 20_000, 'the proposal schema appears once');
  // Loading is unchanged: newly enabled tools still arrive with full schemas.
  const editing = createToolSelection({profile:'editing', allowedFamilies:['proposal-authoring']});
  const loaded = queryCatalog({action:'load', id:'proposal-authoring'}, editing, tools);
  assert.ok(loaded.tools.length && loaded.tools.every(tool => tool.inputSchema));
  const feature = queryCatalog({action:'get', id:'feature:props.media_scale'}, editing, tools);
  assert.equal(feature.entry.field_path, 'proposal.options[].operations[].props.media_scale');
  assert.equal(feature.field_schema.type, 'number');
  assert.ok(JSON.stringify(feature).length < 4_000);
});
