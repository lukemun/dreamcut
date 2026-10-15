import {currentFrameRate} from '@/lib/timeline/frame-rate-scope';
import {originalMediaSampleUs,previewProxyFrameRate} from '@/lib/timeline/source-sampling';
import {spiralGroupSchema} from '../timeline/spiral-group';
import { NON_RENDERING_ELEMENT_PROPS } from "@/lib/timeline/non-rendering-props";
import {gpuCaptionSpecialMotion,GPU_CAPTION_SPECIAL_PROPS} from './caption-special-motion';
import {CANVASKIT_CAPTION_SURFACE_PROPERTIES,gpuCaptionSurfaceIssue} from './caption-surface';
import {gpuCaptionSpeechPhase} from './caption-speech-phase';
import {GPU_LETTER_FALL_PROPS,gpuLetterFallIssue,gpuLetterFallElapsed} from './caption-letter-fall';
import {readColorGradeLutProps} from '../timeline/cube-lut';
import {gridMatteMaskSchema,GRID_MATTE_RANGES} from '../timeline/grid-matte';
import {SUBJECT_WINDOW_FIELDS,SUBJECT_WINDOW_MODES,SUBJECT_WINDOW_RANGES,SUBJECT_WINDOW_RUNTIME_KEY,subjectWindowBindingIssue,subjectWindowPlanAtFrame,subjectWindowMaskSchema,type SubjectWindowPlan,type SubjectWindowSubject} from '../timeline/subject-window';
import {transitionParamsSchema} from '../timeline/contracts';
import {edgeAuraSchema} from '../timeline/edge-aura';
import {resolveLetterFallFollowers} from '../timeline/letter-fall-followers';
import {canvasKitBackdropScope} from './canvaskit-backdrop';
import {resolveBenchmarkCardData} from '../timeline/benchmark-card';
import {resolveGpuCaptionVideoSource} from './frame-dependencies';
import {gpuCaptionFillPlan} from './caption-fill';
import type {CompositionElement} from '../render/composition-adapters';
import {resolveVisualRenderPlan} from '../timeline/visual-render-plan';
import {buildCompositingLaneOrder,compareCaptionPaintOrder} from '../timeline/compositing-lanes';
import {quantizeVisualFrameSpan,COMPOSITION_FPS} from '../timeline/frame-quantization';
import {mediaPictureAtFrame} from '../timeline/media-picture-plan';
import {resolveMediaTransformAtTime,resolveMaskInsetAtTime,resolveMediaEffectAtTime,readLineMaskRotation} from '../timeline/media-transform';
import {readSurfaceTrack,sampleSurface,surfacePresentationParent,trackedQuadAtFrame,quadMatrixValues,type SurfaceTrack} from '../timeline/surface-track';
import {CHROMA_KEY_AMOUNT_FIELDS,validateChromaKeyModel,hasChromaKeyData} from '../timeline/chroma-key';
import {COLOR_GRADE_FIELDS,COLOR_GRADE_ADVANCED_FIELDS,validateColorGradeModel} from '../timeline/color-grade';
import {GRADIENT_MAP_FIELDS,GRADIENT_MAP_KEYFRAME_FIELDS,GRADIENT_MAP_NUMBER_CONFIG,GRADIENT_MAP_COLOR_FIELDS} from '../timeline/gradient-map';
import {GLITCH_FIELDS,GLITCH_KEYFRAME_FIELDS,GLITCH_CONFIG} from '../timeline/glitch';
import {animationStyle,elementAnimationFrame} from '../timeline/element-animation';
import {isAudioElementType,resolveAnimationProps,isAnimationPreset,typedCharacterCount} from '../timeline/animation-presets';
import {captionAnimationProgress,captionInverseProgress} from '../timeline/caption-animation-progress';
import {resolveCaptionProps,captionDrawnProps,DEFAULT_CAPTION_PROPS} from '../timeline/captions';
import {captionMotionLayerActive} from '../timeline/caption-plane-transform';
import {captionSafeAreaVisuals,resolveCaptionSourceAspectRatio} from '../timeline/caption-coordinate-space';
import {resolveGpuMediaSource,readGpuOutlineMask} from './source';
import type {GpuProxySource} from './browser-frame-provider';
import {gpuTransitionOverlays,gpuTransitionVisual,gpuTransitionCapabilityIssue} from './transition-scene';

const videoProps=new Set(['mask_line_rotation','transition_blur','transition_travel_percent','subject_glow','subject_glow_radius','subject_glow_state','subject_glow_enabled','sticker_outline','sticker_outline_width','sticker_outline_color','subject_flash','subject_flash_state','subject_effect_state','animationIn','animationOut','animationInDuration','animationOutDuration','semantic_layout','directional_blur_x','directional_blur_y',...CHROMA_KEY_AMOUNT_FIELDS,'chroma_key_color','chroma_key_model',...COLOR_GRADE_FIELDS,...COLOR_GRADE_ADVANCED_FIELDS,'color_grade_model','paper_fill_color','recolor_color','recolor_amount','recolor_preserve_shading','window_open_duration','window_corner_radius','window_side_margin_percent','window_vertical_margin_percent','window_center_y_percent','media_orientation','media_mirror','title','objectFit','mask_inset','mask_feather','media_scale','media_offset_x','media_offset_y','media_opacity','media_blend_mode','has_alpha','source_duration_seconds','source_start_seconds','source_end_seconds','source_interval','preview_source_url','preview_audio_source_url','preview_audio_baked_gain','archival_source_url','media_preparation_recipe','custom_cutout_receipt','derived_from_source','keyframes','media_limit_duration_seconds','leading_hold_duration_seconds','preview_proxy_validation','compound_proxy_validation','volume_envelope','overflow_hold_frame_url','overflow_hold_start_frame_url','runtime_source_has_audio','runtime_preview_source_url','runtime_preview_audio_source_url','runtime_preview_preparation']);
const textProps=new Set(['benchmark_winner','source_note','benchmarkRotationDeg','benchmarkStackLayout','runtime_media_fill_preview','mediaFillVideoUrl','mediaFillVideoPreviewUrl','mediaFillVideoPlaybackRate','mediaFillScene','mediaFillUrls','mediaFillSecondsPerImage','mediaFillCrossfadeSeconds','mediaFillScale','mediaFillPanPercent','inverseMaskMotion','inverseMaskDriftXPercent','inverseMaskDriftYPercent','inverseMaskSweepIntensity','inverseMaskSweepCycles','dropInDistanceRatio','animationIn','animationOut','animationInDuration','animationOutDuration','handwritingRevealMode','handwritingWeight','absX','absY','fontSizing','positionNudgeY','outlineWidthPx','title','text','surface_track','positionPreset','fontPreset','fontSizePx','styleVariant','maxWidth','textAlign','textColor','singleLine','graphic_text_role','surfaceOpacity']);
textProps.add('media_offset_x');textProps.add('media_offset_y');
// One-word captions: how long each word flips in and out (both engines read it from resolveCaptionProps).
textProps.add('singleWordFlipSeconds');
// Speech captions drawn without punctuation (captionDrawnProps, read by the shared CaptionSequence raster).
textProps.add('hidePunctuation');
// Caption coordinate space: both engines derive it per caption from the caption's own
// source size, else its safe-area visual's (timeline/caption-coordinate-space.ts).
// On media they also size the transition_clip_to_media_bounds viewport (CanvasKit only).
for(const key of ['source_width','source_height']){videoProps.add(key);textProps.add(key);}
// These static controls are rasterized by the shared CaptionSequence owner.
// Keep admission separate from the older WebGPU verification boundary.
const canvasKitTextProps=new Set([...textProps,...CANVASKIT_CAPTION_SURFACE_PROPERTIES,'text_mask_url','spiral_group','offsetX','offsetY','textScaleX','textScaleY','textCase','groupLayout']);
// Montage-transition controls draw only inside camera_reveal (PerspectiveTitleReveal), which
// CanvasKit implements; on every other caption style both renderers ignore them.
for(const key of ['mediaFillTransition','mediaFillSlideDirection','mediaFillChangeTimesSeconds','mediaFillFirstTransition','mediaFillTransitionBlur'])canvasKitTextProps.add(key);
// Gravity drop draws through its compiled media_offset_y keyframes. A linked drop
// (gravity_drop_after_text_id) is re-timed by resolveLetterFallFollowers, which
// admitGpuScene applies to its input exactly as TimelineComposition does.
const GRAVITY_DROP_PROPS=['gravity_drop_start_seconds','gravity_drop_seconds','gravity_drop_receipt','gravity_drop_after_text_id'];
for(const key of GRAVITY_DROP_PROPS)canvasKitTextProps.add(key);
// Ticker colour/weight runs are spans inside the shared CaptionSequence raster.
canvasKitTextProps.add('ticker_segments');
function captionOffsetChannels(value:unknown){
 if(!value||typeof value!=='object'||Object.getPrototypeOf(value)!==Object.prototype)return false;
 return Object.entries(value).every(([key,points])=>['media_offset_x','media_offset_y'].includes(key)&&Array.isArray(points)&&points.every(point=>point&&Number.isFinite(point.t)&&Number.isFinite(point.v)));
}
// CanvasKit draws speech timing, ticker/scan and letter-fall on ordinary captions. A tracked-surface
// caption (TrackedSurfaceText) draws only surfaceTextLayout in both renderers and ignores them.
const speechCaptionProps=new Set(['timingMode','wordTimings','activeWordColor','activeWordTextColor','activeWordKeepsOutline','activeWordPadXEm']);
const cameraProps=new Set([...Object.keys(DEFAULT_CAPTION_PROPS).filter(key=>key.startsWith('cameraReveal')),'textScaleX','textScaleY','offsetX','offsetY','mediaFillTransition','mediaFillSlideDirection','mediaFillChangeTimesSeconds','mediaFillFirstTransition','mediaFillTransitionBlur']);
// Stabilization is baked into the adopted picture/proxy pair by the proposal
// owner. These fields retain provenance and undo state; they are not GPU effects.
// Library placement bookkeeping ("which shelf asset is this") has no pixels; it must not
// push a clip off the GPU path.
for(const key of ['intent_key']){videoProps.add(key);textProps.add(key);canvasKitTextProps.add(key);}
for(const key of ['render_authority_source_url','render_authority_sha256','preview_proxy_sha256','source_sha256','preview_sha256','video_stabilization_original_source_url','video_stabilization_original_preview_source_url','video_stabilization_original_preview_audio_source_url','video_stabilization_original_render_authority_source_url','video_stabilization','recast'])videoProps.add(key);
const animated=new Set(['transition_blur','subject_glow','subject_glow_radius','sticker_outline_width','subject_flash','directional_blur_x','directional_blur_y',...CHROMA_KEY_AMOUNT_FIELDS,...COLOR_GRADE_FIELDS,...COLOR_GRADE_ADVANCED_FIELDS,'mask_inset','mask_feather','media_scale','media_offset_x','media_offset_y','media_opacity','playback_rate']);
const audioType=(type:string)=>type==='audio'||isAudioElementType(type);
videoProps.add('runtime_still_preview');
// Reverse is a source-clock choice resolved by mediaPictureAtFrame; its preview sound is a prepared reversed track.
for(const key of ['playback_reverse','runtime_preview_audio_reverse_source_url','runtime_preview_audio_reverse_duration'])videoProps.add(key);
export type GpuVideoLayer={kind:'video';element:CompositionElement;source:GpuProxySource;
  /** Decode time. Export samples originals where the proxy frame came from; see gpuSourceSampleUs. */
  timeUs:number;
  /** Authored source clock for derived assets keyed to it (grid matte masks). */
  sourceTimeSeconds:number;
  /** Composition-space window from another clip's moving cutout, on that clip's clock (timeline/subject-window.ts). */
  subjectWindow?:SubjectWindowPlan;
  effectTime?:number;
  /** Clock for the transition_clip_to_media_bounds viewport; defaults to effectTime (boundary holds rest at their head/tail). */
  viewportTime?:number;transition?:ReturnType<typeof gpuTransitionVisual>&{boundaryPageTurn?:import('./canvaskit-page-turn').GpuPageTurnBoundary};
  animation:ReturnType<typeof elementAnimationFrame>;transform:ReturnType<typeof resolveMediaTransformAtTime>;mask:ReturnType<typeof resolveMaskInsetAtTime>;opacity:number};
export type GpuTextLayer={kind:'text';element:CompositionElement;track:SurfaceTrack;parent:CompositionElement;
  parentSourceTime:number;planeWidth:number;planeHeight:number;
  /** Glyph raster scale: Chrome rasterizes the transformed surface at its ideal contents scale. */
  rasterScale:number;text:ReturnType<typeof resolveCaptionProps>};
export type GpuCaptionLayer={kind:'caption';
  /** Caption coordinate space (source picture aspect) shared with Standard; null is the full frame. */
  sourceAspectRatio?:number|null;viewportMaskUrl?:string;specialMotion?:ReturnType<typeof gpuCaptionSpecialMotion>;benchmark?:{progress:number;data:NonNullable<ReturnType<typeof resolveBenchmarkCardData>>};fill?:ReturnType<typeof gpuCaptionFillPlan>;rasterFrame:number;fps:number;speechPhase?:ReturnType<typeof gpuCaptionSpeechPhase>;inverseProgress?:number;blurPx?:number;opacity?:number;scale?:number;rotateZDeg?:number;translation?:{x:number;y:number};revealProgress?:readonly[number,number];wordProgress?:number;typedCharacters?:number;handwritingProgress?:number;
  /** Shared letter-fall clock (seconds since release, clamped where pixels stop changing). */
  letterFallElapsed?:number;
  /** Standard's retained glyph layer is active (captionMotionLayerActive): raster at the snapped translation. */
  motionLayer?:true;element:CompositionElement;planeWidth:number;planeHeight:number;text:ReturnType<typeof resolveCaptionProps>};
export type GpuRasterTextLayer=GpuTextLayer|GpuCaptionLayer;
export type GpuScene={frame:number;fps:number;width:number;height:number;layers:(GpuVideoLayer|GpuRasterTextLayer)[]};
export type GpuSceneAdmission={supported:true;elements:CompositionElement[]}|{supported:false;reason:string};

export type GpuDrawingEngine='webgpu'|'canvaskit';
/** Implementation inventory, not visual/performance qualification. Keeping this
 * explicit prevents a future catalog addition from silently gaining admission. */
export const CANVASKIT_IMPLEMENTED_CAPABILITIES={
 // Media write_on wipes the whole wrapper from the right (shared `wipeRight`;
 // Standard clip-path, CanvasKit group-local clip). scan_reveal_down is a caption
 // reveal with no media pose, so on media it is the identity in both renderers.
 // handwriting/word_* are caption treatments the agent schema also accepts on media;
 // the shared animationStyle makes them a neutral entrance and (word_*) a whole-actor
 // fade-out there, evaluated by the same elementAnimationFrame in both renderers.
 mediaAnimations:['none','fade','slide_up','slide_down','slide_left','slide_right','drop_in','focus_settle','pop','spring_pop','rotate_in','write_on','scan_reveal_down','handwriting','word_fade','word_rise','word_pop'],
 captionAnimations:['none','fade','handwriting','slide_up','slide_down','slide_left','slide_right','word_fade','word_rise','word_pop','write_on','scan_reveal_down','drop_in','spring_pop','pop','rotate_in','focus_settle','type_on'],
 transitions:['fade','slide','whip','wipe','cube','page_turn','film_burn','camera_flash','blackout'],
 extraMediaProperties:['iris_radius','iris_feather','zoom_blur','lut_asset_id','lut_source_url','lut_intensity','grid_matte_enabled','grid_matte_mask','grid_matte_cell_size','grid_matte_coverage','grid_matte_line_opacity','grid_matte_line_width',...SUBJECT_WINDOW_FIELDS,SUBJECT_WINDOW_RUNTIME_KEY,'media_shadow','media_shadow_blur','media_shadow_opacity','media_shadow_offset_x','media_shadow_offset_y','outline_parent_id','outline_mask','outline_source_url','outline_width','outline_color',
  // Paper contour and traveling aura: color matrices on prepared distance fields (PaperContourFilter).
  'contour_model','contour_radius_start','contour_radius_end','contour_duration','contour_color','edge_aura',
  // Inspector review projections (cutout-review.ts, chroma-key-review.ts); never persisted.
  'cutout_review_mode','chroma_key_review_mode',
  // Still sampling: 'pixelated' is nearest-neighbour in both renderers; anything else is smooth.
  'image_rendering',
  // Fixed media-bounds viewport around animation/transition motion (timeline/transition-viewport.ts).
  'transition_clip_to_media_bounds',
  // Color map and glitch run in the actor's colour stage (canvaskit-glitch.ts, CanvasKitColorShaderCache).
  ...GRADIENT_MAP_FIELDS,...GLITCH_FIELDS],
 extraAnimatedProperties:['iris_radius','iris_feather','zoom_blur','lut_intensity',...GRADIENT_MAP_KEYFRAME_FIELDS,...GLITCH_KEYFRAME_FIELDS],
} as const;
const canvasKitVideoProps=new Set<string>([...videoProps,'spiral_group',...CANVASKIT_IMPLEMENTED_CAPABILITIES.extraMediaProperties]);
// Caption surface controls are read only by Standard's caption sequence; copied onto
// a video or still they draw nothing in either renderer.
for(const key of CANVASKIT_CAPTION_SURFACE_PROPERTIES)canvasKitVideoProps.add(key);
for(const key of GRAVITY_DROP_PROPS)canvasKitVideoProps.add(key);
const canvasKitAnimated=new Set<string>([...animated,...CANVASKIT_IMPLEMENTED_CAPABILITIES.extraAnimatedProperties]);
function canvasKitTransitionIssue(transition:CompositionElement['transition_in']):string|null{
 if(!transition)return null;
 if(!(CANVASKIT_IMPLEMENTED_CAPABILITIES.transitions as readonly string[]).includes(transition.type))return `Unknown CanvasKit transition: ${transition.type}`;
 if(!Number.isFinite(transition.duration_seconds)||transition.duration_seconds<=0||!transitionParamsSchema.safeParse(transition.params??{}).success)return 'Invalid CanvasKit transition parameters.';
 return null;
}
function canvasKitPropertyIssues(e:CompositionElement):Array<[string,string]>{
 const issues:Array<[string,string]>=[],props=e.props??{},frames=props.keyframes;
 const ranges:Record<string,readonly[number,number]>={iris_radius:[0,2],iris_feather:[0,.8],zoom_blur:[0,40],lut_intensity:[0,1],...GRID_MATTE_RANGES,...SUBJECT_WINDOW_RANGES,
  ...Object.fromEntries(Object.entries(GRADIENT_MAP_NUMBER_CONFIG).map(([key,{min,max}])=>[key,[min,max] as const])),
  ...Object.fromEntries(Object.entries(GLITCH_CONFIG).map(([key,{min,max}])=>[key,[min,max] as const]))};
 for(const [key,[min,max]]of Object.entries(ranges)){
  const valid=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=min&&value<=max;
  if(props[key]!=null&&!valid(props[key]))issues.push([`property:${key}`,`Invalid ${key}.`]);
  const points=(frames as Record<string,unknown>|undefined)?.[key];
  if(points!=null&&(!Array.isArray(points)||points.some((p,i)=>!p||!Number.isFinite(p.t)||p.t<0||!valid(p.v)||i>0&&p.t<=points[i-1].t)))issues.push([`animation:${key}`,`Invalid animated ${key}.`]);
 }
 for(const key of GRADIENT_MAP_COLOR_FIELDS)if(props[key]!=null&&!(typeof props[key]==='string'&&/^#[0-9a-f]{6}$/i.test(props[key] as string)))issues.push([`property:${key}`,`Invalid ${key}.`]);
 if(props.grid_matte_enabled!=null&&typeof props.grid_matte_enabled!=='boolean')issues.push(['grid-matte','Invalid grid matte enable switch.']);
 if(e.type==='still'&&props.grid_matte_mask&&Number(props.grid_matte_cell_size)>0&&props.grid_matte_enabled!==false)issues.push(['grid-matte','Grid matte on still images has no shared renderer authority.']);
 if(props.grid_matte_mask!=null&&!gridMatteMaskSchema.safeParse(props.grid_matte_mask).success)issues.push(['grid-matte','Invalid prepared grid matte resource.']);
 if(Number(props.grid_matte_cell_size)>0&&props.grid_matte_enabled!==false&&!props.grid_matte_mask)issues.push(['grid-matte','Grid matte requires a prepared source mask.']);
 if(props.subject_window_enabled!=null&&typeof props.subject_window_enabled!=='boolean')issues.push(['subject-window','Invalid subject window switch.']);
 if(props.subject_window_mode!=null&&!(SUBJECT_WINDOW_MODES as readonly unknown[]).includes(props.subject_window_mode))issues.push(['subject-window','Unknown subject window side.']);
 if(props.subject_window_mask!=null&&!subjectWindowMaskSchema.safeParse(props.subject_window_mask).success)issues.push(['subject-window','Invalid prepared subject window mask.']);
 if((props.subject_window_parent_id!=null)!==(props.subject_window_mask!=null))issues.push(['subject-window','Subject window needs both its subject clip and a prepared subject mask.']);
 const windowSubject=props[SUBJECT_WINDOW_RUNTIME_KEY] as SubjectWindowSubject|undefined;
 if(windowSubject&&props.subject_window_mask!=null){const issue=subjectWindowBindingIssue(e,{...windowSubject},currentFrameRate());if(issue)issues.push(['subject-window',issue]);}
 // Standard draws a page turn's two pages in one overlay; a per-clip window has no shared authority there.
 if(props.subject_window_parent_id!=null&&[e.transition_in,e.transition_out].some(t=>t?.type==='page_turn'))issues.push(['subject-window','A subject window cannot be combined with a page turn transition yet.']);
 try{readColorGradeLutProps(props);}catch(error){issues.push(['lut',error instanceof Error?error.message:String(error)]);}
 // Standard draws nothing for an unreadable aura; fail closed rather than guess.
 if(props.edge_aura!=null&&!edgeAuraSchema.safeParse(props.edge_aura).success)issues.push(['edge-aura','Invalid traveling aura.']);
 if(props.cutout_review_mode!=null&&!['cutout','matte'].includes(String(props.cutout_review_mode)))issues.push(['review-mode','Unknown cutout review mode.']);
 if(props.chroma_key_review_mode!=null&&!['key','matte'].includes(String(props.chroma_key_review_mode)))issues.push(['review-mode','Unknown chroma key review mode.']);

 return issues;
}

export type GpuCapabilityIssue = {elementId:string; capability:string; reason:string};

/** Saved inspectors include inactive controls. Only exact, known neutral values
 * may bypass a missing capability; unknown fields still fail closed. */
function neutralCaptionControl(key:string,value:unknown){
  if(key==='keyframes')return typeof value==='object'&&value!==null&&!Array.isArray(value)
    && Object.getPrototypeOf(value)===Object.prototype&&Object.keys(value).length===0;
  return Object.prototype.hasOwnProperty.call(DEFAULT_CAPTION_PROPS,key)
    && JSON.stringify(value)===JSON.stringify(DEFAULT_CAPTION_PROPS[key as keyof typeof DEFAULT_CAPTION_PROPS]);
}

/** Report every missing capability so fixing one does not hide the next blocker.
 * This is renderer admission evidence, not a claim of visual conformance.
 */
export function gpuSceneCapabilityIssues(elements:CompositionElement[],mediaScope:string,engine:GpuDrawingEngine='webgpu',rendering=false):GpuCapabilityIssue[] {
  const issues:GpuCapabilityIssue[]=[];
  const seen=new Set<string>();
  for(const original of elements.filter(e=>!audioType(e.type)&&!e.picture_hidden)){
    const add=(capability:string,reason:string)=>issues.push({elementId:original.id,capability,reason});
    if(seen.has(original.id))add('identity','GPU scene has duplicate actor identities.');
    seen.add(original.id);
    let e:CompositionElement;
    try {e=original.type==='video_clip'||original.type==='still'?resolveVisualRenderPlan(original).mediaElement:original;}
    catch(error){add('evaluation',error instanceof Error?error.message:String(error));continue;}
    // Clip fade fields belong to the shared audio mixer. Visual fades are
    // animation/transition properties and still require their own admission.
    const transitionIssue=engine==='canvaskit'?(canvasKitTransitionIssue(e.transition_in)??canvasKitTransitionIssue(e.transition_out)):(gpuTransitionCapabilityIssue(e.transition_in)??gpuTransitionCapabilityIssue(e.transition_out));
    if(transitionIssue)add('transitions',transitionIssue);
    if(e.type!=='video_clip'&&e.type!=='still'&&e.type!=='caption_text'){
      add(`type:${e.type}`,e.type==='still'?'Still images are not supported by GPU preview yet.':`${e.type} is not supported by GPU preview yet.`);
      continue;
    }
    if(engine==='canvaskit'&&e.props?.spiral_group!=null&&!spiralGroupSchema.safeParse(e.props.spiral_group).success)add('spiral-group','Invalid spiral group recipe.');
    const allowed=e.type==='caption_text'?(engine==='canvaskit'?canvasKitTextProps:textProps):engine==='canvaskit'?canvasKitVideoProps:videoProps;
    for(const [key,value] of Object.entries(e.props??{}))if(value!=null&&!allowed.has(key)&&!NON_RENDERING_ELEMENT_PROPS.has(key)&&!(engine==='canvaskit'&&e.type==='caption_text'&&(speechCaptionProps.has(key)||GPU_CAPTION_SPECIAL_PROPS.has(key)||GPU_LETTER_FALL_PROPS.has(key)))&&!(e.type==='caption_text'&&e.props?.styleVariant==='camera_reveal'&&cameraProps.has(key))&&!(e.type==='caption_text'&&neutralCaptionControl(key,value))){
      if(e.type==='caption_text'&&key==='keyframes'&&captionOffsetChannels(value))continue;
      if(e.type==='caption_text'&&key==='keyframes'&&typeof value==='object'&&!Array.isArray(value)){
        const fields=Object.keys(value);
        add('property:keyframes',`Caption keyframes (${fields.join(', ')||'invalid object'}) have not passed GPU verification. Only verified caption channels can be admitted.`);
      }else add(`property:${key}`,`${key} is not supported by GPU preview yet.`);
    }
    if(e.type==='video_clip'||e.type==='still'){
      if(e.props?.sticker_outline===true&&e.props.sticker_outline_color!=null&&!/^#[0-9a-f]{6}$/i.test(String(e.props.sticker_outline_color)))add('outline-color','GPU outline color requires a six-digit hex color.');
      if(engine==='webgpu'&&readLineMaskRotation(e.props)!==0&&['directional_blur_x','directional_blur_y','transition_blur'].some(key=>Number(e.props?.[key]??0)!==0||Array.isArray((e.props?.keyframes as Record<string,unknown>|undefined)?.[key])&&((e.props!.keyframes as Record<string,unknown[]>)[key].length>0))){
        add('rotated-mask-blur','Rotated masks combined with blur have not passed repeated-seek verification.');
      }
      const animation=resolveAnimationProps(e.props);
      for(const field of ['animationIn','animationOut'])if(e.props?.[field]!=null&&!isAnimationPreset(e.props[field]))add('media-animation',`Unknown ${field} is not supported by GPU preview.`);
      for(const preset of [animation.animationIn,animation.animationOut])if(!(engine==='canvaskit'?CANVASKIT_IMPLEMENTED_CAPABILITIES.mediaAnimations as readonly string[]:['none','fade']).includes(preset))add('media-animation',engine==='canvaskit'?`${preset} has no CanvasKit media-animation implementation.`:`${preset} has not passed GPU media-animation conformance yet.`);
      const chromaIssue=validateChromaKeyModel(e.props);if(chromaIssue)add('chroma-key',chromaIssue);
      if(e.type==='still'&&hasChromaKeyData(e.props))add('chroma-key','Chroma key on still images has no shared renderer authority.');
      const gradeIssue=validateColorGradeModel(e.props);if(gradeIssue)add('color-grade',gradeIssue);
      try {resolveGpuMediaSource(e,mediaScope,rendering);}catch(error){add('source',error instanceof Error?error.message:String(error));}
      if(e.props?.media_blend_mode&&!['normal','difference','exclusion'].includes(String(e.props.media_blend_mode)))add('blend','This blend mode is not supported by GPU preview yet.');
      if(engine==='canvaskit')for(const [capability,reason]of canvasKitPropertyIssues(e))add(capability,reason);
      for(const key of Object.keys((e.props?.keyframes??{}) as object))if(!(engine==='canvaskit'?canvasKitAnimated:animated).has(key))add(`animation:${key}`,`Animated ${key} is not supported by GPU preview yet.`);

    }else if(!readSurfaceTrack(e.props?.surface_track)){
      const text=captionDrawnProps(resolveCaptionProps(e.props));
      if(e.props?.text_mask_url&&e.props?.scan_reveal_line!==true&&text.styleVariant!=='camera_reveal'&&(typeof e.props.text_mask_url!=='string'||!/\.(png|jpe?g)(?:[?#]|$)/i.test(e.props.text_mask_url)))add('caption-mask-source','GPU caption masks require a prepared PNG or JPEG image.');
      for(const field of ['animationIn','animationOut'])if(e.props?.[field]!=null&&!isAnimationPreset(e.props[field]))add('caption-animation',`Unknown ${field} is not supported by GPU preview.`);
      if(!([text.animationIn,text.animationOut].every(preset=>(engine==='canvaskit'?CANVASKIT_IMPLEMENTED_CAPABILITIES.captionAnimations as readonly string[]:['none','fade','handwriting','slide_up','slide_down','slide_left','slide_right','word_fade','word_rise','word_pop','write_on','scan_reveal_down','drop_in','spring_pop','pop','rotate_in','type_on']).includes(preset))))add('caption-animation','This caption animation is not supported by GPU preview yet.');
      if(e.props?.surface_track)add('surface-track','The text surface track is invalid.');
      const fill=gpuCaptionFillPlan(text,0,currentFrameRate(),e.timeline_start,rendering);
      if(engine==='webgpu'&&e.props?.ticker_motion==='crawl_left'&&fill?.kind==='video')add('ticker-video-fill','Ticker video-filled text requires moving fill-region evaluation.');
      if(engine==='canvaskit'){const issue=gpuCaptionSurfaceIssue(e.props??{},text,fill?.kind==='video');if(issue)add('caption-surface',issue);const fallIssue=gpuLetterFallIssue(e.props,text);if(fallIssue)add('letter-fall',fallIssue);}
      if(fill?.kind==='video')try{resolveGpuCaptionVideoSource(fill.url,elements,mediaScope,rendering);}catch(error){add('caption-fill-source',error instanceof Error?error.message:String(error));}
      if(['image_fill','camera_reveal'].includes(text.styleVariant)&&text.mediaFillUrls.some(url=>!/\.(png|jpe?g)(?:[?#]|$)/i.test(url)))add('caption-fill-source','GPU image-filled text requires prepared PNG or JPEG images.');
      if(!['none','cinematic','bold_outline','boxed','neon','inverse','image_fill','highlight_yellow','highlight_red','yellow_banner','black_card','thought_bubble','yellow_words','benchmark_card','camera_reveal'].includes(text.styleVariant))add('caption-style','This caption style is not supported by GPU preview yet.');
    }
  }
  return issues;
}

/** Validate the entire derived scene before playback, including future actors. */
export function admitGpuScene(input:CompositionElement[],mediaScope:string,engine:GpuDrawingEngine='webgpu',rendering=false):GpuSceneAdmission {
  // Linked gravity drops follow their falling label, as TimelineComposition resolves them.
  const elements=resolveLetterFallFollowers(input);
  const issues=gpuSceneCapabilityIssues(elements,mediaScope,engine,rendering);
  if(issues.length)return {supported:false,reason:issues[0].reason};
  // A hidden lane's video keeps its sound in the shared audio mixer; the GPU draws no picture for it.
  return {supported:true,elements:elements.filter(e=>!audioType(e.type)&&!e.picture_hidden).map(e=>e.type==='video_clip'||e.type==='still'?resolveVisualRenderPlan(e).mediaElement:e)};
}

/** Input must be admitted; it is the effective composition after mute/proposal derivation. */
/** Preview decodes the 30 fps proxy at the authored time. Export decodes the original,
 * so it samples where the proxy's frame came from (timeline/source-sampling.ts). */
export function gpuSourceSampleUs(sourceSeconds:number,rendering:boolean,fps: number = currentFrameRate(),proxyFps:number|null=fps){
  return rendering?originalMediaSampleUs(sourceSeconds,fps,proxyFps):Math.round(sourceSeconds*1e6);
}

/** rasterScale > 1 rasterizes vector stills at a supersampled export's pixel density;
 * all scene geometry stays in logical composition coordinates. */
export function evaluateGpuScene(elements:CompositionElement[],laneOrder:readonly string[],frame:number,width:number,height:number,mediaScope:string,fps: number = currentFrameRate(),rendering=false,rasterScale=1):GpuScene {
  const rasterFrame={width:width*rasterScale,height:height*rasterScale};
  if(!Number.isFinite(fps)||fps<=0||!Number.isSafeInteger(frame)||frame<0||!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('Invalid GPU scene dimensions or frame');
  const order=buildCompositingLaneOrder({visualLaneKeys:elements.filter(e=>e.type==='video_clip'||e.type==='still').map(e=>e.lane_key),captionLaneKeys:elements.filter(e=>e.type==='caption_text').map(e=>e.lane_key),persistedLaneOrderKeys:laneOrder});
  const active=elements.filter(e=>{const span=quantizeVisualFrameSpan(e.timeline_start,e.duration,{fps,minFrames:1});return frame>=span.startFrame&&frame<span.endFrame;})
    .sort((a,b)=>order.indexOf(a.lane_key)-order.indexOf(b.lane_key)||(a.type==='caption_text'&&b.type==='caption_text'?compareCaptionPaintOrder(a,b):a.timeline_start-b.timeline_start));
  const layers:GpuScene['layers']=[];
  let captionVisuals:CompositionElement[]|undefined;
  for(const element of active){
    if(element.type==='video_clip'||element.type==='still'){
      const at=element.type==='still'?{localFrame:frame-quantizeVisualFrameSpan(element.timeline_start,element.duration,{fps,minFrames:1}).startFrame,sourceTimeSeconds:0}:mediaPictureAtFrame(element,frame,fps)!;
      const local=at.localFrame/fps;
      const source=resolveGpuMediaSource(element,mediaScope,rendering,at.sourceTimeSeconds,rasterFrame);
      const subjectWindow=subjectWindowPlanAtFrame(element.props,frame,fps,width,height)??undefined;
      layers.push({kind:'video',element,source,timeUs:source.kind==='image'?0:gpuSourceSampleUs(at.sourceTimeSeconds,rendering,fps,previewProxyFrameRate(element.props)),sourceTimeSeconds:source.kind==='image'?0:at.sourceTimeSeconds,...(subjectWindow?{subjectWindow}:{}),
        transition:element.transition_out?gpuTransitionVisual(element,at.localFrame,quantizeVisualFrameSpan(element.timeline_start,element.duration,{fps,minFrames:1}).durationFrames,width,height,'out'):undefined,
        animation:elementAnimationFrame(element.props,at.localFrame,quantizeVisualFrameSpan(element.timeline_start,element.duration,{fps,minFrames:1}).durationFrames,width,height,{fps,suppressIn:!!element.transition_in,suppressOut:!!element.transition_out}),transform:resolveMediaTransformAtTime(element.props,local),mask:resolveMaskInsetAtTime(element.props,local),opacity:resolveMediaEffectAtTime(element.props,local).opacity});
    }else if(element.type==='caption_text'){
      const track=readSurfaceTrack(element.props?.surface_track);
      if(!track){
        const sourceAspectRatio=resolveCaptionSourceAspectRatio(element,captionVisuals??=captionSafeAreaVisuals(elements));
        const text=captionDrawnProps(resolveCaptionProps(element.props)),rasterFrame=frame-quantizeVisualFrameSpan(element.timeline_start,element.duration,{fps,minFrames:1}).startFrame;
        const progress=captionAnimationProgress(text,rasterFrame,element.duration,fps);
        const specialMotion=gpuCaptionSpecialMotion(element.props,text,rasterFrame,element.duration,fps);
        if(specialMotion?.kind==='scan'){layers.push({kind:'caption',sourceAspectRatio,element,rasterFrame,fps,planeWidth:width,planeHeight:height,text,specialMotion});continue;}
        const benchmarkData=text.styleVariant==='benchmark_card'?resolveBenchmarkCardData(text.text,element.props):null;
        const inverse=captionInverseProgress(rasterFrame,progress.durationInFrames);
        const drift=text.styleVariant==='inverse'&&text.inverseMaskMotion==='drift'?{x:(inverse.motion-.5)*text.inverseMaskDriftXPercent/100*width,y:(inverse.motion-.5)*text.inverseMaskDriftYPercent/100*height}:{x:0,y:0};
        const handwriting=text.animationIn==='handwriting'||text.animationOut==='handwriting';
        const inStyle=animationStyle(text.animationIn,progress.inProgress,'in',width,height,text.dropInDistanceRatio),outStyle=animationStyle(text.animationOut,progress.outProgress,'out',width,height,text.dropInDistanceRatio);
        const opacity=Math.min(inStyle.opacity,outStyle.opacity);
        const mediaOffset=resolveMediaTransformAtTime(element.props,rasterFrame/fps);
        if(text.styleVariant==='camera_reveal'){layers.push({kind:'caption',sourceAspectRatio,element,rasterFrame,fps,planeWidth:width,planeHeight:height,text,opacity,blurPx:(inStyle.blurPx??0)+(outStyle.blurPx??0)+(text.surfaceMode==='wall'?text.surfaceBlurPx:0)});continue;}
        layers.push({kind:'caption',sourceAspectRatio,viewportMaskUrl:typeof element.props?.text_mask_url==='string'?element.props.text_mask_url:undefined,element,rasterFrame,fps,specialMotion,speechPhase:gpuCaptionSpeechPhase(text,element.duration,rasterFrame,fps),benchmark:benchmarkData?{progress:progress.inProgress,data:benchmarkData}:undefined,fill:gpuCaptionFillPlan(text,rasterFrame,fps,element.timeline_start,rendering),inverseProgress:text.styleVariant==='inverse'&&text.inverseMaskSweepIntensity>0?inverse.timeline:undefined,blurPx:(inStyle.blurPx??0)+(outStyle.blurPx??0),opacity:specialMotion?.kind==='ticker'?1:opacity,scale:inStyle.scale*outStyle.scale,rotateZDeg:specialMotion?.kind==='ticker'?0:(inStyle.rotateZDeg??0)+(outStyle.rotateZDeg??0),revealProgress:['write_on','scan_reveal_down'].includes(text.animationIn)||text.animationOut==='write_on'?[['write_on','scan_reveal_down'].includes(text.animationIn)?progress.inProgress:1,text.animationOut==='write_on'?progress.outProgress:0]:undefined,wordProgress:['word_fade','word_rise','word_pop'].includes(text.animationIn)?progress.inProgress:undefined,typedCharacters:text.animationIn==='type_on'||text.animationOut==='type_on'?typedCharacterCount(text.text,Math.min(text.animationIn==='type_on'?progress.inProgress:1,text.animationOut==='type_on'?1-progress.outProgress:1)):undefined,translation:{x:inStyle.translateX+outStyle.translateX+drift.x+mediaOffset.offsetX*width/2,y:inStyle.translateY+outStyle.translateY+drift.y+mediaOffset.offsetY*height/2},handwritingProgress:handwriting?Math.max(0,Math.min(1,text.animationIn==='handwriting'?progress.inProgress:1,text.animationOut==='handwriting'?1-progress.outProgress:1)):undefined,letterFallElapsed:gpuLetterFallElapsed(element.props,text,rasterFrame),
          ...(specialMotion===undefined&&text.surfaceMode!=='wall'&&captionMotionLayerActive(text.animationIn,text.animationOut,inStyle.scale*outStyle.scale,(inStyle.rotateZDeg??0)+(outStyle.rotateZDeg??0))?{motionLayer:true as const}:{}),
          planeWidth:width,planeHeight:height,text});continue;
      }
      const parent=surfacePresentationParent(track,elements,frame,fps)??elements.find(e=>e.id===track.parentId);
      const at=parent&&mediaPictureAtFrame(parent,frame,fps);
      if(!parent||!at)continue;
      const reference=sampleSurface(track,track.referenceTime)??track.samples.find(s=>s.visible)?.quad;
      if(!reference)continue;
      const distance=(a:number[],b:number[])=>Math.hypot((a[0]-b[0])*track.width,(a[1]-b[1])*track.height);
      const planeWidth=Math.max(1,distance(reference[0],reference[1])),planeHeight=Math.max(1,distance(reference[0],reference[3]));
      const quad=trackedQuadAtFrame(track,parent,frame,{width,height},fps);
      layers.push({kind:'text',element,track,parent,parentSourceTime:at.sourceTimeSeconds,planeWidth,planeHeight,
        rasterScale:quad?gpuTrackedTextRasterScale(quad,planeWidth,planeHeight):1,text:resolveCaptionProps(element.props)});
    }
  }
  for(const overlay of gpuTransitionOverlays(elements,frame,width,height,fps)){
    const element=overlay.element,local=overlay.effectTime;
    const subjectWindow=subjectWindowPlanAtFrame(element.props,frame,fps,width,height)??undefined;
    layers.push({kind:'video',element,effectTime:local,viewportTime:overlay.viewportTime,transition:overlay.visual,...(subjectWindow?{subjectWindow}:{}),
      source:resolveGpuMediaSource(element,mediaScope,rendering,overlay.sourceTime,rasterFrame),timeUs:element.type==='still'||readGpuOutlineMask(element.props)?0:gpuSourceSampleUs(overlay.sourceTime,rendering,fps,previewProxyFrameRate(element.props)),sourceTimeSeconds:element.type==='still'||readGpuOutlineMask(element.props)?0:overlay.sourceTime,
      animation:elementAnimationFrame(null,0,1,width,height,{fps}),transform:resolveMediaTransformAtTime(element.props,local),mask:resolveMaskInsetAtTime(element.props,local),opacity:resolveMediaEffectAtTime(element.props,local).opacity});
  }
  // Transition overlays sit above their lane's outgoing picture, below higher
  // lanes and captions. Stable order retains all ordinary actor ordering.
  layers.sort((a,b)=>order.indexOf(a.element.lane_key)-order.indexOf(b.element.lane_key));
  return {frame,fps,width,height,layers};
}

/**
 * Standard's TrackedSurfaceText is a matrix3d layer that Chrome rasterizes at its ideal contents
 * scale (cc LayerImpl::GetIdealContentsScale): for an affine transform the larger 2D scale
 * component (column length); with perspective, the larger side of the bounding box of one layer
 * pixel at the layer origin (ComputeApproximateMaxScale), never below the default scale 1.
 * Rasterizing the GPU glyphs at that scale keeps magnified tracked text as crisp as Standard's.
 */
export function gpuTrackedTextRasterScale(quad:import('../timeline/surface-track').SurfaceQuad,planeWidth:number,planeHeight:number){
  const m=quadMatrixValues(quad,[planeWidth,planeHeight]);if(!m)return 1;
  let scale:number;
  if(Math.abs(m[3])<1e-12&&Math.abs(m[7])<1e-12)scale=Math.max(Math.hypot(m[0],m[1]),Math.hypot(m[4],m[5]))/m[15];
  else{
    const map=(x:number,y:number)=>{const w=m[3]*x+m[7]*y+m[15];return [(m[0]*x+m[4]*y+m[12])/w,(m[1]*x+m[5]*y+m[13])/w];};
    const points=[map(0,0),map(1,0),map(0,1),map(1,1)],xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
    scale=Math.max(1,Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
  }
  // Micro-rounding keeps the raster identity stable against float noise between seeks.
  return Number.isFinite(scale)?Math.round(Math.min(4,Math.max(.25,scale))*1e6)/1e6:1;
}

/** Call only after the frame packet is acquired, using the parent's decoded timestamp. */
export function gpuTextQuad(scene:GpuScene,layer:GpuTextLayer,presentedSourceTime?:number){
  return trackedQuadAtFrame(layer.track,layer.parent,scene.frame,{width:scene.width,height:scene.height},scene.fps,presentedSourceTime);
}
