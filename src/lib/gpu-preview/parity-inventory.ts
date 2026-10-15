import fs from 'node:fs';
import path from 'node:path';
import {z} from 'zod';
import type {CompositionElement} from '../render/composition-adapters';
import {editorAgentPropsSchema} from '../agent/timeline-editor-agent-apply';
import {DEFAULT_CAPTION_PROPS,CAPTION_STYLE_VARIANTS,CAMERA_REVEAL_EASING_CURVES} from '../timeline/captions';
import {presetsForElementType,TEXT_ONLY_ANIMATION_PRESETS} from '../timeline/animation-presets';
import {MEDIA_MOTION_PRESETS,applyMediaMotionPreset} from '../timeline/motion-presets';
import {TIMELINE_TRANSITION_TYPES,transitionParamsSchema} from '../timeline/contracts';
import {EFFECT_CONTROLS} from '../timeline/effect-controls';
import {NON_RENDERING_ELEMENT_PROPS} from '../timeline/non-rendering-props';
import {gpuPropertyFixtures} from './property-fixtures';
import {CHROMA_KEY_REVIEW_MODES,applyChromaKeyReviewMode} from '../timeline/chroma-key-review';
import {CUTOUT_REVIEW_MODES,applyCutoutReviewMode} from '../timeline/cutout-review';
import {edgeAuraSchema} from '../timeline/edge-aura';
import {PAPER_CONTOUR_MODEL} from '../timeline/paper-contour';
import {deriveGravityDrop} from '../timeline/gravity-drop';
import {LETTER_FALL_ORDERS} from '../timeline/letter-fall';
import {gpuSceneCapabilityIssues} from './scene';
import {GPU_CAPTION_SPECIAL_PROPS} from './caption-special-motion';
import {surfaceTrackSchema,type SurfaceTrack} from '../timeline/surface-track';

/**
 * Standard-drawn inventory for the Browser GPU parity ratchet
 * (docs/standards/renderer-contract.md#browser-gpu-parity-ratchet).
 *
 * Every element prop key the Standard renderer draws, and every preset-like value it
 * branches on, derived from the owning registries (caption defaults, effect controls and
 * their render cases, animation/motion/transition/style lists, the agent prop schema).
 * A source scan of the Standard renderer and the timeline resolvers it imports is a
 * backstop for raw reads no registry declares. Each item carries a fixture actor so the
 * CanvasKit admission gate can be asked directly; admission is not visual parity, which
 * stays the job of the /render-frame parity proofs.
 */
export type ParityActor='caption'|'still'|'video';
export type ParityFamily='caption-prop'|'caption-value'|'caption-style'|'caption-animation'|'media-prop'|'media-value'
 |'media-keyframe'|'media-animation'|'media-effect'|'review-mode'|'motion-preset'|'transition'|'tracked-text'|'source-scan';
export type StandardDrawnItem={
 id:string;family:ParityFamily;actor:ParityActor;owner:string;
 /** The prop key (or transition type) this obligation is about. */
 key:string;
 /** Full fixture props (activation context plus the value under test). */
 props:Record<string,unknown>;
 transition?:{type:string;params:Record<string,unknown>};
 /** Key-level obligations only count an allow-list rejection of `key`; value-level ones count every issue. */
 level:'key'|'value';
};

const PNG='/api/projects/parity/media/fill-a.png',PNG2='/api/projects/parity/media/fill-b.png';
const PROXY={source_duration_seconds:8,preview_source_url:'/api/projects/parity/media/proxy.webm',
 preview_proxy_validation:{contract:'preview-proxy-v1',url:'/api/projects/parity/media/proxy.webm',ok:true,width:160,height:160}};
const GRID_MASK={source_url:'/api/projects/parity/media/grid-mask',source_start_seconds:0,fps:30,frame_count:240,width:160,height:160,source_sha256:'0'.repeat(64)};

/** Props that only draw inside a style; the fixture enables that style so a key is tested where Standard reads it. */
function captionActivation(key:string):Record<string,unknown>{
 // Montage transitions draw only in the 3D wordmark (PerspectiveTitleReveal).
 if(key.startsWith('cameraReveal')||/^mediaFill(Transition|SlideDirection|ChangeTimesSeconds|FirstTransition)/.test(key))return {styleVariant:'camera_reveal',mediaFillUrls:[PNG,PNG2]};
 if(key.startsWith('mediaFill'))return {styleVariant:'image_fill',mediaFillUrls:[PNG,PNG2]};
 if(key.startsWith('inverseMask'))return {styleVariant:'inverse'};
 if(key.startsWith('surface')&&key!=='surfaceMode')return {surfaceMode:'wall'};
 if(key.startsWith('activeWord'))return {timingMode:'active_word',wordTimings:[{word:'Hi',start:0,end:1}]};
 if(key.startsWith('handwriting'))return {animationIn:'handwriting'};
 if(key.startsWith('benchmark'))return {styleVariant:'benchmark_card'};
 if(key==='dropInDistanceRatio')return {animationIn:'drop_in'};
 return {};
}
/**
 * A valid tracked-surface fixture (TrackedSurfaceText): every surfaceTrackSchema field, two
 * visible samples close enough to interpolate. The parity test asserts it still names every
 * schema field, so a new track field cannot land without an obligation.
 */
export const PARITY_SURFACE_TRACK:SurfaceTrack=surfaceTrackSchema.parse({version:1,id:'parity-surface',parentId:'parity-parent',sourceUrl:PNG,sourceSha256:'a'.repeat(64),
 width:320,height:320,referenceTime:0,visibleFrom:0,visibleTo:3,samples:[{t:0,quad:[[.1,.15],[.7,.1],[.75,.7],[.1,.7]],visible:true,confidence:1},{t:.1,quad:[[.12,.15],[.71,.1],[.75,.68],[.1,.7]],visible:true,confidence:.9}]});
/** Track variants Standard branches on: interpolated samples, a hidden sample, one sample. */
const SURFACE_TRACK_VARIANTS:Record<string,SurfaceTrack>={
 interpolated:PARITY_SURFACE_TRACK,
 hidden:{...PARITY_SURFACE_TRACK,samples:PARITY_SURFACE_TRACK.samples.map(sample=>({...sample,visible:false}))},
 single:{...PARITY_SURFACE_TRACK,samples:[PARITY_SURFACE_TRACK.samples[0]]},
};
const CAPTION_STYLE_CONTEXT:Record<string,Record<string,unknown>>={
 image_fill:{mediaFillUrls:[PNG,PNG2]},camera_reveal:{mediaFillUrls:[PNG,PNG2]},
};

const unwrap=(type:z.ZodType)=>{let t=type;while(t instanceof z.ZodOptional||t instanceof z.ZodNullable||t instanceof z.ZodDefault)t=t.unwrap() as z.ZodType;return t;};
const agentShape=editorAgentPropsSchema.shape as Record<string,z.ZodType>;
/** Enum options the agent can write, by prop key. */
function agentEnumOptions(key:string):readonly string[]|null{
 const type=agentShape[key];if(!type)return null;const inner=unwrap(type);
 return inner instanceof z.ZodEnum?inner.options as string[]:null;
}

/** A non-neutral sample for a caption prop, typed from its default. */
function captionSample(key:string):unknown{
 const fallback=(DEFAULT_CAPTION_PROPS as Record<string,unknown>)[key];
 const options=agentEnumOptions(key);
 if(options)return options.find(option=>option!==fallback)??options[0];
 if(key==='cameraRevealEasing')return 'linear';
 if(key==='text')return 'Parity';
 if(typeof fallback==='number')return fallback+(fallback>=1?1:0.25);
 if(typeof fallback==='boolean')return !fallback;
 if(typeof fallback==='string')return fallback.startsWith('#')?'#123456':fallback?`${fallback}-alt`:'/api/projects/parity/media/sample.png';
 if(Array.isArray(fallback))return fallback.length?[...fallback].reverse():[0.5];
 return {value:1};
}

const OWNERS={
 caption:'src/lib/timeline/captions.ts (DEFAULT_CAPTION_PROPS)',agent:'src/lib/agent/timeline-editor-agent-apply.ts (editorAgentPropsSchema)',
 effect:'src/lib/timeline/effect-controls.ts + src/lib/render/effect-render-contract.ts',animation:'src/lib/timeline/animation-presets.ts',
 motion:'src/lib/timeline/motion-presets.ts',transition:'src/lib/timeline/contracts.ts',scan:'src/lib/remotion/** source scan',
};

export function standardDrawnInventory(root=process.cwd()):StandardDrawnItem[]{
 const items:StandardDrawnItem[]=[];
 const add=(item:StandardDrawnItem)=>items.push(item);
 // Captions: every resolved caption prop, then every enumerated value.
 for(const key of Object.keys(DEFAULT_CAPTION_PROPS)){
  if(NON_RENDERING_ELEMENT_PROPS.has(key))continue;
  add({id:`caption:prop:${key}`,family:'caption-prop',actor:'caption',owner:OWNERS.caption,key,level:'key',props:{...captionActivation(key),[key]:captionSample(key)}});
  const options=key==='cameraRevealEasing'?[...Object.keys(CAMERA_REVEAL_EASING_CURVES),'slow_middle','custom']
   :key==='styleVariant'||key==='animationIn'||key==='animationOut'?null:agentEnumOptions(key);
  for(const value of options??[])add({id:`caption:value:${key}=${value}`,family:'caption-value',actor:'caption',owner:OWNERS.agent,key,level:'value',props:{...captionActivation(key),[key]:value}});
 }
 for(const style of CAPTION_STYLE_VARIANTS)add({id:`caption:style:${style}`,family:'caption-style',actor:'caption',owner:OWNERS.caption,key:'styleVariant',level:'value',props:{...CAPTION_STYLE_CONTEXT[style],styleVariant:style}});
 for(const preset of presetsForElementType('caption_text'))for(const phase of ['In','Out'] as const)
  add({id:`caption:animation:${phase.toLowerCase()}:${preset}`,family:'caption-animation',actor:'caption',owner:OWNERS.animation,key:`animation${phase}`,level:'value',props:{[`animation${phase}`]:preset,[`animation${phase}Duration`]:0.4}});
 // Media: the effect registry through the exact Standard conformance fixtures.
 const fixtures=gpuPropertyFixtures({picture:'/api/projects/parity/media/picture.png',fullCanvas:'/api/projects/parity/media/full.png',
  backdrop:'/api/projects/parity/media/backdrop.png',video:{url:PROXY.preview_source_url,durationSeconds:8},gridMask:GRID_MASK});
 for(const fixture of fixtures){
  const subject=fixture.active.elements[0];const actor=fixture.sourceType;const key=fixture.property;
  add({id:`media:prop:${key}`,family:'media-prop',actor,owner:OWNERS.effect,key,level:'value',props:structuredClone(subject.props??{})});
  const control=EFFECT_CONTROLS.find(entry=>entry.prop===key)!;
  if('values' in control)for(const value of control.values)add({id:`media:value:${key}=${value}`,family:'media-value',actor,owner:OWNERS.effect,key,level:'value',props:{...structuredClone(fixture.baseline.elements[0].props??{}),[key]:value}});
  if(control.keyframeable){
   const {[key]:active,...context}=structuredClone(subject.props??{});
   add({id:`media:keyframe:${key}`,family:'media-keyframe',actor,owner:OWNERS.effect,key,level:'value',props:{...context,keyframes:{[key]:[{t:0,v:control.identity},{t:1,v:active}]}}});
  }
 }
 // Speed steps compile to source-clock playback_rate keyframes (proposal-speed-ramp).
 add({id:'media:keyframe:playback_rate',family:'media-keyframe',actor:'video',owner:'src/lib/agent/proposal-speed-ramp.ts',key:'playback_rate',level:'value',
  props:{keyframes:{playback_rate:[{t:0,v:1,ease:'hold'},{t:1,v:2,ease:'hold'}]}}});
 // Media presets: the inspector list plus every caption preset the agent schema also accepts on media.
 // Text-only entrances (typing) are not picture animations; GPU admission refuses them on media.
 const mediaPresets=[...new Set([...presetsForElementType('still'),...(agentEnumOptions('animationIn')??[])])].filter(preset=>!TEXT_ONLY_ANIMATION_PRESETS.has(preset));
 for(const preset of mediaPresets)for(const phase of ['In','Out'] as const)
  add({id:`media:animation:${phase.toLowerCase()}:${preset}`,family:'media-animation',actor:'still',owner:OWNERS.animation,key:`animation${phase}`,level:'value',props:{[`animation${phase}`]:preset,[`animation${phase}Duration`]:0.4}});
 // Paper contour / traveling aura (PaperContourFilter), every prepared-field model.
 add({id:'media:effect:paper-contour',family:'media-effect',actor:'still',owner:'src/lib/timeline/paper-contour.ts',key:'contour_model',level:'value',
  props:{contour_model:PAPER_CONTOUR_MODEL,contour_radius_start:40,contour_radius_end:300,contour_duration:2,contour_color:'#ffd400'}});
 const auraShape=edgeAuraSchema as unknown as {shape?:Record<string,z.ZodType>;_def:{schema?:{shape:Record<string,z.ZodType>}}};
 const auraModels=auraShape.shape?.model??auraShape._def.schema?.shape.model;
 if(!(auraModels instanceof z.ZodEnum))throw Error('edgeAuraSchema.model is no longer an enum; update the parity inventory');
 for(const model of auraModels.options as string[])
  add({id:`media:effect:edge_aura=${model}`,family:'media-effect',actor:'still',owner:'src/lib/timeline/edge-aura.ts',key:'edge_aura',level:'value',
   props:{edge_aura:{model,keyframes:[{t:0,inner:.1,outer:.3,color:'#ff6600'},{t:2,inner:.4,outer:.6,edge_mix:.5,color:'#0066ff'}]}}});
 // Gravity drop (compiled keyframes) and the letter-fall linked drop resolved at draw time.
 const drop=deriveGravityDrop({},.5,.6);
 add({id:'media:effect:gravity_drop',family:'media-effect',actor:'still',owner:'src/lib/timeline/gravity-drop.ts',key:'gravity_drop_start_seconds',level:'value',props:drop});
 add({id:'media:effect:gravity_drop_after_text_id',family:'media-effect',actor:'still',owner:'src/lib/timeline/letter-fall-followers.ts',key:'gravity_drop_after_text_id',level:'value',props:{...drop,gravity_drop_after_text_id:'parity-label'}});
 for(const order of LETTER_FALL_ORDERS)add({id:`caption:value:letter_fall_order=${order}`,family:'caption-value',actor:'caption',owner:'src/lib/timeline/letter-fall.ts',key:'letter_fall_order',level:'value',
  props:{letter_fall_start_seconds:.5,letter_fall_seconds:.45,letter_fall_stagger_seconds:.04,letter_fall_order:order}});
 // Fixed media-bounds viewport around animation and transition motion (timeline/transition-viewport.ts).
 add({id:'media:effect:transition_clip_to_media_bounds',family:'media-effect',actor:'still',owner:'src/lib/timeline/transition-viewport.ts',key:'transition_clip_to_media_bounds',level:'value',
  props:{transition_clip_to_media_bounds:true,source_width:300,source_height:200,media_scale:.8,media_shadow:true,animationIn:'pop',animationInDuration:.4},transition:{type:'slide',params:{}}});
 // Inspector review projections, derived by applying each mode to a keyed alpha clip.
 const reviewed={...parityFixtureElement({actor:'video',props:{has_alpha:true,chroma_key_model:'color-key-v1',chroma_key_color:'#00ff00'}})};
 for(const mode of CUTOUT_REVIEW_MODES){const [out]=applyCutoutReviewMode([reviewed],reviewed.id,mode);
  if(out?.props?.cutout_review_mode!=null)add({id:`media:review:cutout=${mode}`,family:'review-mode',actor:'video',owner:'src/lib/timeline/cutout-review.ts',key:'cutout_review_mode',level:'value',props:structuredClone(out.props)});}
 for(const mode of CHROMA_KEY_REVIEW_MODES){const [out]=applyChromaKeyReviewMode([reviewed],reviewed.id,mode);
  if(out?.props?.chroma_key_review_mode!=null)add({id:`media:review:chroma=${mode}`,family:'review-mode',actor:'video',owner:'src/lib/timeline/chroma-key-review.ts',key:'chroma_key_review_mode',level:'value',props:structuredClone(out.props)});}
 for(const preset of MEDIA_MOTION_PRESETS)add({id:`media:motion:${preset}`,family:'motion-preset',actor:'still',owner:OWNERS.motion,key:'keyframes',level:'value',props:applyMediaMotionPreset({},preset,4)});
 // Transitions: every type, every motion family and enumerated parameter.
 const paramEnums=Object.entries(transitionParamsSchema.shape).flatMap(([field,type])=>{const inner=unwrap(type as z.ZodType);return inner instanceof z.ZodEnum?[[field,inner.options as string[]] as const]:[];});
 for(const type of TIMELINE_TRANSITION_TYPES){
  add({id:`transition:${type}`,family:'transition',actor:'still',owner:OWNERS.transition,key:type,level:'value',props:{},transition:{type,params:{}}});
  for(const [field,options] of paramEnums)for(const value of options)
   add({id:`transition:${type}:${field}=${value}`,family:'transition',actor:'still',owner:OWNERS.transition,key:type,level:'value',props:{},transition:{type,params:{[field]:value}}});
 }
 // Legacy caption branches (ticker crawl, scan reveal): shared geometry in timeline/caption-special-motion.ts.
 for(const key of GPU_CAPTION_SPECIAL_PROPS)
  add({id:`caption:value:${key}`,family:'caption-value',actor:'caption',owner:'src/lib/timeline/caption-special-motion.ts',key,level:'value',
   props:key==='ticker_motion'?{ticker_motion:'crawl_left'}:{scan_reveal_line:true,[key]:key==='scan_reveal_line'?true:key==='scan_reveal_line_height_px'?4:.5}});
 // Tracked-surface text (TrackedSurfaceText + surfaceTextLayout): every track variant, then every
 // caption obligation again with a track attached. Standard draws only the shared surface
 // layout there and ignores the rest, so CanvasKit must admit each one with no issue at all.
 for(const [variant,track] of Object.entries(SURFACE_TRACK_VARIANTS))
  add({id:`tracked:track:${variant}`,family:'tracked-text',actor:'caption',owner:'src/lib/timeline/surface-track.ts (surfaceTrackSchema)',key:'surface_track',level:'value',props:{surface_track:track}});
 for(const item of items.filter(entry=>entry.actor==='caption'&&entry.family.startsWith('caption-')))
  add({...item,id:`tracked:${item.id}`,family:'tracked-text',owner:`src/lib/remotion/TrackedSurfaceText.tsx over ${item.owner}`,level:'value',props:{...item.props,surface_track:PARITY_SURFACE_TRACK}});
 // Backstop: raw reads in Standard drawing code and the timeline resolvers it imports.
 const covered=new Set(items.map(item=>item.key));
 for(const item of items)for(const key of Object.keys(item.props))covered.add(key);
 for(const [key,files] of standardSourceReads(root)){
  if(covered.has(key)||NON_RENDERING_ELEMENT_PROPS.has(key)||SCAN_NOT_ELEMENT_PROPS[key])continue;
  for(const actor of ['caption','still','video'] as const)
   add({id:`scan:${actor}:${key}`,family:'source-scan',actor,owner:`${OWNERS.scan}: ${[...files].sort().join(', ')}`,key,level:'key',props:{[key]:scanSample(key)}});
 }
 const ids=new Set<string>();for(const item of items){if(ids.has(item.id))throw Error(`Duplicate parity obligation ${item.id}`);ids.add(item.id);}
 return items;
}

/** Identifiers the scan matches that are not element props (component props or locals). */
export const SCAN_NOT_ELEMENT_PROPS:Record<string,string>={
 element:'HandwritingText/TimelineComposition component prop, not an element prop',
 props:'PerspectiveTitleReveal component prop object, not an element prop',
 fontSize:'HandwritingText component prop (resolved from fontSizePx)',
 speedSegments:'TimelineVideoPicture component prop (resolved from keyframes.playback_rate by media-picture-plan)',
};
function scanSample(key:string):unknown{
 if(/color/i.test(key))return '#ff0000';
 if(/_mode$/.test(key))return 'matte';
 if(/^flip_|_bounds$/.test(key))return true;
 if(key==='image_rendering')return 'pixelated';
 if(key==='edge_aura')return {enabled:true};
 if(key==='ticker_segments')return [{text:'Hi',color:'#ffffff'}];
 return 1;
}

const READ_PATTERNS=[/\bprops\??\.([A-Za-z_]\w*)/g,/\bprops\??\[\s*["']([A-Za-z_]\w*)["']\s*\]/g,/\(\s*props\s*,\s*["']([A-Za-z_]\w*)["']/g];
/** Raw prop reads in src/lib/remotion/** and the src/lib/timeline modules it imports directly. */
export function standardSourceReads(root=process.cwd()){
 const files:string[]=[];
 const walk=(dir:string)=>{for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const full=path.join(dir,entry.name);
  if(entry.isDirectory())walk(full);else if(/\.tsx?$/.test(entry.name)&&!/\.test\./.test(entry.name)&&!/Fixture\.tsx$/.test(entry.name))files.push(full);}};
 walk(path.join(root,'src/lib/remotion'));
 const resolvers=new Set<string>();
 for(const file of files)for(const match of fs.readFileSync(file,'utf8').matchAll(/from ['"](?:\.\.\/timeline|@\/lib\/timeline)\/([\w-]+)['"]/g)){
  const resolved=path.join(root,'src/lib/timeline',`${match[1]}.ts`);if(fs.existsSync(resolved))resolvers.add(resolved);
 }
 const reads=new Map<string,Set<string>>();
 for(const file of [...files,...resolvers]){const source=fs.readFileSync(file,'utf8');
  for(const pattern of READ_PATTERNS)for(const match of source.matchAll(pattern)){
   if(!reads.has(match[1]))reads.set(match[1],new Set());reads.get(match[1])!.add(path.relative(root,file));
  }}
 return reads;
}

const BASE={timeline_start:0,duration:4,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0,lane_index:0};
export function parityFixtureElement(item:Pick<StandardDrawnItem,'actor'|'props'|'transition'>):CompositionElement{
 const transition=item.transition?{transition_in:{type:item.transition.type,duration_seconds:0.5,params:item.transition.params}}:{};
 if(item.actor==='caption')return {...BASE,id:'parity-subject',type:'caption_text',source_url:null,lane_key:'captions_0',props:{text:'Parity',...item.props},...transition} as CompositionElement;
 if(item.actor==='video')return {...BASE,id:'parity-subject',type:'video_clip',source_url:PROXY.preview_source_url,lane_key:'visual_0',props:{...PROXY,...item.props},...transition} as CompositionElement;
 return {...BASE,id:'parity-subject',type:'still',source_url:'/api/projects/parity/media/picture.png',lane_key:'visual_0',props:{...item.props},...transition} as CompositionElement;
}

/** CanvasKit admission issues for one obligation. Media preparation ('source') is checked elsewhere. */
export function canvasKitParityIssues(item:StandardDrawnItem):string[]{
 const issues=gpuSceneCapabilityIssues([parityFixtureElement(item)],'gpu-parity-inventory','canvaskit').filter(issue=>issue.capability!=='source');
 return (item.level==='key'?issues.filter(issue=>issue.capability===`property:${item.key}`):issues).map(issue=>`${issue.capability}: ${issue.reason}`);
}

/** Obligations CanvasKit rejects. Source-scan keys count as admitted when any actor admits them. */
export function canvasKitParityGaps(items=standardDrawnInventory()){
 const rejected=new Map<string,string[]>();
 const scanAdmitted=new Set<string>();
 for(const item of items){const issues=canvasKitParityIssues(item);
  if(item.family==='source-scan'){if(!issues.length)scanAdmitted.add(item.key);else rejected.set(`scan:${item.key}`,issues);continue;}
  if(issues.length)rejected.set(item.id,issues);
 }
 for(const key of scanAdmitted)rejected.delete(`scan:${key}`);
 return rejected;
}

/**
 * Agent operation fields that are compiled before the timeline is written and never stored
 * (timeline-editor-agent-apply strips them from directOperationProps). Their stored outputs
 * are inventory items above; the parity test fails if an agent field is neither stored,
 * non-rendering, nor listed here, or if a listed field starts being stored.
 */
export const AGENT_COMPILED_PROPS:Readonly<Record<string,string>>=Object.freeze({
 ...Object.fromEntries(['start_rate','end_rate','fast_rate','top_rate','slow_start_source_seconds','slow_end_source_seconds','profile','source_duration_seconds']
  .map(field=>[`playback_ramp_${field}`,'keyframes.playback_rate (proposal-speed-ramp)'])),
 ...Object.fromEntries(['bar_close_start_seconds','bar_close_duration_seconds','bar_reopen_start_seconds','bar_reopen_duration_seconds']
  .map(field=>[`playback_ramp_${field}`,'keyframes.mask_inset bars (proposal-speed-ramp)'])),
 playback_speed_steps:'keyframes.playback_rate hold steps',
 transition_keyframes:'keyframes.<transition channel>',
 semanticLayout:'semantic_layout + media transform (resolveSemanticVisualLayout)',
 crowdLayout:'crowd_layout + media transform',
 media_scale_keyframes:'keyframes.media_scale',media_offset_y_keyframes:'keyframes.media_offset_y',mask_inset_keyframes:'keyframes.mask_inset',
 ...Object.fromEntries(['close_start_seconds','close_duration_seconds','reopen_start_seconds','reopen_duration_seconds','top_percent','bottom_percent','foreground_id']
  .map(field=>[`mask_window_${field}`,'keyframes.mask_inset (proposal-mask-window)'])),
});
