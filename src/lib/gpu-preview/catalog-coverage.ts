import catalog from '../../../docs/effects/catalog.json';
import {EFFECT_CONTROLS} from '../timeline/effect-controls';
import {EFFECT_RENDER_CASES} from '../render/effect-render-contract';
import {ANIMATION_PRESETS} from '../timeline/animation-presets';
import {MEDIA_MOTION_PRESETS} from '../timeline/motion-presets';
import {TIMELINE_TRANSITION_TYPES} from '../timeline/contracts';
import {TRANSITION_CONTROLS,availableTransitionFields} from '../timeline/transition-controls';
import {CAPTION_STYLE_VARIANTS} from '../timeline/captions';
import {promotedRecipes} from '../effects/promoted-recipes';
import {guideEffects} from '../effects/guide-examples';

export type GpuCatalogCase = {
 id:string;
 family:'property'|'animation'|'motion'|'transition'|'caption-style'|'recipe';
 owner:string;
 /** Fixture data, not a timeline mutation. Registry values are copied per call. */
 input:Record<string,unknown>;
};
export type LocalRecipeIdentity={id:string; version?:number};

/** Exhaustive registry obligations, independent of a renderer's supported subset.
 * This is not a capability allowlist. Cases without measurements remain gaps.
 * The caller supplies local recipe identities without embedding private paths.
 */
export function gpuCatalogCases(localRecipes:readonly LocalRecipeIdentity[]=[]):GpuCatalogCase[]{
 const cases:GpuCatalogCase[]=[];
 const add=(value:GpuCatalogCase)=>cases.push(value);
 for(const control of EFFECT_CONTROLS){
  const fixture=EFFECT_RENDER_CASES[control.prop];
  add({id:`property:${control.prop}`,family:'property',owner:'src/lib/timeline/effect-controls.ts',input:{
   property:control.prop,identity:control.identity,active:fixture.value,context:'context' in fixture?fixture.context:{},
   media:'media' in fixture?fixture.media:'still',fullCanvas:'fullCanvas' in fixture?fixture.fullCanvas:false,
   keyframeable:control.keyframeable,minimumChangedPixels:fixture.minimumChangedPixels,
   ...('min' in control?{minimum:control.min,maximum:control.max}:{}),
   ...('values' in control?{values:control.values}:{}),
  }});
 }
 for(const actor of ['media','caption'] as const)for(const preset of ANIMATION_PRESETS)
  for(const phase of ['in','out'] as const)add({id:`animation:${actor}:${phase}:${preset}`,family:'animation',
   owner:'src/lib/timeline/animation-presets.ts',input:{actor,preset,phase}});
 for(const preset of MEDIA_MOTION_PRESETS)add({id:`motion:${preset}`,family:'motion',owner:'src/lib/timeline/motion-presets.ts',input:{preset}});
 for(const style of CAPTION_STYLE_VARIANTS)add({id:`caption-style:${style}`,family:'caption-style',owner:'src/lib/timeline/captions.ts',input:{style}});
 for(const type of TIMELINE_TRANSITION_TYPES){
  const motions=type==='slide'||type==='whip'?['travel','in-place','smear']:[undefined];
  for(const motion of motions){
   const input={type,params:motion?{motion}:{}};
   add({id:`transition:${type}${motion?`:${motion}`:''}`,family:'transition',owner:'src/lib/timeline/contracts.ts',input:{...input,
    controls:availableTransitionFields(input).map(control=>({field:control.field,minimum:control.min,maximum:control.max,default:control.default})),
   }});
  }
 }
 for(const entry of catalog.entries)add({id:`recipe:${entry.catalog_id}`,family:'recipe',owner:'docs/effects/catalog.json',input:{recipeId:entry.catalog_id,maturity:entry.recipe.status}});
 const known=new Set(catalog.entries.map(entry=>entry.catalog_id));
 for(const recipe of [...promotedRecipes,...guideEffects]){
  const id=recipe.id??`skill:${recipe.skill}`;
  if(known.has(id))continue;known.add(id);
  add({id:`recipe:${id}`,family:'recipe',owner:promotedRecipes.includes(recipe)?'src/lib/effects/promoted-recipes.ts':'src/lib/effects/guide-examples.ts',input:{recipeId:id}});
 }
 for(const recipe of localRecipes){
  if(!recipe.id.trim())throw Error('Local recipe identity must be nonempty');
  add({id:`recipe:local:${recipe.id}`,family:'recipe',owner:'local-user-recipe',input:{recipeId:recipe.id,version:recipe.version}});
 }
 const ids=new Set<string>();for(const item of cases){if(ids.has(item.id))throw Error(`Duplicate GPU catalog case: ${item.id}`);ids.add(item.id);}
 return structuredClone(cases);
}

export const GPU_CATALOG_PROOF_CHECKS=['visibleEffect','identityReset','sourceClock','repeatSeek','motion','encoded','playback','cleanup'] as const;
export type GpuCatalogProofCheck=typeof GPU_CATALOG_PROOF_CHECKS[number];
export type GpuCatalogEvidence={
 caseId:string;engine:string;inputFingerprint:string;receipt:string;
 checks:Partial<Record<GpuCatalogProofCheck,boolean>>;
};
export type GpuCatalogAssessment={caseId:string;unsupportedReason?:string;notApplicableReason?:string};

/** Separate implementation admission from recorded qualification. No evidence,
 * rejected packets, failed checks and stale fingerprints cannot count as passes.
 * Nonapplicability is explicit and counted separately, never as a passed effect.
 * Receipt contents must be verified by the caller before supplying evidence.
 */
export function assessGpuCatalogCoverage({cases=gpuCatalogCases(),engine,inputFingerprint,evidence=[],assessments=[]}:{
 cases?:readonly GpuCatalogCase[];engine:string;inputFingerprint:string;
 evidence?:readonly GpuCatalogEvidence[];assessments?:readonly GpuCatalogAssessment[];
}){
 if(!engine.trim()||!inputFingerprint.trim())throw Error('Engine and input fingerprint are required');
 const ids=new Set(cases.map(item=>item.id));if(ids.size!==cases.length)throw Error('Duplicate catalog obligations');
 const assessmentMap=new Map<string,GpuCatalogAssessment>();
 for(const assessment of assessments){
  if(!ids.has(assessment.caseId)||assessmentMap.has(assessment.caseId))throw Error(`Unknown or duplicate assessment: ${assessment.caseId}`);
  if(assessment.unsupportedReason&&assessment.notApplicableReason)throw Error('Unsupported is not nonapplicable');
  assessmentMap.set(assessment.caseId,assessment);
 }
 const receiptMap=new Map<string,GpuCatalogEvidence>();
 for(const record of evidence){
  if(record.engine!==engine)continue;
  if(!ids.has(record.caseId)||receiptMap.has(record.caseId))throw Error(`Unknown or duplicate evidence: ${record.caseId}`);
  receiptMap.set(record.caseId,record);
 }
 const rows=cases.map(item=>{
  const assessment=assessmentMap.get(item.id),record=receiptMap.get(item.id);
  if(assessment?.unsupportedReason)return {...item,status:'gap' as const,reason:assessment.unsupportedReason};
  if(assessment?.notApplicableReason)return {...item,status:'not-applicable' as const,reason:assessment.notApplicableReason};
  if(!record)return {...item,status:'gap' as const,reason:'Missing qualification evidence'};
  if(record.inputFingerprint!==inputFingerprint)return {...item,status:'gap' as const,reason:'Stale input fingerprint'};
  if(!record.receipt.trim())return {...item,status:'gap' as const,reason:'Missing evidence receipt'};
  const missing=GPU_CATALOG_PROOF_CHECKS.filter(check=>record.checks[check]!==true);
  if(missing.length)return {...item,status:'gap' as const,reason:`Incomplete or failed checks: ${missing.join(', ')}`};
  return {...item,status:'passed' as const,receipt:record.receipt};
 });
 return {engine,rows,total:rows.length,passed:rows.filter(row=>row.status==='passed').length,
  gaps:rows.filter(row=>row.status==='gap').length,notApplicable:rows.filter(row=>row.status==='not-applicable').length};
}

// The registry is imported intentionally: coverage must retain every numerical
// transition control even when applicability evolves to introduce another family.
export const gpuCatalogTransitionFields=()=>TRANSITION_CONTROLS.map(control=>control.field);
