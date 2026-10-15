import test from 'node:test';import assert from 'node:assert/strict';
import {decoderSampleTime,decodedSampleInterval} from '../gpu-preview/sample-time';
test('fractional frame boundaries select the frame with the matching rounded timestamp',()=>{
 for(let i=0;i<300;i++){
  const actual=i/30,target=Math.round(actual*1e6),request=decoderSampleTime(target);
  assert.ok(request>=actual,`${i}: decoder request fell before the intended frame`);
  const interval=decodedSampleInterval(actual,1/30);
  assert.equal(interval.timestampUs,target);assert.ok(interval.durationUs>0);
  assert.equal(interval.timestampUs+interval.durationUs,Math.round((i+1)/30*1e6));
 }
});
test('integer frame intervals remain half-open without entering the next rounding bucket',()=>{
 for(const time of [0,1,2933333])assert.ok(decoderSampleTime(time)<(time+.5)/1e6);
 assert.deepEqual(decodedSampleInterval(0.033333333333,0.033333333333),{timestampUs:33333,durationUs:33334});
 assert.deepEqual(decodedSampleInterval(.1,.017),{timestampUs:100000,durationUs:17000});
});
