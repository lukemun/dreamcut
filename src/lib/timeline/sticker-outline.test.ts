import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveStickerOutline } from './sticker-outline';
import { transitionKeyframesSchema } from './transition-effects';

test('paper outline follows its own clock through a frozen source and repeated seeks', () => {
  const tracks = transitionKeyframesSchema.parse({sticker_outline_width:[{t:0,v:0,ease:'hold'},{t:2.8,v:12,ease:'hold'},{t:3.1,v:0,ease:'hold'}]});
  const props = {sticker_outline:true,sticker_outline_width:12,keyframes:tracks};
  for (const [time, expected] of [[0,0],[2.79,0],[2.8,12],[3,12],[3.1,0],[3,12],[0,0]])
    assert.equal(resolveStickerOutline(props,time),expected);
  assert.equal(resolveStickerOutline({...props,sticker_outline:false},3),0);
  assert.equal(resolveStickerOutline({sticker_outline:true},0),8);
});
