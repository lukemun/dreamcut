import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createInterface } from 'node:readline';
import { createToolSelection, queryCatalog, searchScore } from './capability-catalog.mjs';
import { catalogSearchSignal } from './product-signals.mjs';
import { agentTemplate } from '../src/lib/effects/gallery.ts';
import { guideEffects } from '../src/lib/effects/guide-examples.ts';
import { recreatedGuideEffects } from '../src/lib/effects/guide.ts';
import { effectRecipeQuickRequest } from '../src/lib/effects/agent-request.ts';
import { userGuideEffects } from '../src/lib/local-store/user-effect-recipes.ts';
import { savedEffectRecipe } from '../src/lib/effects/saved-effect-recipes.ts';

const sha = 'a'.repeat(64);
function galleryFixture() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'template-catalog-'));
  fs.mkdirSync(path.join(profile, 'effect-recipes'));
  fs.writeFileSync(path.join(profile, 'effect-recipes', 'catalog.json'), JSON.stringify({ schema_version: 1, recipes: [{
    id: 'neon-swipe', title: 'Neon Swipe', description: 'A glowing swipe between shots.', skill: 'recreate-effect', status: 'candidate',
    inputs: [{ title: 'Two shots', directions: 'Supply the outgoing and incoming shots.' }], preparation: 'Find the swipe frame.', prompt: 'Build Neon Swipe between my shots.',
    limitations: ['Reference only.'],
    reference: { url: 'https://example.com/neon', credit: 'Example', file: 'neon-swipe/reference.mp4', sha256: sha, source_sha256: sha, source_start_seconds: 0, source_end_seconds: 2 },
  }] }));
  try {
    const saved = savedEffectRecipe({ id: 'style-1', revision: 3, name: 'Gentle entrance', description: '', bundles: [{ skill: 'recreate-effect', parameters: { blur: 4 } }] });
    // Every shipped card (promoted, examples without an id, recreated catalog effects) plus the creator's own.
    return [...guideEffects, ...recreatedGuideEffects(), ...userGuideEffects(profile), saved];
  } finally { fs.rmSync(profile, { recursive: true, force: true }); }
}

test('every gallery template resolves by the request the gallery copies', () => {
  const effects = galleryFixture();
  const templates = effects.map(agentTemplate);
  assert.equal(new Set(templates.map(t => t.id)).size, templates.length, 'template ids are unique');
  const selection = createToolSelection();
  for (const effect of effects) {
    const request = effectRecipeQuickRequest(effect);
    const own = agentTemplate(effect).id;
    // A title shared, ignoring case, with a catalog effect ("White paper outline") ties; both are offered.
    const sameTitle = entry => entry.name.toLowerCase() === effect.title.toLowerCase();
    for (const query of [request, effect.title]) {
      const entries = queryCatalog({ query }, selection, [], templates).entries;
      const index = entries.findIndex(entry => entry.id === own);
      assert.ok(index >= 0 && entries.slice(0, index + 1).every(sameTitle), `${query} → ${entries.slice(0, 3).map(e => e.name)}`);
      assert.equal(entries[index].brief, undefined, 'search stays compact');
    }
    const top = { id: own };
    const { entry } = queryCatalog({ action: 'get', id: top.id }, selection, [], templates);
    assert.ok(entry.brief.includes(effect.title));
    assert.equal(entry.gallery_request, request);
    // A served brief names catalog lookups, never repository files the in-editor agent cannot read.
    assert.doesNotMatch(entry.brief, /src\/lib|docs\/effects/);
  }
  const mine = templates.find(t => t.title === 'Neon Swipe');
  assert.equal(mine.owner, 'mine');
  assert.match(mine.brief, /Build Neon Swipe between my shots\.[\s\S]*Two shots: Supply the outgoing/);
  assert.equal(templates.find(t => t.title === 'Gentle entrance').owner, 'saved');
  assert.match(templates.find(t => t.title === 'Gentle entrance').brief, /personal_style_get with id style-1/);
  assert.equal(templates.find(t => t.title === 'Word Search Trace').id, 'template:FX-WORD-SEARCH-TRACE');
});

test('templates are absent without the editor and say so on get', () => {
  const selection = createToolSelection();
  assert.equal(queryCatalog({ query: 'Use the Word Search Trace template with my footage.' }, selection, [], null).entries.some(e => e.kind === 'template'), false);
  assert.throws(() => queryCatalog({ action: 'get', id: 'template:FX-WORD-SEARCH-TRACE' }, selection, [], null), error => error.toolError.code === 'TEMPLATES_UNAVAILABLE' && error.toolError.retryable === true);
  assert.throws(() => queryCatalog({ action: 'get', id: 'template:FX-WORD-SEARCH-TRACE' }, selection, [], []), error => error.toolError.code === 'UNKNOWN_CATALOG_ENTRY');
});

test('catalog search signals do not name the creator\'s own templates', () => {
  const templates = galleryFixture().map(agentTemplate);
  const selection = createToolSelection();
  const args = { action: 'search', query: 'Use my "Neon Swipe" template with my footage.' };
  const signal = catalogSearchSignal({ sessionId: 's', client: 'mcp-direct' }, args, queryCatalog(args, selection, [], templates));
  assert.deepEqual(signal.top[0], { id: 'template:private', kind: 'template' });
  assert.doesNotMatch(JSON.stringify(signal.top), /neon/i);
});

test('the server reads templates from the editor per call and keeps searching when it cannot', async t => {
  const templates = galleryFixture().map(agentTemplate);
  let available = true; const paths = [];
  const server = createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    if (/tool-events|product-signals/.test(req.url)) { res.end('{}'); return; }
    paths.push(req.url);
    if (req.url === '/api/agent/templates' && available) res.end(JSON.stringify({ templates }));
    else { res.statusCode = 503; res.end('{}'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const child = spawn(process.execPath, ['mcp/server.mjs', '--profile=editing'], { env: { ...process.env, DREAMCUT_TOOL_FAMILIES: '', TIMELINE_EDITOR_BASE_URL: `http://127.0.0.1:${server.address().port}` }, stdio: ['pipe', 'pipe', 'pipe'] });
  t.after(() => child.kill());
  const pending = new Map(); let id = 0;
  createInterface({ input: child.stdout }).on('line', line => { const msg = JSON.parse(line); if (msg.id) pending.get(msg.id)?.(msg.result); });
  const call = (name, args) => new Promise(resolve => { const key = ++id; pending.set(key, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: key, method: 'tools/call', params: { name, arguments: args } }) + '\n'); });
  const found = JSON.parse((await call('capability_catalog', { query: 'Use the Word Search Trace template with my footage.' })).content[0].text);
  assert.equal(found.entries[0].id, 'template:FX-WORD-SEARCH-TRACE');
  const got = JSON.parse((await call('capability_catalog', { action: 'get', id: 'template:FX-WORD-SEARCH-TRACE' })).content[0].text);
  assert.match(got.entry.brief, /Word Search Trace/);
  assert.equal(paths.filter(p => p === '/api/agent/templates').length, 1, 'a burst of lookups reuses one gallery read');
  assert.equal((await call('capability_catalog', { action: 'load', id: 'proposal-authoring' })).isError, undefined);
  assert.equal(paths.length, 1, 'loading a family does not read templates');
  available = false;
  await new Promise(resolve => setTimeout(resolve, 5100));
  const offline = JSON.parse((await call('capability_catalog', { query: 'reverse this clip' })).content[0].text);
  assert.ok(offline.total > 0);
  assert.match(offline.templates_warning, /editor did not answer/);
  assert.equal((await call('capability_catalog', { action: 'get', id: 'template:FX-WORD-SEARCH-TRACE' })).structuredContent.code, 'TEMPLATES_UNAVAILABLE');
});

test('an entry\'s own title outranks another entry\'s identical alias', () => {
  const named = { id: 'template:x', name: 'Silhouette Window' };
  const aliased = { id: 'proposal-authoring', name: 'Compile proposals', search_aliases: ['silhouette window'] };
  assert.ok(searchScore(named, 'Silhouette Window') > searchScore(aliased, 'Silhouette Window'));
  assert.ok(searchScore(aliased, 'Silhouette Window') > 0);
});

test('every skill a gallery template names can be read through the catalog', async () => {
  const { skillEntries } = await import('./capability-catalog.mjs');
  const skills = new Map(skillEntries().map(entry => [entry.id, entry]));
  assert.ok(skills.has('skill:motion-graphics') && skills.has('skill:open-edit-proposals'));
  for (const effect of galleryFixture()) {
    const result = queryCatalog({ action: 'get', id: agentTemplate(effect).id }, createToolSelection(), [], [agentTemplate(effect)]);
    assert.ok(skills.has(result.skill), `${effect.title} names ${result.skill}`);
  }
  const skill = queryCatalog({ action: 'get', id: 'skill:motion-graphics' }, createToolSelection(), []);
  assert.match(skill.instructions, /^---\nname: motion-graphics/);
  assert.ok(fs.existsSync(path.join(skill.folder, 'SKILL.md')));
  assert.equal(queryCatalog({ action: 'search', query: 'motion graphics skill' }, createToolSelection(), []).entries[0]?.id, 'skill:motion-graphics');
});
