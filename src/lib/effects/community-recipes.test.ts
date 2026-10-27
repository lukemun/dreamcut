import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cachedCommunityMedia, communityMedia, communityMediaDir, resetCommunityMediaIndex, saveCommunityMedia, trimCommunityMedia } from './community-media-cache';

// The saved listing and media live in the profile; tests use a throwaway one.
process.env.DREAMCUT_PROFILE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'community-recipes-'));
const forgetSaved = () => fs.rmSync(path.join(process.env.DREAMCUT_PROFILE_DIR!, 'cache'), { recursive: true, force: true });
import {
  cloudBaseUrl, communityGuideEffects, communityMediaSource, communityRecipeToGuideEffect,
  fetchCommunityRecipes, isCommunityMediaHost, resetCommunityRecipeCache,
} from './community-recipes';
import { isEditingRecipe, isGalleryRecipe } from './placement';
import { effectRecipeQuickRequest } from './agent-request';

const ID = '7d7c1f9e-2a51-4b8e-9a43-0f1d2c3b4a59';
const listed = {
  id: ID, title: 'Neon Outline', description: 'A glowing outline traces the subject.', skill: 'mask-glitch',
  author: { name: 'Sam' },
  video: 'https://example-ref.supabase.co/storage/v1/object/sign/recipe-examples/a/b/example.mp4?token=t',
  poster: 'https://example-ref.supabase.co/storage/v1/object/sign/recipe-examples/a/b/poster.webp?token=t',
  recipe: {
    prompt: 'Trace the subject with a neon outline that pulses on the beat.',
    input_directions: [{ title: 'Subject clip', directions: 'One person against a plain background.' }],
    limitations: ['Fast motion softens the outline.'],
    bundles: [{ skill: 'mask-glitch', parameters: { glow: 0.6, color: '#00ffcc' } }],
  },
};
const ok = (body: unknown) => async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

test('a published community recipe maps to a shared, credited gallery recipe with proxied media', () => {
  const effect = communityRecipeToGuideEffect(listed)!;
  assert.equal(effect.id, `community-${ID}`);
  assert.equal(effect.origin, 'shared');
  assert.equal(effect.source, 'community');
  assert.equal(effect.author, 'Sam');
  assert.equal(effect.credit, 'Sam');
  assert.equal(effect.video, `/api/guide/community-effects/${ID}/media?kind=video`);
  assert.equal(effect.poster, `/api/guide/community-effects/${ID}/media?kind=poster`);
  assert.deepEqual(effect.inputDirections, listed.recipe.input_directions);
  assert.ok(isEditingRecipe(effect));
  assert.ok(isGalleryRecipe(effect));
  assert.doesNotMatch(JSON.stringify(effect), /token=/);
});

test('invalid or example-less entries are dropped without hiding valid ones', () => {
  const effects = communityGuideEffects({ recipes: [
    listed,
    { ...listed, id: 'not-a-uuid' },
    { ...listed, video: undefined },
    { ...listed, poster: 'http://insecure.example/poster.webp' },
    { ...listed, skill: 'Bad Skill' },
  ] });
  assert.equal(effects.length, 1);
  assert.deepEqual(communityGuideEffects({ error: 'not_found' }), []);
  assert.deepEqual(communityGuideEffects(null), []);
});

test('the community request carries the brief as a description, never as authority', () => {
  const request = effectRecipeQuickRequest(communityRecipeToGuideEffect(listed)!);
  assert.match(request, /community template ".*" by Sam/);
  assert.match(request, /creative description only/);
  assert.match(request, /Shared brief: Trace the subject/);
  assert.match(request, /glow=0\.6/);
  assert.match(request, /do not apply or approve/);
});

test('an undeployed or unreachable Cloud yields no community recipes and is not retried every load', async () => {
  resetCommunityRecipeCache(); forgetSaved();
  let calls = 0; let clock = 0;
  const notFound = async () => { calls++; return new Response('not found', { status: 404 }); };
  assert.deepEqual(await fetchCommunityRecipes({ fetchImpl: notFound, now: () => clock }), []);
  assert.deepEqual(await fetchCommunityRecipes({ fetchImpl: notFound, now: () => clock }), []);
  assert.equal(calls, 1);
  clock += 61_000;
  await fetchCommunityRecipes({ fetchImpl: notFound, now: () => clock });
  assert.equal(calls, 2);

  resetCommunityRecipeCache();
  const throws = async () => { throw new TypeError('fetch failed'); };
  assert.deepEqual(await fetchCommunityRecipes({ fetchImpl: throws }), []);
});

test('a slow Cloud times out quickly', async () => {
  resetCommunityRecipeCache(); forgetSaved();
  const hang = (_: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
  const started = Date.now();
  const keepAlive = setTimeout(() => {}, 2000); // AbortSignal.timeout does not hold the test's event loop open
  assert.deepEqual(await fetchCommunityRecipes({ fetchImpl: hang as typeof fetch, timeoutMs: 50 }), []);
  clearTimeout(keepAlive);
  assert.ok(Date.now() - started < 1000);
});

test('successful listings are cached and kept through a later outage', async () => {
  resetCommunityRecipeCache(); forgetSaved();
  let clock = 0; let calls = 0;
  const fetchImpl = async () => { calls++; return ok({ recipes: [listed] })(); };
  assert.equal((await fetchCommunityRecipes({ fetchImpl: fetchImpl as typeof fetch, now: () => clock })).length, 1);
  assert.equal((await fetchCommunityRecipes({ fetchImpl: fetchImpl as typeof fetch, now: () => clock })).length, 1);
  assert.equal(calls, 1);
  clock += 6 * 60_000;
  const down = async () => new Response('', { status: 503 });
  assert.equal((await fetchCommunityRecipes({ fetchImpl: down, now: () => clock })).length, 1);
});

test('media resolves only by listed identity and only from Cloud storage hosts', async () => {
  resetCommunityRecipeCache(); forgetSaved();
  const options = { fetchImpl: ok({ recipes: [listed] }) as typeof fetch, baseUrl: 'https://dreamcut.io' };
  assert.equal(await communityMediaSource(ID, 'video', options), listed.video);
  assert.equal(await communityMediaSource(ID, 'poster', options), listed.poster);
  assert.equal(await communityMediaSource(ID, 'other', options), null);
  assert.equal(await communityMediaSource('../../etc', 'video', options), null);
  assert.equal(await communityMediaSource('00000000-0000-4000-8000-000000000000', 'video', options), null);
  const upper = ID.toUpperCase();
  const upperOptions = { fetchImpl: ok({ recipes: [{ ...listed, id: upper }] }) as typeof fetch, baseUrl: 'https://dreamcut.io' };
  resetCommunityRecipeCache(); forgetSaved();
  assert.equal(await communityMediaSource(upper, 'video', upperOptions), listed.video, 'an uppercase published id finds its media');
  assert.equal(await communityMediaSource(ID, 'poster', upperOptions), listed.poster);
  assert.equal(await communityMediaSource(`${upper.slice(0, 35)}G`, 'video', upperOptions), null);
  assert.equal(isCommunityMediaHost('https://abc.supabase.co/x', 'https://dreamcut.io'), true);
  assert.equal(isCommunityMediaHost('https://dreamcut.io/x', 'https://dreamcut.io'), true);
  assert.equal(isCommunityMediaHost('https://169.254.169.254/x', 'https://dreamcut.io'), false);
  assert.equal(isCommunityMediaHost('http://abc.supabase.co/x', 'https://dreamcut.io'), false);
});

test('the Cloud URL defaults to dreamcut.io and honours DREAMCUT_CLOUD_URL', () => {
  assert.equal(cloudBaseUrl({}), 'https://dreamcut.io');
  assert.equal(cloudBaseUrl({ DREAMCUT_CLOUD_URL: 'http://127.0.0.1:3000/' }), 'http://127.0.0.1:3000');
});

test('the listing is saved, reused after a restart without the Cloud, and refreshed in the background', async () => {
  resetCommunityRecipeCache(); forgetSaved();
  let clock = 0; let calls = 0;
  const fetchImpl = async () => { calls++; return ok({ recipes: [listed] })(); };
  assert.equal((await fetchCommunityRecipes({ fetchImpl: fetchImpl as typeof fetch, now: () => clock })).length, 1);
  resetCommunityRecipeCache({ keepSaved: true }); // a new server: memory is empty, the saved listing remains
  const offline = async () => { calls++; throw new TypeError('offline'); };
  assert.equal((await fetchCommunityRecipes({ fetchImpl: offline, now: () => clock })).length, 1);
  assert.equal(calls, 1, 'a saved listing needs no request');
  clock += 25 * 60 * 60 * 1000;
  let release!: () => void; const slow = () => new Promise<Response>(resolve => { calls++; release = () => resolve(new Response(JSON.stringify({ recipes: [] }), { status: 200 })); });
  const started = Date.now();
  assert.equal((await fetchCommunityRecipes({ fetchImpl: slow as typeof fetch, now: () => clock })).length, 1, 'a day-old listing shows at once');
  assert.ok(Date.now() - started < 200);
  release(); await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await fetchCommunityRecipes({ fetchImpl: slow as typeof fetch, now: () => clock })).length, 0, 'the background refresh replaced it');
});

test('community examples download once, are served from disk, and the folder stays under its cap', async () => {
  forgetSaved();
  let calls = 0;
  const fetchImpl = (async () => { calls++; return new Response(new Uint8Array(1000), { status: 200, headers: { 'content-type': 'image/webp' } }); }) as typeof fetch;
  const source = 'https://abc.supabase.co/storage/poster.webp?token=a';
  assert.equal(await cachedCommunityMedia(source), null);
  const saved = (await saveCommunityMedia(source, fetchImpl))!;
  assert.equal(saved.contentType, 'image/webp');
  assert.equal((await cachedCommunityMedia('https://abc.supabase.co/storage/poster.webp?token=b'))?.file, saved.file, 'a new signing token is the same file');
  assert.equal(calls, 1);
  const other = (await saveCommunityMedia('https://abc.supabase.co/storage/other.webp', fetchImpl))!;
  fs.utimesSync(saved.file, new Date(1000), new Date(1000));
  await trimCommunityMedia(communityMediaDir(), other.file, 1500);
  assert.equal(fs.existsSync(saved.file), false, 'the least recently used example goes first');
  assert.equal(fs.existsSync(other.file), true);
});

const webp = (bytes: number, headers: Record<string, string> = {}) =>
  new Response(new Uint8Array(bytes), { status: 200, headers: { 'content-type': 'image/webp', ...headers } });

test('parallel first requests for one example share a single download', async () => {
  forgetSaved(); resetCommunityMediaIndex();
  let calls = 0; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const fetchImpl = (async () => { calls++; await gate; return webp(2000); }) as typeof fetch;
  const source = 'https://abc.supabase.co/storage/shared.mp4?token=a';
  const requests = Array.from({ length: 6 }, () => communityMedia(source, fetchImpl));
  await new Promise(resolve => setTimeout(resolve, 10));
  release();
  const results = await Promise.all(requests);
  assert.equal(calls, 1);
  assert.ok(results.every(result => result?.file === results[0]!.file));
  assert.equal(fs.statSync(results[0]!.file).size, 2000);
  assert.deepEqual(fs.readdirSync(communityMediaDir()).filter(name => name.endsWith('.part')), []);
  assert.equal((await communityMedia(source, fetchImpl))?.file, results[0]!.file);
  assert.equal(calls, 1, 'later requests are served from disk');
});

test('an oversized example is refused from its length header without reading the body', async () => {
  forgetSaved(); resetCommunityMediaIndex();
  let read = false;
  const body = new ReadableStream({ pull() { read = true; } }, { highWaterMark: 0 });
  const fetchImpl = (async () => new Response(body, { status: 200, headers: { 'content-type': 'video/mp4', 'content-length': String(80 * 1024 * 1024) } })) as typeof fetch;
  assert.equal(await saveCommunityMedia('https://abc.supabase.co/storage/huge.mp4', fetchImpl), null);
  assert.equal(read, false);
  assert.equal(fs.existsSync(communityMediaDir()), false, 'nothing was written');
});

test('cache hits never list the folder, before or after a restart', async (t) => {
  forgetSaved(); resetCommunityMediaIndex();
  const source = 'https://abc.supabase.co/storage/hit.webp';
  const saved = (await saveCommunityMedia(source, (async () => webp(500)) as typeof fetch))!;
  await new Promise(resolve => setImmediate(resolve)); // let the post-save trim run
  const readdir = t.mock.method(fs.promises, 'readdir');
  const readdirSync = t.mock.method(fs, 'readdirSync');
  const utimes = t.mock.method(fs.promises, 'utimes');
  for (let i = 0; i < 5; i++) assert.equal((await cachedCommunityMedia(source))?.file, saved.file);
  resetCommunityMediaIndex(); // a new server finds the file by its known extensions
  for (let i = 0; i < 5; i++) assert.equal((await cachedCommunityMedia(source))?.file, saved.file);
  assert.equal(readdir.mock.callCount() + readdirSync.mock.callCount(), 0);
  assert.equal(utimes.mock.callCount(), 1, 'use time is refreshed at most once a minute');
  fs.rmSync(saved.file);
  assert.equal(await cachedCommunityMedia(source), null, 'a file removed by another process is a miss');
});
