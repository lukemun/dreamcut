import test from 'node:test';
import assert from 'node:assert/strict';
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
  resetCommunityRecipeCache();
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
  resetCommunityRecipeCache();
  const hang = (_: unknown, init?: RequestInit) => new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)));
  const started = Date.now();
  const keepAlive = setTimeout(() => {}, 2000); // AbortSignal.timeout does not hold the test's event loop open
  assert.deepEqual(await fetchCommunityRecipes({ fetchImpl: hang as typeof fetch, timeoutMs: 50 }), []);
  clearTimeout(keepAlive);
  assert.ok(Date.now() - started < 1000);
});

test('successful listings are cached and kept through a later outage', async () => {
  resetCommunityRecipeCache();
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
  resetCommunityRecipeCache();
  const options = { fetchImpl: ok({ recipes: [listed] }) as typeof fetch, baseUrl: 'https://dreamcut.io' };
  assert.equal(await communityMediaSource(ID, 'video', options), listed.video);
  assert.equal(await communityMediaSource(ID, 'poster', options), listed.poster);
  assert.equal(await communityMediaSource(ID, 'other', options), null);
  assert.equal(await communityMediaSource('../../etc', 'video', options), null);
  assert.equal(await communityMediaSource('00000000-0000-4000-8000-000000000000', 'video', options), null);
  assert.equal(isCommunityMediaHost('https://abc.supabase.co/x', 'https://dreamcut.io'), true);
  assert.equal(isCommunityMediaHost('https://dreamcut.io/x', 'https://dreamcut.io'), true);
  assert.equal(isCommunityMediaHost('https://169.254.169.254/x', 'https://dreamcut.io'), false);
  assert.equal(isCommunityMediaHost('http://abc.supabase.co/x', 'https://dreamcut.io'), false);
});

test('the Cloud URL defaults to dreamcut.io and honours DREAMCUT_CLOUD_URL', () => {
  assert.equal(cloudBaseUrl({}), 'https://dreamcut.io');
  assert.equal(cloudBaseUrl({ DREAMCUT_CLOUD_URL: 'http://127.0.0.1:3000/' }), 'http://127.0.0.1:3000');
});
