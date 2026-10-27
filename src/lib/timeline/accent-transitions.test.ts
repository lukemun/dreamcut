import assert from 'node:assert/strict';
import test from 'node:test';
import {accentTransitionFrame, ACCENT_TRANSITIONS} from './accent-transitions';
import {availableTransitionFields} from './transition-controls';
import {timelineTransitionCreateSchema} from './contracts';

test('accent joins cover the picture switch and return to an unchanged endpoint',()=>{
 for(const type of ACCENT_TRANSITIONS){
  assert.equal(accentTransitionFrame(type,0).incomingOpacity,0);
  assert.equal(accentTransitionFrame(type,.5).incomingOpacity,1);
  assert.equal(accentTransitionFrame(type,.5).washOpacity,1);
  assert.equal(accentTransitionFrame(type,0).washOpacity,0);
  assert.equal(accentTransitionFrame(type,1).washOpacity,0);
  assert.equal(accentTransitionFrame(type,.5,{accent_strength:0}).washOpacity,0);
  assert.ok(accentTransitionFrame(type,.25,{accent_hold:.5}).washOpacity>accentTransitionFrame(type,.25).washOpacity);
  assert.deepEqual([.75,0,.5,1,.25].map(p=>accentTransitionFrame(type,p).washOpacity),[.5,0,1,0,.5]);
 }
});
test('new types and parameters validate, stay bounded and are offered only for accent joins',()=>{
 for(const type of ACCENT_TRANSITIONS){
  const value={from_element_id:'11111111-1111-4111-8111-111111111111',to_element_id:'22222222-2222-4222-8222-222222222222',type,duration_seconds:.5,params:{accent_strength:.8,accent_hold:.2}};
  assert.equal(timelineTransitionCreateSchema.parse(value).type,type);
  assert.ok(availableTransitionFields(value).some(c=>c.field==='params.accent_strength'));
  assert.throws(()=>timelineTransitionCreateSchema.parse({...value,params:{accent_hold:1}}));
 }
 assert.ok(!availableTransitionFields({type:'fade'}).some(c=>c.field==='params.accent_strength'));
});
