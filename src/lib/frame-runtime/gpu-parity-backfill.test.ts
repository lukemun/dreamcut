import test from 'node:test';
import assert from 'node:assert/strict';
import type {CompositionElement} from '../render/composition-adapters';
import {admitGpuScene,gpuSceneCapabilityIssues} from '../gpu-preview/scene';
import {canvasKitContour,canvasKitActorPlan} from '../gpu-preview/canvaskit-actor-filter';
import {paperContourMatrix,PAPER_CONTOUR_MODEL} from '../timeline/paper-contour';
import {edgeAuraMatrices} from '../timeline/edge-aura';
import {resolveLetterFallFollowers} from '../timeline/letter-fall-followers';
import {deriveGravityDrop} from '../timeline/gravity-drop';
import {elementAnimationFrame} from '../timeline/element-animation';

const base={timeline_start:0,duration:4,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0,lane_index:0};
const still=(id:string,props:Record<string,unknown>):CompositionElement=>({...base,id,type:'still',source_url:`/api/projects/p/media/${id}.png`,lane_key:'visual_0',props});
const issues=(elements:CompositionElement[])=>gpuSceneCapabilityIssues(elements,'backfill','canvaskit').filter(issue=>issue.capability!=='source');
const aura={model:'rg-edge-distance-v1',keyframes:[{t:0,inner:.1,outer:.3,color:'#ff6600'},{t:2,inner:.4,outer:.6,color:'#0066ff'}]};
const contour={contour_model:PAPER_CONTOUR_MODEL,contour_radius_start:40,contour_radius_end:300,contour_duration:2,contour_color:'#ffd400'};

test('CanvasKit contour uses the PaperContourFilter resolvers and precedence',()=>{
 assert.equal(canvasKitContour({},1),undefined);
 assert.deepEqual(canvasKitContour(contour,1),{matrix:paperContourMatrix(contour,1)});
 // A readable aura replaces the contour, exactly as PaperContourFilter does.
 assert.deepEqual(canvasKitContour({...contour,edge_aura:aura},1),{ring:edgeAuraMatrices(aura,1)});
 assert.throws(()=>canvasKitActorPlan({contour:{matrix:[1,2,3]}}),/Invalid CanvasKit contour/);
 assert.equal(issues([still('c',contour),still('a',{edge_aura:aura})]).length,0);
 assert.deepEqual(issues([still('bad',{edge_aura:{model:'rg-edge-distance-v1',keyframes:[]}})]).map(issue=>issue.capability),['edge-aura']);
});

test('review projections admit only the modes the inspector writes',()=>{
 const video=(props:Record<string,unknown>):CompositionElement=>({...base,id:'v',type:'video_clip',source_url:'/api/projects/p/media/v.mp4',lane_key:'visual_0',
  props:{source_duration_seconds:8,preview_source_url:'/p.webm',preview_proxy_validation:{contract:'preview-proxy-v1',url:'/p.webm',ok:true,width:100,height:100},...props}});
 assert.equal(issues([video({has_alpha:true,cutout_review_mode:'matte'})]).length,0);
 assert.equal(issues([video({chroma_key_review_mode:'key'})]).length,0);
 assert.deepEqual(issues([video({cutout_review_mode:'sideways'})]).map(issue=>issue.capability),['review-mode']);
});

test('caption presets on media evaluate through the shared animation frame and are admitted',()=>{
 for(const preset of ['handwriting','word_fade','word_rise','word_pop'])
  assert.equal(issues([still('m',{animationIn:preset,animationOut:preset,animationInDuration:.4,animationOutDuration:.4})]).length,0,preset);
 // word_* entrances are neutral on a media actor; exits fade the whole actor.
 const exit=elementAnimationFrame({animationOut:'word_fade',animationOutDuration:1},105,120,1080,1920,{fps:30});
 assert.ok(exit.opacity>0&&exit.opacity<1);
 assert.equal(elementAnimationFrame({animationIn:'word_pop',animationInDuration:1},5,120,1080,1920,{fps:30}).opacity,1);
});

test('linked gravity drops are resolved by GPU admission exactly as TimelineComposition resolves them',()=>{
 const label:CompositionElement={...base,id:'label',type:'caption_text',source_url:null,lane_key:'captions_0',
  props:{text:'Dinner',letter_fall_start_seconds:.4,letter_fall_seconds:.45,letter_fall_stagger_seconds:.04,letter_fall_order:'outside_in'}};
 const dish=still('dish',{...deriveGravityDrop({},2,.45),gravity_drop_after_text_id:'label'});
 const admission=admitGpuScene([label,dish],'backfill','canvaskit');
 assert.equal(admission.supported,true,admission.supported?'':admission.reason);
 const expected=resolveLetterFallFollowers([label,dish])[1];
 const admitted=admission.supported?admission.elements.find(element=>element.id==='dish'):undefined;
 assert.deepEqual((admitted?.props?.keyframes as Record<string,unknown>).media_offset_y,(expected.props?.keyframes as Record<string,unknown>).media_offset_y);
 assert.notDeepEqual((expected.props?.keyframes as Record<string,unknown>).media_offset_y,(dish.props?.keyframes as Record<string,unknown>).media_offset_y);
});

test('inert camera-only montage controls and ticker segments do not push a caption off CanvasKit',()=>{
 const caption=(props:Record<string,unknown>):CompositionElement=>({...base,id:'t',type:'caption_text',source_url:null,lane_key:'captions_0',props:{text:'Hi',...props}});
 assert.equal(issues([caption({styleVariant:'image_fill',mediaFillUrls:['/api/projects/p/media/a.png'],mediaFillTransition:'slide',mediaFillSlideDirection:'up',mediaFillTransitionBlur:.4})]).length,0);
 assert.equal(issues([caption({ticker_motion:'crawl_left',ticker_segments:[{text:'Hi',color:'#ff0000'}]})]).length,0);
});
