import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageAssets, mergeAssetPages, assetArrayKeys} from './asset-page';
const inventory = {...Object.fromEntries(assetArrayKeys.map(key => [key, []])), visuals: Array.from({length: 95}, (_, i) => ({slot_id: String(i), name: `Picture ${i}`, type: 'still'})), music_tracks: [{track_name: 'Song'}]};
test('default callers retain the full inventory', () => assert.equal(pageAssets(inventory, new URLSearchParams()), inventory));
test('bounded pages exclude unrelated categories, retain counts and finish exactly', () => {
 const first = pageAssets(inventory, new URLSearchParams('category=stills'));
 assert.equal(first.visuals.length, 40); assert.equal(first.music_tracks.length, 0); assert.equal(first.page?.counts.music, 1);
 const second = pageAssets(inventory, new URLSearchParams('category=stills&offset=40'));
 const third = pageAssets(inventory, new URLSearchParams('category=stills&offset=80'));
 assert.equal(third.visuals.length, 15); assert.equal(third.page?.nextOffset, null);
 assert.deepEqual(mergeAssetPages(mergeAssetPages(first, second), third).visuals, inventory.visuals);
});
test('search runs before slicing, including items outside the first page', () => {
 const result = pageAssets(inventory, new URLSearchParams('category=stills&q=Picture+94'));
 assert.equal(result.visuals[0].slot_id, '94'); assert.equal(result.page?.total, 1);
});
test('limits are bounded and malformed numbers do not produce unbounded output', () => {
 assert.equal(pageAssets(inventory,new URLSearchParams('category=stills&limit=NaN')).visuals.length,40);
 assert.equal(pageAssets(inventory,new URLSearchParams('category=stills&offset=-10&limit=1')).visuals.length,1);
 assert.throws(() => pageAssets(inventory,new URLSearchParams('category=wrong')));
});
test('music and sound filters apply before paging and list options from the whole category', () => {
 const audio = {...inventory, music_tracks: Array.from({length: 60}, (_, i) => ({track_name: `Track ${i}`, moods: i % 2 ? ['Calm', 'warm'] : ['tense'], energy: i < 50 ? 'low' : 'high'})),
  sfx_tracks: [{track_name: 'Whoosh', category: 'transition', editorial: {motion: 'left_to_right'}}, {track_name: 'Click', category: 'ui'}]};
 const all = pageAssets(audio, new URLSearchParams('category=music'));
 assert.deepEqual(all.page?.facets, {mood: ['calm', 'tense', 'warm'], energy: ['low', 'high']});
 const calmHigh = pageAssets(audio, new URLSearchParams('category=music&mood=calm&energy=high'));
 assert.equal(calmHigh.page?.total, 5);
 assert.ok(calmHigh.music_tracks.every(track => (track as {energy: string}).energy === 'high'));
 const sfx = pageAssets(audio, new URLSearchParams('category=sfx&motion=left_to_right'));
 assert.deepEqual(sfx.sfx_tracks.map(track => (track as {track_name: string}).track_name), ['Whoosh']);
 assert.deepEqual(sfx.page?.facets, {sfx_category: ['transition', 'ui'], motion: ['left_to_right']});
});
test('pictures and videos list the project media before the shared catalog and can show either source alone', () => {
 const mixed = {...inventory, visuals: [
  ...Array.from({length: 45}, (_, i) => ({slot_id: `c${i}`, name: `Meme ${i}`, type: 'video_clip', is_catalog: true})),
  ...Array.from({length: 3}, (_, i) => ({slot_id: `p${i}`, name: `My clip ${i}`, type: 'video_clip', is_uploaded: true})),
  {slot_id: 'still', name: 'My photo', type: 'still', is_uploaded: true},
 ]};
 const all = pageAssets(mixed, new URLSearchParams('category=videos'));
 assert.deepEqual(all.visuals.slice(0, 3).map(v => v.slot_id), ['p0', 'p1', 'p2'], 'own footage is on the first page even when the catalog is listed first');
 assert.equal(all.page?.counts.videos_project, 3); assert.equal(all.page?.counts.videos_catalog, 45);
 assert.equal(all.page?.counts.stills_project, 1, 'the other visual kind is counted too');
 const own = pageAssets(mixed, new URLSearchParams('category=videos&source=project'));
 assert.equal(own.page?.total, 3); assert.ok(own.visuals.every(v => !v.is_catalog));
 const catalog = pageAssets(mixed, new URLSearchParams('category=videos&source=catalog&q=meme+4'));
 assert.ok(catalog.visuals.length > 0 && catalog.visuals.every(v => v.is_catalog === true));
 assert.equal(pageAssets(mixed, new URLSearchParams('category=stills&source=project')).page?.total, 1);
 assert.equal(pageAssets(mixed, new URLSearchParams('category=videos&source=bogus')).page?.total, 48, 'unknown source shows everything');
});
test('the creator\'s personal library is listed as their own media, not the shared catalog', () => {
 const visuals = [
  {slot_id: 'catalog:a', name: 'Stock', type: 'still', is_catalog: true},
  {slot_id: 'catalog:b', name: 'Mine', type: 'still', is_catalog: true, is_personal: true},
  {slot_id: 'local:c', name: 'Upload', type: 'still'},
 ];
 const assets = {...Object.fromEntries(assetArrayKeys.map(key => [key, []])), visuals};
 const own = pageAssets(assets, new URLSearchParams('category=stills&source=project'));
 assert.deepEqual(own.visuals.map(asset => asset.slot_id), ['catalog:b', 'local:c']);
 const catalog = pageAssets(assets, new URLSearchParams('category=stills&source=catalog'));
 assert.deepEqual(catalog.visuals.map(asset => asset.slot_id), ['catalog:a']);
 assert.equal(own.page?.counts.stills_project, 2);
});
test('music and sounds split into the creator\'s own media and the shared catalog too', () => {
 const assets = {...Object.fromEntries(assetArrayKeys.map(key => [key, []])),
  music_tracks: [{track_id: 'catalog:a', track_name: 'Stock song', is_catalog: true}, {track_id: 'local:b', track_name: 'My song'}],
  sfx_tracks: [{track_id: 'catalog:c', track_name: 'Stock hit', is_catalog: true}, {track_id: 'catalog:d', track_name: 'My hit', is_catalog: true, is_personal: true}]};
 const music = pageAssets(assets, new URLSearchParams('category=music&source=project'));
 assert.deepEqual(music.music_tracks.map(track => track.track_id), ['local:b']);
 assert.equal(music.page?.counts.music_catalog, 1);
 const sounds = pageAssets(assets, new URLSearchParams('category=sfx'));
 assert.deepEqual(sounds.sfx_tracks.map(track => track.track_id), ['catalog:d', 'catalog:c'], 'own sounds are listed first');
 assert.equal(sounds.page?.counts.sfx_project, 1);
});
