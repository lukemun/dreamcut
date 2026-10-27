'use client';
import type {GuideEffect} from '@/lib/effects/guide';
import {recipeVisualFor,recipeMediaUrl} from '@/lib/effects/recipe-visuals';
import {MediaGallery} from '@/components/ui/media-gallery';
import {RecordedEffectPreview} from './RecordedEffectPreview';

/** The video and poster a template plays as its example. */
export function recipeExampleMedia(effect:GuideEffect){
 // The creator's own version of the effect is what they recognise it by.
 if(effect.ownResultVideo)return {video:recipeMediaUrl(effect.ownResultVideo),poster:undefined};
 const visual=recipeVisualFor(effect);
 // The short result clip shows the effect itself; a full tutorial stays one click away.
 const video=visual?.video??effect.tutorialVideo??effect.video,poster=visual?.poster??effect.poster;
 return video?{video:recipeMediaUrl(video),poster:poster?recipeMediaUrl(poster):undefined}:null;
}

/** The example: video (or still) with its one-line summary. `maxHeight` caps it in tight panels. */
export function RecipeResult({effect,heading=true,maxHeight='65vh',onWatch}:{effect:GuideEffect;heading?:boolean;maxHeight?:string;onWatch?:()=>void}){
 const visual=recipeVisualFor(effect);
 const video=visual?.video??effect.tutorialVideo??effect.video,poster=visual?.poster??effect.poster;
 const tutorial=video===effect.tutorialVideo;
 const own=effect.ownResultVideo;
 return <section className="min-w-0">
   {own&&<div className="mb-4">
    {heading&&<h3 className="mb-2 text-base font-semibold">Your version</h3>}
    <RecordedEffectPreview key={own} gallery src={recipeMediaUrl(own)} label={`${effect.title}: your version`} controls className="block w-auto max-w-full rounded-md object-contain" style={{maxHeight}} />
   </div>}
   {heading&&<h3 className="mb-2 text-base font-semibold">{own?'Example':tutorial?'Full reference & tutorial':visual?'Result':effect.exampleKind==='reference'?'Reference example':'Result'}</h3>}
   {video?<div role="group" aria-label={`${effect.title} preview`} className="rounded-md focus-visible:outline-2 focus-visible:outline-[var(--chrome-focus-ring)]">
    <RecordedEffectPreview key={video} gallery src={recipeMediaUrl(video)} poster={poster?recipeMediaUrl(poster):undefined} label={`${effect.title} ${tutorial ? "full tutorial" : "demonstration"}`} controls loop={!tutorial} className="block w-auto max-w-full rounded-md object-contain" style={{maxHeight}} />
   </div>:effect.image?<img src={recipeMediaUrl(effect.image)} alt={effect.imageAlt??`${effect.title} result`} className="max-w-full rounded-md object-contain" style={{maxHeight}}/>:null}
   {onWatch&&video&&<button type="button" onClick={onWatch} className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-[var(--chrome-raised)] focus-visible:outline-2 focus-visible:outline-[var(--chrome-focus-ring)]">▶ Watch in preview</button>}
   {effect.tutorialVideo && !tutorial ? <a href={recipeMediaUrl(effect.tutorialVideo)} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm underline">Watch full tutorial ↗</a>
    : effect.sourceUrl && !effect.tutorialVideo && <a href={effect.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm underline">Watch full reference ↗</a>}
   <p className="mt-2 text-sm leading-relaxed">{visual?.summary??effect.description}</p>
   {visual&&<p className="mt-1 text-sm text-[var(--ink-muted)]">{visual.note}</p>}
  </section>;
}

/** The footage a creator brings, shown only when the template needs a clip to read (a take walked
 * between stops); stills of ordinary shots add nothing beyond How to film, so they stay out. */
export function RecipeIngredients({effect,suppliedTitle='Input',className}:{effect:GuideEffect;suppliedTitle?:string;className?:string}){
 const visual=recipeVisualFor(effect);
 const clips=[...(effect.suppliedVideos??[]),...(visual?.inputs??[]).flatMap(input=>input.role==='supply'&&input.video?[{video:input.video,label:input.label}]:[])];
 if(!clips.length)return null;
 return <section className={className}><h3 className="template-section-title">{suppliedTitle}</h3>
  <SupplyGallery clips={clips}/>
 </section>;
}

/** The one gallery for the clips a creator brings. A single clip is as tall as the example (the panel's
 * 420px cap) so the footage reads at the result's size; several share even rows at a smaller height.
 * Every template's Input uses it. */
function SupplyGallery({clips}:{clips:{video:string;label:string}[]}){
 if(!clips.length)return null;
 return <MediaGallery targetHeight={clips.length===1?420:140} minCardWidth={120} gap={12} maxPerRow={3} evenRows={clips.length>1}>
  {clips.map(item=><SuppliedVideo key={item.video} {...item}/>)}
 </MediaGallery>;
}

/** Footage the creator supplied for their own version: the raw take, playable. */
function SuppliedVideo({video,label}:{video:string;label:string}){
 return <figure className="m-0 min-w-0">
  <RecordedEffectPreview gallery src={recipeMediaUrl(video)} label={label} controls loop={false} className="block h-auto w-full rounded object-contain"/>
  <figcaption className="mt-1 text-sm font-medium leading-snug">{label}</figcaption>
 </figure>;
}
