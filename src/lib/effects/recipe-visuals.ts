import type {GuideEffect} from './guide';
export type RecipeVisual = {
 video: string; poster: string; summary: string; note: string;
 /** Rights and attribution for the teaching media, published with the recipe pages. */
 credit: string;
 /** An input is a picture (`file`) or short typed text such as the words to hide (`words`). */
 inputs: {file?:string;words?:string[];label:string;role:'supply'|'prepared'}[];
 stages: {file:string;label:string}[];
};
/** Teaching media is separate from reference/recreation evidence and its maturity. */
export const recipeVisuals:Record<string,RecipeVisual>={
 'FX-MASK-GLITCH': {
  video:'/recipe-previews/mask-glitch/result.mp4',poster:'/recipe-previews/mask-glitch/poster.jpg',
  summary:'Each next subject appears over the current scene in white, returns to its original color, then its own scene replaces the background.',
  credit:'Footage: Pexels videos 30996082, 19279353 and 4824399 (Pexels License), built as an editable DreamCut timeline.',
  note:'Real footage at normal speed; each lead-in lasts 0.3 seconds. Footage: Pexels (Pexels License).',
  inputs:[{file:'/recipe-previews/mask-glitch/inputs/scene-a-neon.jpg',label:'Starting scene',role:'supply'},{file:'/recipe-previews/mask-glitch/inputs/scene-b-desert.jpg',label:'Next scene · walker',role:'supply'},{file:'/recipe-previews/mask-glitch/inputs/scene-c-skater.jpg',label:'Next scene · skater',role:'supply'},{file:'/recipe-previews/mask-glitch/inputs/subject-b-walker.png',label:'Moving mask · walker',role:'prepared'},{file:'/recipe-previews/mask-glitch/inputs/subject-c-skater.png',label:'Moving mask · skater',role:'prepared'}],
  stages:[{file:'/recipe-previews/mask-glitch/start.jpg',label:'1 · Start'},{file:'/recipe-previews/mask-glitch/white.jpg',label:'2 · White subject'},{file:'/recipe-previews/mask-glitch/colour.jpg',label:'3 · Original color'},{file:'/recipe-previews/mask-glitch/destination.jpg',label:'4 · Scene changes'}],
 },
 'FX-WORD-SEARCH-TRACE': {
  video:'/recipe-previews/word-search/result.mp4',poster:'/recipe-previews/word-search/poster.jpg',
  summary:'A letter grid sits over your footage. On each cut, a hand-drawn outline circles one hidden word, and every outline stays on screen.',
  credit:'Footage: Pexels videos 8680224, 35811255, 34736308 and 9130084 (Pexels License). Inspired by a "connect the letters" tutorial by Camila Tunoni.',
  note:'Real footage at normal speed; each outline draws in 0.6 seconds.',
  inputs:[{file:'/recipe-previews/word-search/inputs/shot-1.jpg',label:'Shot 1',role:'supply'},{file:'/recipe-previews/word-search/inputs/shot-2.jpg',label:'Shot 2',role:'supply'},{file:'/recipe-previews/word-search/inputs/shot-3.jpg',label:'Shot 3',role:'supply'},{file:'/recipe-previews/word-search/inputs/shot-4.jpg',label:'Shot 4',role:'supply'},{words:['FOG','HILL','DUSK','TRAIL'],label:'One word per shot',role:'supply'},{file:'/recipe-previews/word-search/inputs/letter-grid.jpg',label:'Letter grid and outlines',role:'prepared'}],
  stages:[{file:'/recipe-previews/word-search/grid.jpg',label:'1 · Letter grid'},{file:'/recipe-previews/word-search/first-word.jpg',label:'2 · First word circled'},{file:'/recipe-previews/word-search/all-words.jpg',label:'3 · Every word circled'}],
 },
 'FX-MOTION-EXPLAINER': {
  video:'/recipe-previews/motion-explainer/result.mp4',poster:'/recipe-previews/motion-explainer/poster.jpg',
  summary:'A title, a key point with its words marked, a number counting up, three steps and a closing line, one after another.',
  credit:'Built in DreamCut as an editable code-built motion graphic; no footage, generated imagery or people.',
  note:'Default content at normal speed; the number counts up over 1.4 seconds.',
  inputs:[{words:['68%','Import','Columns','Progress'],label:'Number and three steps',role:'supply'},{file:'/recipe-previews/motion-explainer/inputs/looks.jpg',label:'One graphic, five looks',role:'prepared'}],
  stages:[{file:'/recipe-previews/motion-explainer/title.jpg',label:'1 · Title'},{file:'/recipe-previews/motion-explainer/point.jpg',label:'2 · Key point'},{file:'/recipe-previews/motion-explainer/number.jpg',label:'3 · Number counts up'},{file:'/recipe-previews/motion-explainer/steps.jpg',label:'4 · Three steps'}],
 },
 'FX-MOTION-CHART': {
  video:'/recipe-previews/motion-chart/result.mp4',poster:'/recipe-previews/motion-chart/poster.jpg',
  summary:'Bars rise one after another while their values count up, then everything but the highlighted month steps back.',
  credit:'Built in DreamCut as an editable code-built motion graphic; no footage, generated imagery or people.',
  note:'Default data at normal speed; bars start 0.18 seconds apart.',
  inputs:[{words:['12','19','27','34','48'],label:'Values',role:'supply'},{file:'/recipe-previews/motion-chart/inputs/looks.jpg',label:'One graphic, five looks',role:'prepared'}],
  stages:[{file:'/recipe-previews/motion-chart/empty.jpg',label:'1 · Title'},{file:'/recipe-previews/motion-chart/growing.jpg',label:'2 · Bars grow'},{file:'/recipe-previews/motion-chart/landed.jpg',label:'3 · Every bar lands'},{file:'/recipe-previews/motion-chart/highlight.jpg',label:'4 · One stands out'}],
 },
 'FX-MOTION-PLANS': {
  video:'/recipe-previews/motion-plans/result.mp4',poster:'/recipe-previews/motion-plans/poster.jpg',
  summary:'Three plan cards arrive, prices count up, feature ticks draw in row by row, then one plan is ringed with a badge.',
  credit:'Built in DreamCut as an editable code-built motion graphic; no footage, generated imagery or people.',
  note:'Default plans at normal speed; ticks draw 0.22 seconds apart.',
  inputs:[{words:['$0','$12','$29'],label:'Prices',role:'supply'},{file:'/recipe-previews/motion-plans/inputs/looks.jpg',label:'One graphic, five looks',role:'prepared'}],
  stages:[{file:'/recipe-previews/motion-plans/cards.jpg',label:'1 · Cards arrive'},{file:'/recipe-previews/motion-plans/ticks.jpg',label:'2 · Ticks draw in'},{file:'/recipe-previews/motion-plans/highlight.jpg',label:'3 · One plan highlighted'}],
 },
 'FX-MOTION-WALKTHROUGH': {
  video:'/recipe-previews/motion-walkthrough/result.mp4',poster:'/recipe-previews/motion-walkthrough/poster.jpg',
  summary:'Numbered steps come up one at a time, each with its own picture sliding onto the screen while a progress bar fills.',
  credit:'Step pictures: stills from Pexels videos 9130084, 4208237 and 8148429 (Pexels License). Screen, steps and motion built in DreamCut as an editable motion graphic.',
  note:'Three supplied pictures, 9:16, at normal speed; each step holds 2.4 seconds.',
  inputs:[{file:'/recipe-previews/motion-walkthrough/inputs/picture-1.jpg',label:'Step 1 picture',role:'supply'},{file:'/recipe-previews/motion-walkthrough/inputs/picture-2.jpg',label:'Step 2 picture',role:'supply'},{file:'/recipe-previews/motion-walkthrough/inputs/picture-3.jpg',label:'Step 3 picture',role:'supply'},{words:['Pick','Caption','Order'],label:'One line per step',role:'supply'},{file:'/recipe-previews/motion-walkthrough/inputs/looks.jpg',label:'One graphic, five looks',role:'prepared'}],
  stages:[{file:'/recipe-previews/motion-walkthrough/step-1.jpg',label:'1 · First step'},{file:'/recipe-previews/motion-walkthrough/step-2.jpg',label:'2 · Next picture slides in'},{file:'/recipe-previews/motion-walkthrough/step-3.jpg',label:'3 · Last step'}],
 },
 'FX-MOTION-KINETIC': {
  video:'/recipe-previews/motion-kinetic/result.mp4',poster:'/recipe-previews/motion-kinetic/poster.jpg',
  summary:'A phrase lands word by word on an even beat and builds into lines, with the accent word in color.',
  credit:'Built in DreamCut as an editable code-built motion graphic; no footage, generated imagery or people.',
  note:'Default phrase at normal speed; one word every 0.32 seconds.',
  inputs:[{words:['Less','time','making'],label:'Phrase and accent word',role:'supply'},{file:'/recipe-previews/motion-kinetic/inputs/looks.jpg',label:'One graphic, five looks',role:'prepared'}],
  stages:[{file:'/recipe-previews/motion-kinetic/first-words.jpg',label:'1 · First words'},{file:'/recipe-previews/motion-kinetic/building.jpg',label:'2 · The line builds'},{file:'/recipe-previews/motion-kinetic/landed.jpg',label:'3 · Every word landed'}],
 },
 'FX-MASKING-HOOK': {
  video:'/recipe-previews/masking-hook/result.mp4',poster:'/recipe-previews/masking-hook/poster.jpg',
  summary:'The shot opens on black with three quick cut-out flashes of the person (white, red, then just the head), and the real shot carries on from the exact moment the flashes end.',
  credit:'Footage: Pexels video 8970054 (Pexels License), built as an editable DreamCut timeline. Effect reference: @willrvail breakdown of a video by @nvision.media.',
  note:'Real footage at normal speed; each flash lasts 4 frames with one black frame between.',
  inputs:[{file:'/recipe-previews/masking-hook/inputs/shot.jpg',label:'Shot of a person',role:'supply'},{file:'/recipe-previews/masking-hook/inputs/cutout.png',label:'Moving cutout',role:'prepared'}],
  stages:[{file:'/recipe-previews/masking-hook/white.jpg',label:'1 · White'},{file:'/recipe-previews/masking-hook/red.jpg',label:'2 · Color'},{file:'/recipe-previews/masking-hook/head.jpg',label:'3 · Head only'},{file:'/recipe-previews/masking-hook/shot.jpg',label:'4 · Shot plays on'}],
 },
 'FX-CLONE-FLASH': {
  video:'/recipe-previews/clone-flash/result.mp4',poster:'/recipe-previews/clone-flash/poster.jpg',
  summary:'Copies of the man, cut out from later in the same take, appear beside him one at a time; each arrives as a white silhouette and settles into color.',
  credit:'Footage: Pexels video 8680224 (Pexels License), built as an editable DreamCut timeline. Effect reference: @willrvail breakdown of a video by @nvision.media.',
  note:'Real footage at normal speed; each clone is white for 0.1 s and in color by 0.2 s.',
  inputs:[{file:'/recipe-previews/clone-flash/inputs/shot.jpg',label:'Still shot',role:'supply'},{file:'/recipe-previews/clone-flash/inputs/cutout.png',label:'Moving cutout',role:'prepared'}],
  stages:[{file:'/recipe-previews/clone-flash/original.jpg',label:'1 · Original'},{file:'/recipe-previews/clone-flash/first-clone.jpg',label:'2 · First clone flashes'},{file:'/recipe-previews/clone-flash/second-clone.jpg',label:'3 · Second clone flashes'},{file:'/recipe-previews/clone-flash/three.jpg',label:'4 · Three of him'}],
 },
 'FX-SILHOUETTE-WINDOW': {
  video:'/recipe-previews/silhouette-window/result.mp4',poster:'/recipe-previews/silhouette-window/poster.jpg',
  summary:'Short clips play one after another inside the man\'s moving silhouette while the dusk sky and sea around him stay as filmed.',
  credit:'Footage: Pexels videos 34736308, 4208237, 8148429, 9130084, 10989548, 5977487, 3010130, 7348329 and 35811255 (Pexels License), built as an editable DreamCut timeline. Effect reference: @willrvail breakdown of a video by @nvision.media.',
  note:'Real footage at normal speed; a new clip every 0.6 seconds.',
  inputs:[{file:'/recipe-previews/silhouette-window/inputs/person.jpg',label:'Shot of a person',role:'supply'},{file:'/recipe-previews/silhouette-window/inputs/fill-water.jpg',label:'Fill clip',role:'supply'},{file:'/recipe-previews/silhouette-window/inputs/fill-meadow.jpg',label:'Fill clip',role:'supply'},{file:'/recipe-previews/silhouette-window/inputs/fill-rocks.jpg',label:'Fill clip',role:'supply'},{file:'/recipe-previews/silhouette-window/inputs/fill-sky.jpg',label:'Fill clip',role:'supply'},{file:'/recipe-previews/silhouette-window/inputs/moving-mask.png',label:'Moving mask',role:'prepared'}],
  stages:[{file:'/recipe-previews/silhouette-window/meadow.jpg',label:'1 · First clip inside'},{file:'/recipe-previews/silhouette-window/ridge.jpg',label:'2 · Next clip'},{file:'/recipe-previews/silhouette-window/rocks.jpg',label:'3 · Next clip'},{file:'/recipe-previews/silhouette-window/sky.jpg',label:'4 · Window follows him'}],
 },
 'FX-LYRIC-POP': {
  video:'/recipe-previews/lyric-pop/result.mp4',poster:'/recipe-previews/lyric-pop/poster.jpg',
  summary:'On the beat, one gold serif word springs onto the shot, holds, then cuts away.',
  credit:'Footage: Pexels video 3010130 (Pexels License), built as an editable DreamCut timeline. Effect reference: @willrvail breakdown of a video by @nvision.media.',
  note:'Real footage at normal speed; the word springs on in 0.25 seconds and holds 1.4 seconds.',
  inputs:[{file:'/recipe-previews/lyric-pop/inputs/shot.jpg',label:'Shot',role:'supply'},{words:['CRAZY'],label:'The word',role:'supply'},{file:'/recipe-previews/lyric-pop/inputs/styled-word.jpg',label:'Gold serif word',role:'prepared'}],
  stages:[{file:'/recipe-previews/lyric-pop/before.jpg',label:'1 · Before the beat'},{file:'/recipe-previews/lyric-pop/pop.jpg',label:'2 · Word springs on'},{file:'/recipe-previews/lyric-pop/hold.jpg',label:'3 · Word holds'}],
 },
 'FX-CROSS-NEGATIVE': {
  video:'/recipe-previews/cross-negative/result.mp4',poster:'/recipe-previews/cross-negative/poster.jpg',
  summary:'A bar slides in from the right and another drops from the top, opening a cross onto the next shot as a black-and-white negative; the cross widens until the negative fills the frame.',
  credit:'Footage: Pexels videos 5977487 and 35811255 (Pexels License), built as an editable DreamCut timeline. Effect reference: @willrvail breakdown of a video by @nvision.media.',
  note:'Real footage at normal speed; the cross opens over 1.5 seconds.',
  inputs:[{file:'/recipe-previews/cross-negative/inputs/shot-a.jpg',label:'Shot A',role:'supply'},{file:'/recipe-previews/cross-negative/inputs/shot-b.jpg',label:'Shot B',role:'supply'},{file:'/recipe-previews/cross-negative/inputs/negative.jpg',label:'Shot B as a negative',role:'prepared'}],
  stages:[{file:'/recipe-previews/cross-negative/shot-a.jpg',label:'1 · Shot A'},{file:'/recipe-previews/cross-negative/first-bar.jpg',label:'2 · First bar'},{file:'/recipe-previews/cross-negative/cross.jpg',label:'3 · Cross opens'},{file:'/recipe-previews/cross-negative/negative.jpg',label:'4 · Negative fills the frame'}],
 },
 'FX-SPEED-ENTRANCE-EXIT': {
  video:'/recipe-previews/speed-entrance-exit/result.mp4',poster:'/recipe-previews/speed-entrance-exit/poster.jpg',
  summary:'The man streaks into the empty set in a horizontal blur, lands sharp and performs, then streaks out the other side while the set stays still.',
  credit:'Footage: Pexels video 8798070 (Pexels License), built as an editable DreamCut timeline.',
  note:'Real footage at normal speed; each streak lasts 0.2 seconds.',
  inputs:[{file:'/recipe-previews/speed-entrance-exit/inputs/performance.jpg',label:'Performance, camera locked',role:'supply'},{file:'/recipe-previews/speed-entrance-exit/inputs/empty-background.jpg',label:'Same shot, empty',role:'supply'},{file:'/recipe-previews/speed-entrance-exit/inputs/moving-cutout.png',label:'Moving cutout',role:'prepared'}],
  stages:[{file:'/recipe-previews/speed-entrance-exit/empty.jpg',label:'1 · Empty set'},{file:'/recipe-previews/speed-entrance-exit/streak-in.jpg',label:'2 · Streaks in'},{file:'/recipe-previews/speed-entrance-exit/settled.jpg',label:'3 · Lands and performs'},{file:'/recipe-previews/speed-entrance-exit/streak-out.jpg',label:'4 · Streaks out'}],
 },
 'FX-MASK-GLITCH-GLOW': {
  video:'/recipe-previews/mask-glitch-glow/result.mp4',poster:'/recipe-previews/mask-glitch-glow/poster.jpg',
  summary:'Each next pose of the man appears over the empty set as a glowing white silhouette, then shows its original color as the halo fades.',
  credit:'Footage: Pexels video 10210101 (Pexels License), built as an editable DreamCut timeline.',
  note:'Real footage at normal speed; each pose is white for 0.12 seconds and a new one arrives every 0.8 seconds.',
  inputs:[{file:'/recipe-previews/mask-glitch-glow/inputs/pose-1.jpg',label:'Pose 1',role:'supply'},{file:'/recipe-previews/mask-glitch-glow/inputs/pose-2.jpg',label:'Pose 2',role:'supply'},{file:'/recipe-previews/mask-glitch-glow/inputs/pose-3.jpg',label:'Pose 3',role:'supply'},{file:'/recipe-previews/mask-glitch-glow/inputs/empty-background.jpg',label:'Same shot, empty',role:'supply'},{file:'/recipe-previews/mask-glitch-glow/inputs/moving-cutout.png',label:'Moving cutout',role:'prepared'}],
  stages:[{file:'/recipe-previews/mask-glitch-glow/white.jpg',label:'1 · White with a halo'},{file:'/recipe-previews/mask-glitch-glow/colour.jpg',label:'2 · Original color'},{file:'/recipe-previews/mask-glitch-glow/next.jpg',label:'3 · Next pose flashes in'},{file:'/recipe-previews/mask-glitch-glow/last.jpg',label:'4 · Last pose holds'}],
 },
 'FX-MOVING-GRID-MATTE': {
  video:'/recipe-previews/moving-grid-matte/result.mp4',poster:'/recipe-previews/moving-grid-matte/poster.jpg',
  summary:'The dancer\'s sharp footage shows only through square cells that follow her silhouette as she moves, over a separate dark background.',
  credit:'Footage: Pexels videos 7424171 and 9732065 (Pexels License), built as an editable DreamCut timeline.',
  note:'Real footage at normal speed; the cells follow her frame by frame.',
  inputs:[{file:'/recipe-previews/moving-grid-matte/inputs/moving-subject.jpg',label:'Moving subject',role:'supply'},{file:'/recipe-previews/moving-grid-matte/inputs/background.jpg',label:'Background',role:'supply'},{file:'/recipe-previews/moving-grid-matte/inputs/greyscale-mask.png',label:'Moving mask',role:'prepared'}],
  stages:[{file:'/recipe-previews/moving-grid-matte/cells.jpg',label:'1 · Cells follow her shape'},{file:'/recipe-previews/moving-grid-matte/moving.jpg',label:'2 · She moves, the cells move'},{file:'/recipe-previews/moving-grid-matte/leg-up.jpg',label:'3 · New pose, new cells'}],
 },
 'talking-head-cutout': {
  video:'/recipe-previews/talking-head-cutout/result.mp4',poster:'/recipe-previews/talking-head-cutout/poster.jpg',
  summary:'The room behind her disappears while she keeps talking; her hair, hands and necklace stay, now in front of a plain backdrop.',
  credit:'Footage: Pexels videos 8814086 and 8798070 (Pexels License), built as an editable DreamCut timeline.',
  note:'Real footage at normal speed; the room shows for 1.6 seconds, then the backdrop changes.',
  inputs:[{file:'/recipe-previews/talking-head-cutout/inputs/talking-head.jpg',label:'Talking-head video',role:'supply'},{file:'/recipe-previews/talking-head-cutout/inputs/moving-cutout.png',label:'Moving cutout',role:'prepared'}],
  stages:[{file:'/recipe-previews/talking-head-cutout/original.jpg',label:'1 · Original room'},{file:'/recipe-previews/talking-head-cutout/removed.jpg',label:'2 · Room removed'},{file:'/recipe-previews/talking-head-cutout/kept.jpg',label:'3 · Hands and hair kept'}],
 },
};
/** Keyed like creator briefs: the catalog id, or the owning skill for an entry without one. */
export function recipeVisualFor(effect:Pick<GuideEffect,'id'|'origin'>&{skill?:string}){return effect.origin==='user'?undefined:recipeVisuals[effect.id??effect.skill??''];}
/** A template has something to watch or look at: curated teaching media, its own recording or a still. */
export function recipeHasExample(effect:GuideEffect){return Boolean(recipeVisualFor(effect)?.video||effect.video||effect.tutorialVideo||effect.image||effect.poster);}
export const recipeMediaUrl=(file:string)=>file.startsWith('/')?file:`/guide/effects/${file}`;
