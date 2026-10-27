import {test} from 'node:test';
import assert from 'node:assert/strict';
import {bucketLabel, bucketOf, defaultLibraryBucket, initialLibraryKind} from './library-buckets';

test('assets fall into this project, my library or the catalog', () => {
  assert.equal(bucketOf({slot_id: 'local:a.mp4'}), 'project');
  assert.equal(bucketOf({is_catalog: true, is_personal: true}), 'personal');
  assert.equal(bucketOf({is_catalog: true}), 'catalog');
});

test('the default bucket is the first with items of the kind', () => {
  assert.equal(defaultLibraryBucket({videos_project: 2, videos_personal: 5, videos_catalog: 40}, 'videos'), 'project');
  assert.equal(defaultLibraryBucket({stills_project: 0, stills_personal: 99, stills_catalog: 40}, 'stills'), 'personal');
  assert.equal(defaultLibraryBucket({music_project: 0, music_personal: 0, music_catalog: 12}, 'music'), 'catalog');
  assert.equal(defaultLibraryBucket({}, 'sfx'), 'project', 'an empty kind still opens on this project');
  assert.equal(defaultLibraryBucket(undefined, 'sfx'), 'project');
});

test('the first kind follows this project\'s own media, not the personal library', () => {
  // A video-only project whose creator has 99 personal portraits opens on Video.
  assert.equal(initialLibraryKind({stills_project: 0, stills_personal: 99, videos_project: 3}, 'stills'), 'videos');
  assert.equal(initialLibraryKind({stills_project: 2, videos_project: 3}, 'stills'), 'videos', 'video comes first when both exist');
  assert.equal(initialLibraryKind({stills_project: 2}, 'videos'), 'stills');
  assert.equal(initialLibraryKind({music_project: 1, sfx_project: 4}, 'stills'), 'music');
  assert.equal(initialLibraryKind({sfx_project: 4}, 'stills'), 'sfx');
  assert.equal(initialLibraryKind({stills_personal: 99, videos_catalog: 40}, 'stills'), 'stills', 'no project media keeps the default');
  assert.equal(initialLibraryKind({music_project: 1, stills_project: 0}, 'stills', ['videos', 'stills']), 'stills', 'a shelf without audio tabs never opens on music');
});

test('bucket labels carry their counts', () => {
  assert.equal(bucketLabel('project', 1), 'This project · 1');
  assert.equal(bucketLabel('personal', undefined), 'My library');
  assert.equal(bucketLabel('catalog', 0), 'Catalog · 0');
});
