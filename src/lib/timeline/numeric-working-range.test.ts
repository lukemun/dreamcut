import {test} from 'node:test';
import assert from 'node:assert/strict';
import {numericWorkingRange} from './numeric-working-range';
import {resolveTransitionEffects, transitionKeyframesSchema} from './transition-effects';
import {proposalTunableField} from '../agent/proposal-controls';

test('short durations and high blur have symmetric working room without changing domain bounds', () => {
  for (const [value, min, max, step] of [[.4,0,60,.01], [190,0,1080,1], [1.2,1,2.5,.01]]) {
    const range = numericWorkingRange(value,min,max,step);
    assert.ok(Math.abs((range.min+range.max)/2-value)<1e-9);
    assert.ok(range.min>=min && range.max<=max && range.max>value && range.min<value);
  }
  assert.deepEqual(numericWorkingRange(0,0,1,.01),{min:0,max:1});
  assert.deepEqual(numericWorkingRange(1,0,1,.01),{min:0,max:1});
});

test('strong streak values agree across proposal domain, animated validation and scaled renderer', () => {
  const spec = proposalTunableField('props','directional_blur_x')!;
  assert.equal(spec.max,1080);
  const points = [{t:0,v:0},{t:1,v:380},{t:2,v:0}];
  assert.ok(transitionKeyframesSchema.safeParse({directional_blur_x:points}).success);
  const props = {directional_blur_x:380};
  assert.equal(resolveTransitionEffects(props,1,{width:1080,height:1920}).blurX,380);
  assert.equal(resolveTransitionEffects(props,1,{width:540,height:960}).blurX,190);
  assert.equal(transitionKeyframesSchema.safeParse({directional_blur_x:[{t:0,v:0},{t:1,v:1081}]}).success,false);
});

test('layout dials get wide room and keep it on the free side near a bound', () => {
  // Horizontal position drafted at the centre reaches both frame edges, not ±0.1.
  assert.deepEqual(numericWorkingRange(0, -2, 2, .01, {floorFraction: .25}), {min: -1, max: 1});
  // Vertical drafted slightly up still reaches well past the top and bottom thirds.
  const vertical = numericWorkingRange(-.1, -2, 2, .01, {floorFraction: .25});
  assert.ok(vertical.min <= -1 && vertical.max >= .9);
  // Size near its floor keeps room to grow instead of shrinking to the gap below it.
  const size = numericWorkingRange(.2, .1, 3, .01, {floorFraction: .25});
  assert.equal(size.min, .1);
  assert.ok(size.max >= .9);
});
