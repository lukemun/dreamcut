import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveSubjectGlow } from './subject-glow';
import { transitionKeyframesSchema } from './transition-effects';
import { editorAgentPropsSchema, editorAgentCreateVisualSchema } from '../agent/timeline-editor-agent-apply';
test('flash and glow resolve independent holds and fades at arbitrary seeks', () => {
 const props={subject_glow_radius:18,keyframes:{subject_flash:[{t:0,v:1,ease:'hold'},{t:.1,v:0}],subject_glow:[{t:0,v:2},{t:.2,v:0}]}};
 for(const t of [.2,0,.1,.05,.2]) {
  const v=resolveSubjectGlow(props,t);assert.equal(v.flash,t<.1?1:0);assert.equal(v.radius,18);assert.ok(Math.abs(v.strength-Math.max(0,2-10*t))<1e-8);
 }
 assert.deepEqual(resolveSubjectGlow({},0),{flash:0,strength:0,radius:10});
 assert.deepEqual(resolveSubjectGlow({subject_flash:Infinity,subject_glow:-1,subject_glow_radius:100},0),{flash:0,strength:0,radius:80});
});
test('safe agent contracts accept animated glow and reject out-of-range values',()=>{
 const frames={subject_glow:[{t:0,v:2},{t:.2,v:0}]};
 assert.ok(transitionKeyframesSchema.safeParse(frames).success);
 assert.ok(editorAgentPropsSchema.safeParse({subject_glow:2,subject_flash:1,transition_keyframes:frames}).success);
 assert.equal(editorAgentPropsSchema.safeParse({subject_glow:4}).success,false);
 assert.ok(editorAgentCreateVisualSchema.safeParse({type:'still',source_url:'/api/projects/example/media/subject.png',timeline_start:0,duration_seconds:1,lane_key:'visual_0',lane_index:0,subject_glow:2,subject_flash:1,subject_glow_radius:18,transition_keyframes:frames}).success);
});
