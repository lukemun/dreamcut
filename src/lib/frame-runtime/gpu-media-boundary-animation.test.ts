import test from 'node:test';
import assert from 'node:assert/strict';
import {gpuTransitionVisual} from '../gpu-preview/transition-scene';
import {gpuMediaBoundaryAnimation} from '../gpu-preview/media-boundary-animation';
const group={width:320,height:568,translateX:17,translateY:23,rotateZDeg:12,scale:.9};
const native={group,postBlur:{x:4,y:4},opacity:.8};
test('outgoing CSS wrapper preserves native translation before joint rotation and scale',()=>{
 const plan=gpuMediaBoundaryAnimation(native,{phase:'out',pose:{...group,translateX:-100,translateY:0,rotateZDeg:8,scale:1.5},cssBlurPx:6});
 assert.deepEqual(plan.group,{...group,translateX:-83,translateY:23,rotateZDeg:20,scale:1.35});
 assert.deepEqual(plan.postBlur,{x:10,y:10},'One CSS blur sums authored sigma, not Gaussian convolution hypot');
});
test('active smear override matches CSS while inactive blur retains native focus',()=>{
 const pose={...group,translateX:-30,translateY:0,rotateZDeg:0,scale:1.2};
 const active=gpuMediaBoundaryAnimation(native,{phase:'out',pose,replaceNativePose:true,replaceNativeBlur:true,postBlur:{x:50,y:2}});
 assert.equal(active.group,pose);assert.deepEqual(active.postBlur,{x:50,y:2});
 const inactive=gpuMediaBoundaryAnimation(native,{phase:'out',pose,replaceNativePose:true,replaceNativeBlur:false});
 assert.equal(inactive.group,pose);assert.deepEqual(inactive.postBlur,native.postBlur);
});
test('incoming pose stays separate and dimension mismatch cannot silently flatten geometry',()=>{
 const pose={...group,translateX:200};
 assert.throws(()=>gpuMediaBoundaryAnimation(native,{phase:'in',pose}),/neutral held-head/);
 const neutral={group:{...group,scale:1,translateX:0,translateY:0,rotateZDeg:0},postBlur:undefined,opacity:1};
 assert.equal(gpuMediaBoundaryAnimation(neutral,{phase:'in',pose}).group,pose);
 assert.throws(()=>gpuMediaBoundaryAnimation(native,{phase:'out',pose:{...pose,width:640}}),/dimensions/);
});

test('ordinary whip evaluates shared camera pose and directional SVG blur before native composition',async()=>{
 const {gpuTransitionVisual}=await import('../gpu-preview/transition-scene');
 const {resolveWhipTransitionVisualStyle}=await import('../timeline/transitions');
 const element={type:'video_clip',props:{},transition_out:{type:'whip',duration_seconds:1,params:{direction:'from-bottom',whip_blur_strength:1}}} as import('../render/composition-adapters').CompositionElement;
 const boundary=gpuTransitionVisual(element,75,90,320,568,'out');
 const visual=resolveWhipTransitionVisualStyle(.5,'out','from-bottom',1),plan=gpuMediaBoundaryAnimation(native,boundary);
 assert.equal(plan.group.translateX,17);assert.equal(plan.group.translateY,23+visual.translateYPercent*568/100);
 assert.equal(plan.group.scale,.9*visual.scale);assert.equal(plan.group.rotateZDeg,12);
 assert.deepEqual(plan.postBlur,{x:2,y:visual.blurPx*320/1080});
 assert.deepEqual(gpuMediaBoundaryAnimation(native,gpuTransitionVisual(element,60,90,320,568,'out')).postBlur,{x:4,y:4});
});

test('GPU boundary consumes the same optional whip zoom as Standard',()=>{
 const base={type:'still',props:{},transition_out:{type:'whip',duration_seconds:1,params:{direction:'from-right',whip_blur_strength:.65}}} as import('../render/composition-adapters').CompositionElement;
 const neutral=gpuTransitionVisual(base,75,90,320,568,'out');
 const zoomed=gpuTransitionVisual({...base,transition_out:{...base.transition_out!,params:{...base.transition_out!.params,whip_zoom_percent:50}}},75,90,320,568,'out');
 assert.equal(neutral.pose?.scale,1);assert.equal(zoomed.pose?.scale,1.5);
 assert.equal(neutral.pose?.translateX,zoomed.pose?.translateX);
 assert.deepEqual(neutral.postBlur,zoomed.postBlur);
});
