import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  describeElementPatch,
  describeElementPatches,
  describeElementPresence,
  describeTimelineElementChange,
  historyActionLabel,
  historyElementName,
  historyOperationLabel,
  sanitizeHistoryLabel,
} from './history-label';

const cat = {id: 'cat', type: 'video_clip', source_url: '/media/sources/cat.mp4', props: {timeline_label: 'Cat'}, timeline_start: 0, duration: 4, trim_start: 0, trim_end: null, playback_rate: 1, volume: 1, removed_at: null};
const title = {id: 'title', type: 'caption_text', source_url: null, props: {text: 'The Long Way Home'}, timeline_start: 0, duration: 2, removed_at: null};

test('saved history uses plain descriptions instead of operation names', () => {
  assert.equal(historyOperationLabel('element_patch'), 'Adjust clip');
  assert.equal(historyOperationLabel('element_split'), 'Split clip');
  assert.equal(historyOperationLabel('transition_create'), 'Add transition');
  assert.equal(historyOperationLabel('editor_agent_something_new'), 'Apply proposal');
  assert.equal(historyOperationLabel('brand_new_op'), 'Brand new op', 'unknown operations stay readable');
});

test('each mapped field names the edit with the clip name', () => {
  const cases: Array<[Record<string, unknown>, Record<string, unknown>, string]> = [
    [{props: {media_mirror: 'none'}}, {props: {media_mirror: 'horizontal'}}, 'Flip Cat'],
    [{props: {}}, {props: {playback_reverse: true}}, 'Reverse Cat'],
    [{props: {playback_reverse: true}}, {props: {}}, 'Play forward Cat'],
    [{props: {media_orientation: 'original'}}, {props: {media_orientation: 'clockwise'}}, 'Rotate Cat'],
    [{playback_rate: 1, duration: 4}, {playback_rate: 2, duration: 2}, 'Change speed of Cat'],
    [{props: {}}, {props: {keyframes: {playback_rate: [{t: 0, v: 2}]}}}, 'Change speed of Cat'],
    [{timeline_start: 0, trim_start: 0, duration: 4}, {timeline_start: 1, trim_start: 1, duration: 3}, 'Trim Cat'],
    [{duration: 4}, {duration: 3}, 'Trim Cat'],
    [{timeline_start: 0}, {timeline_start: 2}, 'Move Cat'],
    [{lane_key: 'visual_0'}, {lane_key: 'visual_1'}, 'Move Cat'],
    [{props: {media_scale: 1}}, {props: {media_scale: 1.5}}, 'Resize Cat'],
    [{props: {media_offset_x: 0}}, {props: {media_offset_x: 0.2}}, 'Reposition Cat'],
    [{props: {media_opacity: 1}}, {props: {media_opacity: 0.5}}, 'Change opacity of Cat'],
    [{volume: 1}, {volume: 0.5}, 'Change volume of Cat'],
    [{fade_in: 0}, {fade_in: 1}, 'Change fades on Cat'],
    [{props: {media_blend_mode: 'normal'}}, {props: {media_blend_mode: 'screen'}}, 'Change blend of Cat'],
    [{props: {grade_exposure_ev: 0}}, {props: {grade_exposure_ev: 1}}, 'Change color of Cat'],
    [{props: {animationIn: 'fade'}}, {props: {animationIn: 'pop'}}, 'Change animation of Cat'],
    [{position_locked: false}, {position_locked: true}, 'Lock Cat'],
    [{props: {some_new_field: 1}}, {props: {some_new_field: 2}}, 'Adjust Cat'],
  ];
  for (const [before, after, expected] of cases) assert.equal(describeElementPatch(cat, before, after), expected, JSON.stringify(after));
});

test('text edits quote the title and fall back to a generic subject without a name', () => {
  assert.equal(describeElementPatch(title, {props: {text: 'Old'}}, {props: {text: 'The Long Way Home'}}), "Edit text 'The Long Way Home'");
  assert.equal(describeElementPresence(title, 'add'), "Add title 'The Long Way Home'");
  assert.equal(describeElementPresence(cat, 'remove'), 'Remove Cat');
  assert.equal(describeElementPatch(null, {props: {media_mirror: 'none'}}, {props: {media_mirror: 'horizontal'}}), 'Flip clip');
  assert.equal(historyElementName({type: 'video_clip', source_url: '/media/sources/Cat%20room.mp4', props: {}}), 'Cat room');
  assert.equal(historyElementName({type: 'video_clip', source_url: '/media/sources/preview.mp4', props: {}}), null, 'generic file names are not names');
});

test('batches share a verb or fall back to Adjust', () => {
  assert.equal(describeElementPatches([{element: cat, before: {timeline_start: 0}, after: {timeline_start: 1}}, {element: title, before: {timeline_start: 0}, after: {timeline_start: 1}}]), 'Move 2 clips');
  assert.equal(describeElementPatches([{element: cat, before: {timeline_start: 0}, after: {timeline_start: 1}}, {element: cat, before: {volume: 1}, after: {volume: 0}}]), 'Adjust 2 clips');
});

test('timeline diffs name adds, removes, splits and patches', () => {
  assert.equal(describeTimelineElementChange([], [title]), "Add title 'The Long Way Home'");
  assert.equal(describeTimelineElementChange([cat], [{...cat, removed_at: 'now'}]), 'Remove Cat');
  assert.equal(describeTimelineElementChange([{...cat, removed_at: 'now'}], [cat], {restoreVerb: true}), 'Restore Cat');
  assert.equal(describeTimelineElementChange([cat], [{...cat, props: {...cat.props, media_mirror: 'horizontal'}, updated_at: 'x'}]), 'Flip Cat');
  assert.equal(describeTimelineElementChange([cat], [{...cat, duration: 2}, {...cat, id: 'tail', timeline_start: 2, duration: 2}]), 'Split Cat');
  assert.equal(describeTimelineElementChange([cat], [{...cat, updated_at: 'only bookkeeping'}]), null);
});

test('undo and redo name the original step; header labels are bounded', () => {
  // An Undo replay writes the inverse; describing it in reverse names the original edit.
  const flipped = {...cat, props: {...cat.props, media_mirror: 'horizontal'}};
  assert.equal(historyActionLabel('undo', describeTimelineElementChange([cat], [flipped])!), 'Undo: Flip Cat');
  assert.equal(historyActionLabel('undo', describeTimelineElementChange([{...cat, removed_at: 'now'}], [cat])!), 'Undo: Add Cat');
  assert.equal(historyActionLabel('redo', 'Add Cat'), 'Redo: Add Cat');
  assert.equal(sanitizeHistoryLabel('  a\nb  '), 'a b');
  assert.equal(sanitizeHistoryLabel('x'.repeat(200))!.length, 120);
  assert.equal(sanitizeHistoryLabel(''), null);
});
