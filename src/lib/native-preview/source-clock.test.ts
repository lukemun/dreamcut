import test from 'node:test';import assert from 'node:assert/strict';
import {sourceClockFromProbe,nativeClockPosition,nativeSourceDuration} from './source-clock';
test('natural duration preserves the last presented frame beyond short container metadata',()=>{
 const times=sourceClockFromProbe({format:{start_time:'5'},frames:[
  {best_effort_timestamp_time:'5',duration_time:'.1'},
  {best_effort_timestamp_time:'7.6',duration_time:'.1'},
 ]},'frames');
 assert.ok(Math.abs(nativeSourceDuration(times,2.5)-2.7)<1e-9);
 assert.equal(nativeSourceDuration(times,3),3,'declared longer duration still owns its tail');
 assert.equal(nativeSourceDuration(sourceClockFromProbe({frames:[{best_effort_timestamp_time:'0'}]},'frames'),2),2,'missing sample duration keeps declared duration');
 assert.throws(()=>times.push(3),'shared source indexes must remain immutable');
});
test('packet presentation order and container origin preserve VFR boundaries',()=>{
 const times=sourceClockFromProbe({format:{start_time:'5'},packets:[{pts_time:'5.1'},{pts_time:'5'},{pts_time:'5.04'}],streams:[{nb_frames:'3'}]},'packets');
 assert.equal(nativeClockPosition(times,.039).source_index,0);
 assert.equal(nativeClockPosition(times,.04).source_index,1);
 assert.equal(nativeClockPosition(times,.099).source_index,1);
 assert.equal(nativeClockPosition(times,.1).source_index,2);
 assert.equal(nativeClockPosition(times,0).source_index,0);
});
test('ambiguous packet clocks cannot be accepted as a source index',()=>{
 for(const probe of [{packets:[{pts_time:'N/A'}]},{packets:[{pts_time:'0',flags:'_D_'}],streams:[{nb_frames:'1'}]},{packets:[{pts_time:'0'},{pts_time:'0'}]},{packets:[{pts_time:'0'}],streams:[{nb_frames:'2'}]}])assert.throws(()=>sourceClockFromProbe(probe,'packets'));
 assert.throws(()=>sourceClockFromProbe({frames:[{best_effort_timestamp_time:'1'},{best_effort_timestamp_time:'0'}]},'frames'));
});
