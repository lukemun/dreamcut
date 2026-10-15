'use client';
import type {GuideEffect} from '@/lib/effects/guide';
import {recipeVisualFor,recipeMediaUrl} from '@/lib/effects/recipe-visuals';
import {MediaGallery} from '@/components/ui/media-gallery';
import {RecordedEffectPreview,recordedPreviewEvents} from './RecordedEffectPreview';

/** The video and poster a template plays as its example. */
export function recipeExampleMedia(effect:GuideEffect){
 const visual=recipeVisualFor(effect);
 const video=effect.tutorialVideo??visual?.video??effect.video,poster=visual?.poster??effect.poster;
 return video?{video:recipeMediaUrl(video),poster:poster?recipeMediaUrl(poster):undefined}:null;
}

/** The example: video (or still) with its one-line summary. `maxHeight` caps it in tight panels. */
export function RecipeResult({effect,heading=true,maxHeight='65vh',onWatch}:{effect:GuideEffect;heading?:boolean;maxHeight?:string;onWatch?:()=>void}){
 const visual=recipeVisualFor(effect);
 const video=effect.tutorialVideo??visual?.video??effect.video,poster=visual?.poster??effect.poster;
 return <section className="min-w-0">
   {heading&&<h3 className="mb-2 text-base font-semibold">{effect.tutorialVideo?'Full reference & tutorial':visual?'Result':effect.exampleKind==='reference'?'Reference example':'Result'}</h3>}
   {video?<div tabIndex={effect.tutorialVideo ? undefined : 0} role="group" aria-label={`${effect.title} preview`} {...(effect.tutorialVideo ? {} : recordedPreviewEvents)} className="rounded-md focus-visible:outline-2 focus-visible:outline-[var(--chrome-focus-ring)]">
    <RecordedEffectPreview key={video} src={recipeMediaUrl(video)} poster={poster?recipeMediaUrl(poster):undefined} label={`${effect.title} ${effect.tutorialVideo ? "full tutorial" : "demonstration"}`} controls loop={!effect.tutorialVideo} className="block w-auto max-w-full rounded-md object-contain" style={{maxHeight}} />
   </div>:effect.image?<img src={recipeMediaUrl(effect.image)} alt={effect.imageAlt??`${effect.title} result`} className="max-w-full rounded-md object-contain" style={{maxHeight}}/>:null}
   {onWatch&&video&&<button type="button" onClick={onWatch} className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium hover:bg-[var(--chrome-raised)] focus-visible:outline-2 focus-visible:outline-[var(--chrome-focus-ring)]">▶ Watch in preview</button>}
   {effect.sourceUrl && !effect.tutorialVideo && <a href={effect.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block text-sm underline">Watch full reference ↗</a>}
   <p className="mt-2 text-sm leading-relaxed">{visual?.summary??effect.description}</p>
   {visual&&<p className="mt-1 text-sm text-[var(--ink-muted)]">{visual.note}</p>}
  </section>;
}

/** What goes in: what the creator supplies and what DreamCut prepares. */
export function RecipeIngredients({effect,suppliedTitle='You supply'}:{effect:GuideEffect;suppliedTitle?:string}){
 const visual=recipeVisualFor(effect);
 const supplied=visual?.inputs.filter(input=>input.role==='supply')??[],prepared=visual?.inputs.filter(input=>input.role==='prepared')??[];
 if(visual)return <><RecipeInputs title={suppliedTitle} inputs={supplied}/><RecipeInputs title="DreamCut prepares" inputs={prepared}/></>;
 const examples=effect.inputs;
 if(!examples.length)return null;
 return <section><h3 className="mb-2 text-base font-semibold">{suppliedTitle}</h3>
  <MediaGallery targetHeight={135} minCardWidth={80} gap={10} maxPerRow={5}>{examples.map(input=><InputFigure key={input.file} file={input.file} label={input.label}/>)}</MediaGallery>
 </section>;
}

/** What happens: the construction stages as one strip. */
export function RecipeStages({effect}:{effect:GuideEffect}){
 const visual=recipeVisualFor(effect);
 if(!visual)return null;
 return <section><h3 className="mb-2 text-base font-semibold">What happens</h3>
  <MediaGallery targetHeight={110} minCardWidth={60} gap={8} maxPerRow={visual.stages.length}>{visual.stages.map(stage=><figure className="m-0" key={stage.file}><img data-media-preview src={stage.file} alt={stage.label} className="block h-auto w-full rounded object-contain"/><figcaption className="mt-1 text-sm leading-snug">{stage.label}</figcaption></figure>)}</MediaGallery>
 </section>;
}

type RecipeInput=NonNullable<ReturnType<typeof recipeVisualFor>>['inputs'][number];
const transparentBackdrop={background:'repeating-conic-gradient(var(--chrome-panel) 0% 25%, var(--chrome-raised) 0% 50%) 0 0 / 16px 16px'};

function InputFigure({file,label,transparent=false}:{file:string;label:string;transparent?:boolean}){
 return <figure className="m-0 min-w-0">
  <img data-media-preview src={recipeMediaUrl(file)} alt={label} className="block h-auto w-full rounded object-contain" style={transparent?transparentBackdrop:undefined}/>
  <figcaption className="mt-1 text-sm font-medium leading-snug">{label}</figcaption>
 </figure>;
}

/** Pictures share one gallery; typed inputs such as words read as text beneath it. */
function RecipeInputs({title,inputs}:{title:string;inputs:RecipeInput[]}){
 if(!inputs.length)return null;
 const pictures=inputs.filter(input=>input.file),typed=inputs.filter(input=>input.words?.length);
 return <section><h3 className="mb-2 text-base font-semibold">{title}</h3>
  {pictures.length>0&&<MediaGallery targetHeight={135} minCardWidth={70} gap={10} maxPerRow={5}>{pictures.map(input=><InputFigure key={input.file} file={input.file!} label={input.label} transparent={input.role==='prepared'}/>)}</MediaGallery>}
  {typed.map(input=><p key={input.label} className="mt-3 text-sm"><span className="font-medium">{input.label}</span><span className="mt-1 flex flex-wrap gap-x-5 gap-y-1">{input.words!.map(word=><span key={word} className="text-base tracking-[0.3em]">{word}</span>)}</span></p>)}
 </section>;
}
