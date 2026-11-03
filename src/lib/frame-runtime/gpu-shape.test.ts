import test from 'node:test';
import assert from 'node:assert/strict';
import type {CompositionElement} from '../render/composition-adapters';
import {evaluateGpuScene,gpuSceneCapabilityIssues} from '../gpu-preview/scene';
import {deriveProposalTimeline,editorAgentOperationSchema} from '../agent/timeline-editor-agent-apply';
import {shapeFrameAt} from '../timeline/shapes';
import type {TimelineFile} from '../local-store/store';

const ring={id:'ring',type:'shape',source_url:null,lane_key:'visual_1',lane_index:1,timeline_start:0,duration:2,trim_start:0,trim_end:0,playback_rate:1,volume:0,
 props:{title:'Ring',shape_kind:'ellipse',shape_width:.4,shape_height:.4,shape_fill:null,shape_stroke:'#1a7fff',shape_stroke_width:10,media_rotation:-90,
  keyframes:{shape_draw:[{t:0,v:0},{t:1,v:1}],media_scale:[{t:0,v:1},{t:1,v:1.5}]}}} as unknown as CompositionElement;

test('a shape with its own settings and animation is admitted by both GPU engines', () => {
 assert.deepEqual(gpuSceneCapabilityIssues([ring],'media','canvaskit'),[]);
 assert.deepEqual(gpuSceneCapabilityIssues([ring],'media','webgpu'),[]);
});

test('settings a shape does not draw are refused rather than silently ignored', () => {
 const issues=gpuSceneCapabilityIssues([{...ring,props:{...ring.props,animationIn:'pop',grade_contrast:1.4,keyframes:{iris_radius:[{t:0,v:0},{t:1,v:1}]}}} as CompositionElement],'media','canvaskit');
 for(const capability of ['media-animation','property:grade_contrast','animation:iris_radius'])assert.ok(issues.some(issue=>issue.capability===capability),capability);
 assert.ok(gpuSceneCapabilityIssues([{...ring,transition_in:{type:'fade',duration_seconds:.5}} as unknown as CompositionElement],'media','canvaskit').some(issue=>issue.capability==='transitions'));
});

test('the GPU scene carries the shape frame at the local time', () => {
 const scene=evaluateGpuScene([ring],[],15,1920,1080,'media',30);
 const layer=scene.layers.find(item=>item.kind==='shape');
 assert.ok(layer&&layer.kind==='shape');
 assert.equal(layer.shape.rotationDeg,-90);
 assert.ok(Math.abs(layer.shape.scale-1.25)<1e-9);
 assert.ok(Math.abs(layer.shape.strokeDrawn-layer.shape.perimeter/2)<1e-6);
});

test('create_shape accepts a ring and refuses keyframes for settings it does not animate', () => {
 const create={timeline_start:0,duration_seconds:1,lane_key:'visual_2',lane_index:2,shape_kind:'ellipse',shape_width:.4,shape_height:.4,shape_stroke:'#ffffff',keyframes:{shape_draw:[{t:0,v:0},{t:1,v:1}]}};
 assert.ok(editorAgentOperationSchema.safeParse({element_id:'5a7e8c21-3c1d-4f6e-9a12-0d5c8e7f1b02',create_shape:create}).success);
 assert.ok(!editorAgentOperationSchema.safeParse({element_id:'5a7e8c21-3c1d-4f6e-9a12-0d5c8e7f1b02',create_shape:{...create,keyframes:{iris_radius:[{t:0,v:0},{t:1,v:1}]}}}).success);
 assert.ok(!editorAgentOperationSchema.safeParse({element_id:'5a7e8c21-3c1d-4f6e-9a12-0d5c8e7f1b02',create_shape:{...create,lane_key:'captions_1'}}).success);
});

test('every preset and a freeform path from SVG data are admitted on both GPU engines', () => {
 const kinds=['polygon','star','line','arc','arrow'].map(kind=>({...ring,id:kind,props:{...ring.props,shape_kind:kind,shape_sides:6,shape_star_depth:.4,shape_arc_end:180}}));
 const path={...ring,id:'path',props:{...ring.props,shape_kind:'path',shape_contours:[{closed:true,points:[{x:0,y:-.5,out:[.3,0]},{x:.5,y:.5},{x:-.5,y:.5}]}]}};
 for(const engine of ['canvaskit','webgpu'] as const)assert.deepEqual(gpuSceneCapabilityIssues([...kinds,path] as CompositionElement[],'media',engine),[]);
});

test('create_shape takes SVG path data only for a path, and refuses data it cannot read', () => {
 const id='5a7e8c21-3c1d-4f6e-9a12-0d5c8e7f1b02';
 const create={timeline_start:0,duration_seconds:1,lane_key:'visual_2',lane_index:2,shape_kind:'path',shape_width:.4,shape_height:.4,shape_path_d:'M0 0 C 5 -5 10 5 15 0 Z'};
 assert.ok(editorAgentOperationSchema.safeParse({element_id:id,create_shape:create}).success);
 assert.ok(!editorAgentOperationSchema.safeParse({element_id:id,create_shape:{...create,shape_kind:'rect'}}).success);
 assert.ok(!editorAgentOperationSchema.safeParse({element_id:id,create_shape:{...create,shape_path_d:'10 10'}}).success);
 assert.ok(!editorAgentOperationSchema.safeParse({element_id:id,create_shape:{...create,shape_path_d:undefined}}).success);
 assert.ok(editorAgentOperationSchema.safeParse({element_id:id,props:{shape_kind:'star',shape_sides:7}}).success,'later proposals can patch a shape');
});

test('a freeform shape with point keyframes is admitted and morphs between them', () => {
 const square=[{closed:true,points:[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}]}];
 const wide=[{closed:true,points:[{x:-.5,y:-.25},{x:.5,y:-.25},{x:.5,y:.25},{x:-.5,y:.25}]}];
 const flat=(contours:typeof square)=>contours.flatMap(c=>c.points.flatMap(p=>[p.x,p.y,0,0,0,0]));
 const morph={...ring,id:'morph',props:{title:'Morph',shape_kind:'path',shape_width:.4,shape_height:.4,shape_fill:'#ffffff',shape_contours:square,
  keyframes:{shape_contours:[{t:0,v:flat(square)},{t:1,v:flat(wide)}]}}} as unknown as CompositionElement;
 for(const engine of ['canvaskit','webgpu'] as const)assert.deepEqual(gpuSceneCapabilityIssues([morph],'media',engine),[]);
 const layer=evaluateGpuScene([morph],[],15,1920,1080,'media',30).layers.find(item=>item.kind==='shape');
 assert.ok(layer&&layer.kind==='shape');
 // Halfway, the square's top edge sits between -0.5 and -0.25 of a 432 px box: 0.375 × 432 = 162.
 assert.match(layer.shape.contours[0]!.d,/^M -216 -162 /);
});

test('create_shape morph keys are readable SVG data alongside shape_path_d', () => {
 const id='5a7e8c21-3c1d-4f6e-9a12-0d5c8e7f1b02';
 const create={timeline_start:0,duration_seconds:2,lane_key:'visual_2',lane_index:2,shape_kind:'path',shape_width:.4,shape_height:.4,shape_path_d:'M0 0 H10 V10 H0 Z',
  keyframes:{shape_contours:[{t:0,v:'M0 0 H10 V10 H0 Z'},{t:1,v:'M5 0 L10 5 L5 10 L0 5 Z'}]}};
 assert.ok(editorAgentOperationSchema.safeParse({element_id:id,create_shape:create}).success);
 assert.ok(editorAgentOperationSchema.safeParse({element_id:id,create_shape:{...create,keyframes:{shape_contours:[{t:0,v:'M0 0 H10 V10 H0 Z'},{t:1,v:'M0 0 L10 10 L0 10 Z'}]}}}).success,'a key with fewer points is matched, not refused');
 assert.ok(!editorAgentOperationSchema.safeParse({element_id:id,create_shape:{...create,keyframes:{shape_contours:[{t:0,v:'M0 0 H10 V10 H0 Z'},{t:1,v:'10 10'}]}}}).success,'unreadable key data is refused');
 assert.ok(!editorAgentOperationSchema.safeParse({element_id:id,create_shape:{...create,shape_path_d:undefined,shape_contours:[{closed:true,points:[{x:0,y:0},{x:1,y:0},{x:1,y:1}]}]}}).success,'a morph needs shape_path_d');
 assert.ok(!editorAgentOperationSchema.safeParse({element_id:id,create_shape:{...create,shape_kind:'rect',shape_path_d:undefined}}).success,'only a path morphs');
});

test('an SVG morph is stored as points fitted in one shared box, and draws the key outlines', () => {
 const id='5a7e8c21-3c1d-4f6e-9a12-0d5c8e7f1b02';
 // A 10 px square that becomes a 20 px diamond: the shared box is 20 wide, so the square fills half of it.
 const op=editorAgentOperationSchema.parse({element_id:id,create_shape:{timeline_start:0,duration_seconds:2,lane_key:'visual_2',lane_index:2,shape_kind:'path',shape_width:1,shape_height:1,
  shape_path_d:'M5 5 H15 V15 H5 Z',keyframes:{shape_contours:[{t:0,v:'M5 5 H15 V15 H5 Z'},{t:1,v:'M10 0 L20 10 L10 20 L0 10 Z'}]}}});
 const derived=deriveProposalTimeline({elements:[],transitions:[]} as unknown as TimelineFile,[op] as never,'fixture').timeline;
 const props=derived.elements.find(element=>element.id===id)!.props as Record<string,unknown>;
 assert.deepEqual((props.shape_contours as {points:{x:number}[]}[])[0].points.map(p=>p.x),[-.25,.25,.25,-.25]);
 const keys=(props.keyframes as Record<string,{v:number[]}[]>).shape_contours;
 assert.equal(keys[1].v.length,24);
 assert.match(shapeFrameAt(props,1,1080,1080).contours[0].d,/^M 0 -540 L 540 0 /,'at 1 s the diamond touches the box edges');
});

test('a later proposal morphs an existing path shape between outlines with different point counts', () => {
 const id='5a7e8c21-3c1d-4f6e-9a12-0d5c8e7f1b02';
 const timeline={elements:[{...ring,id,project_id:'fixture',removed_at:null,props:{title:'Heart',shape_kind:'path',shape_width:.4,shape_height:.4,shape_fill:'#ff0000',
  shape_contours:[{closed:true,points:[{x:-.5,y:-.5},{x:.5,y:-.5},{x:.5,y:.5},{x:-.5,y:.5}]}]}}],transitions:[]} as unknown as TimelineFile;
 const op=editorAgentOperationSchema.parse({element_id:id,props:{shape_morph:[{t:0,v:'M0 0 H10 V10 H0 Z'},{t:1.5,v:'M5 0 L10 10 L0 10 Z',ease:'easeInOut'}]}});
 const props=deriveProposalTimeline(timeline,[op] as never,'fixture').timeline.elements[0]!.props as Record<string,unknown>;
 assert.equal(props.shape_morph,undefined,'the morph request is not stored as a prop');
 const keys=(props.keyframes as Record<string,{t:number;v:number[]}[]>).shape_contours;
 assert.deepEqual(keys.map(key=>[key.t,key.v.length]),[[0,24],[1.5,24]],'the triangle gains a point to match the square');
 assert.deepEqual(gpuSceneCapabilityIssues([{...timeline.elements[0],props} as unknown as CompositionElement],'media','canvaskit'),[]);
 assert.throws(()=>deriveProposalTimeline(timeline,[editorAgentOperationSchema.parse({element_id:id,props:{shape_kind:'rect',shape_morph:[{t:0,v:'M0 0 H1 V1 Z'},{t:1,v:'M0 0 H1 V1 Z'}]}})] as never,'fixture'),/only a path shape/);
});

test('a shape fades in and out on both GPU engines, and only fades', () => {
 const faded={...ring,props:{...ring.props,animationIn:'fade',animationInDuration:.5,animationOut:'fade',animationOutDuration:.5}} as CompositionElement;
 assert.deepEqual(gpuSceneCapabilityIssues([faded],'media','canvaskit'),[]);
 assert.deepEqual(gpuSceneCapabilityIssues([faded],'media','webgpu'),[]);
 const opacityAt=(frame:number)=>{const layer=evaluateGpuScene([faded],[],frame,1920,1080,'media',30).layers.find(item=>item.kind==='shape');assert.ok(layer&&layer.kind==='shape');return layer.shape.opacity;};
 // The ring has no opacity of its own: 0.2 s into a 0.5 s fade it is 40% there, and 0.2 s before its 2 s end, 40% again.
 assert.equal(opacityAt(0),0);
 assert.ok(Math.abs(opacityAt(6)-.4)<1e-9);
 assert.equal(opacityAt(30),1);
 assert.ok(Math.abs(opacityAt(54)-.4)<1e-9);
 const op=editorAgentOperationSchema.safeParse({element_id:'9b2f4a39-36e0-4f4d-a0c3-7c0d2d3f2a10',create_shape:{timeline_start:0,duration_seconds:2,lane_key:'visual_1',lane_index:1,shape_kind:'rect',shape_width:1.7778,shape_height:1,shape_fill:'#ffffff',animationIn:'fade',animationInDuration:.3}});
 assert.ok(op.success,op.success?'':JSON.stringify(op.error.issues));
 assert.equal(editorAgentOperationSchema.safeParse({element_id:'9b2f4a39-36e0-4f4d-a0c3-7c0d2d3f2a10',create_shape:{timeline_start:0,duration_seconds:2,lane_key:'visual_1',lane_index:1,shape_kind:'rect',shape_width:1,shape_height:1,animationIn:'pop'}}).success,false);
});
