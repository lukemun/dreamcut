import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filterValueLabel} from './filter-labels';
test('filter chips use plain, capitalised names', () => {
  assert.equal(filterValueLabel('ui'), 'Clicks & interface');
  assert.equal(filterValueLabel('foley'), 'Everyday sounds');
  assert.equal(filterValueLabel('in_out'), 'In & out');
  assert.equal(filterValueLabel('calm'), 'Calm');
  assert.equal(filterValueLabel('lo_fi'), 'Lo fi');
});
