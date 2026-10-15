import type { GuideEffect } from './guide';

const DEB_REFERENCE = '@willrvail breakdown of a video by @nvision.media; https://www.instagram.com/reel/Deb-VcJRpxp/';

/** Public construction briefs. Private references and demonstrations are not copied. */
export const promotedRecipes: GuideEffect[] = [
  {
    id: 'FX-SPEED-ENTRANCE-EXIT', promotedFrom: 'user-speed-entrance-exit', origin: 'shared', implementation: 'implemented',
    title: 'Speed Entrance & Exit', skill: 'video-compositing',
    description: 'A moving subject streaks into or out of a fixed scene while the background stays still.',
    inputs: [], needs: ['Performance footage', 'Matching empty background'],
    prompt: 'Build Speed Entrance & Exit from my performance footage and matching empty background. Follow the Speed Entrance & Exit template in the video-compositing skill. Prepare source-timed moving subject masks, preserve the original performance, and animate the separate subject with directional motion blur. Expose entrance and exit timing, direction, travel and blur using supported controls. Keep the background and subject editable. Check the complete motion at normal speed and propose changes to my existing edit.',
    limitations: ['Whatever the camera cropped stays cropped: a subject cut off at the frame edge streaks in cut off.', 'A fixed camera and matching empty background are the supported starting point. Moving cameras require additional tracking.', 'Fresh-input reuse and complete unaided editing acceptance remain to be checked.'],
  },
  {
    id: 'FX-MASK-GLITCH-GLOW', promotedFrom: 'user-subject-flash-glow', origin: 'shared', implementation: 'implemented',
    title: 'Mask Glitch · Glow', skill: 'mask-glitch',
    description: 'Successive subjects appear as brief white silhouettes with a soft halo, then reveal their original color.',
    inputs: [], needs: ['Ordered pose or performance takes', 'Matching empty background'],
    prompt: 'Use the Mask Glitch · Glow template in the mask-glitch skill to build successive pose reveals from my footage over the matching empty background. Prepare source-timed subject masks. Time a short white flash and optional alpha-derived glow on each editable subject, then reveal its normal color. Expose spacing, flash timing, glow strength and radius through supported controls. Keep each subject and the background editable, inspect moving edges and normal-speed playback, and propose changes to my existing edit.',
    limitations: ['Thin details the cutout misses, such as fine chains or loose strands, show the background through the white silhouette and its halo.', 'The halo follows subject alpha; it is not an exact reproduction of a third-party glow kernel.', 'Fresh-input reuse and independent unaided editing acceptance remain to be checked.'],
  },
  {
    id: 'FX-MOVING-GRID-MATTE', promotedFrom: 'user-moving-grid-matte', origin: 'shared', implementation: 'implemented',
    title: 'Moving Grid Matte', skill: 'video-compositing',
    description: 'Sharp moving footage appears through square cells that follow the subject silhouette, over a separate background.',
    inputs: [], needs: ['Moving subject footage', 'Background'],
    prompt: 'Build Moving Grid Matte from my moving subject clip and chosen background. Follow the Moving Grid Matte template in the video-compositing skill. Prepare a grayscale rotoscope bound to the source clock, retain one continuous sharp original clip, and use the native Moving Grid Matte controls. Expose cell size, mask coverage, grid strength and grid width. Keep the background separate, verify mask coverage throughout the interval, and propose changes to my existing edit.',
    limitations: ['Each cell shows the original shot as filmed, including its own background inside the square.', 'Replacing footage requires a matching mask covering the selected source interval.', 'The four grid controls are static. Exact reference fidelity and continuous fine-edge quality are not certified.'],
  },
  {
    id: 'FX-WORD-SEARCH-TRACE', origin: 'shared', implementation: 'implemented',
    title: 'Word Search Trace', skill: 'motion-graphics',
    description: 'A letter grid over your footage; on each cut a hand-drawn outline circles one hidden word.',
    inputs: [], needs: ['Two to four short shots', 'One word per shot'],
    referenceCredit: 'Camila Tunoni; https://www.instagram.com/reel/DbI9OQqMqw8/',
    prompt: 'Build Word Search Trace on my edit with these words: [WORD 1], [WORD 2], [WORD 3], [WORD 4]. Follow the Word Search Trace template in the motion-graphics skill: render the letter grid as a transparent motion graphic, hide one word per shot (across, down or diagonal), and time each outline to start just after its cut. Keep the footage as native clips and expose the words, directions, trace timing, letter size and color as controls. Propose it for me to review.',
    limitations: ['The overlay is a rendered motion graphic: words, timing and color are tuned on the proposal card before approval, not in the inspector afterwards.', 'Words use the letters A–Z, up to 12 letters each, up to four words.', 'The grid is drawn for a portrait 9:16 canvas.'],
  },
  {
    id: 'FX-MOTION-EXPLAINER', origin: 'shared', implementation: 'implemented',
    title: 'Explainer Sequence', skill: 'motion-graphics', brings: { step: 'Write your words and one number', request: 'with my words' },
    description: 'A short code-built explainer: title, key point, a number that counts up, three steps and a closing line.',
    inputs: [], needs: ['Your title and key point', 'One number', 'Three steps and a closing line'],
    prompt: 'Build an Explainer Sequence from [REPORT OR NOTES]: title [TITLE], key point [POINT] with [MARKED WORDS] marked, big number [NUMBER] meaning [CAPTION], steps [STEP 1], [STEP 2], [STEP 3], closing line [CLOSING]. Follow the Explainer Sequence template in the motion-graphics skill, in the [LOOK] look, sized to my project. Expose every word, the number and each scene time as controls. Propose it for me to review.',
    limitations: ['Words, numbers, look, accent and every scene time are tuned on the proposal card and in Properties → Animation → Motion graphic; the canvas shape follows the project.', 'Exactly five scenes and three steps; a longer story uses two graphics in a row.', 'No voice or music is added; place a voice-over or track separately.'],
  },
  {
    id: 'FX-MOTION-CHART', origin: 'shared', implementation: 'implemented',
    title: 'Animated Chart', skill: 'motion-graphics', brings: { step: 'Have your labels and values ready', request: 'with my numbers' },
    description: 'Bars or a line build up one value at a time, each number counts up, then one item is highlighted.',
    inputs: [], needs: ['A title', 'Two to six labels and values'],
    prompt: 'Build an Animated Chart titled [TITLE] with these values: [LABEL 1] [VALUE 1], [LABEL 2] [VALUE 2], [LABEL 3] [VALUE 3]. Follow the Animated Chart template in the motion-graphics skill as [BARS OR A LINE] in the [LOOK] look, with values shown as [UNIT], and highlight [ITEM]. Expose every label, value, unit and timing as controls. Propose it for me to review.',
    limitations: ['Up to six items, one series; values start from zero.', 'Values are typed numbers on the card; the chart does not read a spreadsheet.', 'The canvas shape follows the project; tall canvases turn bars sideways.'],
  },
  {
    id: 'FX-MOTION-PLANS', origin: 'shared', implementation: 'implemented',
    title: 'Plan Comparison', skill: 'motion-graphics', brings: { step: 'List your plans and prices', request: 'with my plans and prices' },
    description: 'Two or three plans side by side; prices count up, feature ticks draw in and one plan is ringed with a badge.',
    inputs: [], needs: ['Plan names and prices', 'Up to five features'],
    prompt: 'Build a Plan Comparison of [PLAN 1] at [PRICE 1], [PLAN 2] at [PRICE 2] and [PLAN 3] at [PRICE 3] per [PERIOD], with features [FEATURE 1], [FEATURE 2], [FEATURE 3] (say how many each plan includes). Follow the Plan Comparison template in the motion-graphics skill in the [LOOK] look and highlight [PLAN] as [BADGE]. Expose names, prices, features, highlight and timing as controls. Propose it for me to review.',
    limitations: ['Features are tiered: each plan includes the first N features in the list.', 'Two or three plans, up to five features.', 'The canvas shape follows the project; tall canvases stack the plans.'],
  },
  {
    id: 'FX-MOTION-WALKTHROUGH', origin: 'shared', implementation: 'implemented',
    title: 'Walkthrough Steps', skill: 'motion-graphics', brings: { step: 'Write your steps', request: 'with my steps' },
    description: 'Numbered steps, one at a time, each with its own screenshot or picture on a screen and a progress bar.',
    inputs: [], needs: ['Two to four steps', 'A screenshot per step (optional)'],
    prompt: 'Build Walkthrough Steps titled [HEADING] with these steps: [STEP 1] ([DETAIL 1]), [STEP 2] ([DETAIL 2]), [STEP 3] ([DETAIL 3]). Use my screenshots [PICTURES] for the steps. Follow the Walkthrough Steps template in the motion-graphics skill in the [LOOK] look. Expose the words, step time and look as controls. Propose it for me to review.',
    limitations: ['Screenshots are copied into the graphic when it is prepared; swapping one needs a new preparation, not a dial.', 'Steps without a screenshot show a drawn stand-in screen.', 'Graphics with pictures cannot yet be saved to your Library for reuse.'],
  },
  {
    id: 'FX-MOTION-KINETIC', origin: 'shared', implementation: 'implemented',
    title: 'Kinetic Type', skill: 'motion-graphics', brings: { step: 'Write your phrase', request: 'with my phrase' },
    description: 'A phrase lands word by word on a beat, building into lines or one big word at a time, with accent words in color.',
    inputs: [], needs: ['A short phrase', 'The beat or word times (optional)'],
    prompt: 'Build Kinetic Type for [PHRASE] with [ACCENT WORDS] in the accent color, [BUILDING THE LINE OR ONE WORD AT A TIME], landing on [BEAT OR WORD TIMES]. Follow the Kinetic Type template in the motion-graphics skill in the [LOOK] look. Expose the phrase, beat, word times, landing and size as controls. Propose it for me to review.',
    limitations: ['Up to 40 words; long phrases shrink to fit.', 'Word times are typed seconds; they do not yet follow a beat grid automatically.', 'Its length follows the words, so the card shows the render length rather than a formula.'],
  },
  {
    id: 'FX-MASKING-HOOK', origin: 'shared', implementation: 'implemented',
    title: 'Masking Hook', skill: 'mask-glitch',
    description: 'Three quick cut-out flashes of your subject on black (white, color, head only), then the shot plays on from the same moment.',
    inputs: [], needs: ['One shot of a person'],
    referenceCredit: DEB_REFERENCE,
    prompt: 'Build Masking Hook as the opener of [SHOT]. Follow the Masking Hook template in the mask-glitch skill: prepare a moving cutout of the person for the half second before the shot starts, add three 4-frame flashes on black (white, [COLOR], then head only) with one black frame between, and start the shot from the exact source moment the flashes end. Expose the white strength, flash color and color amount as controls. Propose it for me to review.',
    limitations: ['Needs a clean cutout: holes in the cutout show as gaps in the silhouettes.', 'The head-only flash is a rectangular crop, so arms or hands close to the head show too.', 'Flash timing and the head crop are set in the proposal; the card offers white strength, color and color amount.'],
  },
  {
    id: 'FX-CLONE-FLASH', origin: 'shared', implementation: 'implemented',
    title: 'Clone Flash', skill: 'video-compositing',
    description: 'Copies of your subject from later in the same take appear beside them, each arriving with a white flash.',
    inputs: [], needs: ['A still shot of a person'],
    referenceCredit: DEB_REFERENCE,
    prompt: 'Build Clone Flash on [SHOT]. Follow the Clone Flash template in the video-compositing skill: prepare a moving cutout of the person from later in the same take, place two or three copies beside them on their own lanes, and give each a white silhouette for its first 0.1 s that fades to color by 0.2 s. Expose each clone\'s position and source moment as controls. Propose it for me to review.',
    limitations: ['The camera must stay still; a moving camera makes the clones slide.', 'Only the person is copied, so whatever they sit or lean on is not.', 'Clone start times are set in the proposal; the card offers position and source moment.'],
  },
  {
    id: 'FX-SILHOUETTE-WINDOW', origin: 'shared', implementation: 'implemented',
    title: 'Silhouette Window', skill: 'video-compositing',
    description: 'A run of short clips plays only inside your subject\'s moving silhouette; the rest of the shot stays as it is.',
    inputs: [], needs: ['A shot of a person', 'Several short fill clips'],
    referenceCredit: DEB_REFERENCE,
    prompt: 'Build Silhouette Window on [SHOT] with these fill clips: [CLIPS]. Follow the Silhouette Window template in the video-compositing skill: prepare the person\'s moving cutout mask, then place the fills in order (about 0.6 s each) as Subject Window clips shown inside the person. Expose edge softness, edge size and window strength as controls. Propose it for me to review.',
    limitations: ['The window follows the prepared cutout; anything it misses, such as a raised hand, stays unfilled.', 'Fill order and rhythm are set in the proposal; the card offers edge softness, edge size and window strength.'],
  },
  {
    id: 'FX-LYRIC-POP', origin: 'shared', implementation: 'implemented',
    title: 'Lyric Pop', skill: 'video-typography',
    description: 'One word in a bold gold serif springs onto the shot on a beat and holds.',
    inputs: [], needs: ['A shot', 'The word'],
    referenceCredit: DEB_REFERENCE,
    prompt: 'Build Lyric Pop on [SHOT] with the word [WORD] on the beat at [TIME]. Follow the Lyric Pop template in the video-typography skill: one native text layer in DM Serif Display, gold #E8B547, springing on over 0.25 s and holding about 1.4 s. Expose hold, size and spring time as controls. Propose it for me to review.',
    limitations: ['The word\'s start is set in the proposal and moved on the timeline; the card offers hold, size and spring time.', 'One word per card; repeat the template for each beat.'],
  },
  {
    id: 'FX-CROSS-NEGATIVE', origin: 'shared', implementation: 'implemented',
    title: 'Cross into Negative', skill: 'video-compositing',
    description: 'A cross-shaped window opens over one shot onto the next as a black-and-white negative, then widens to fill the frame.',
    inputs: [], needs: ['Two shots'],
    referenceCredit: DEB_REFERENCE,
    prompt: 'Build Cross into Negative from [SHOT A] into [SHOT B]. Follow the Cross into Negative template in the video-compositing skill: show shot B as a black-and-white negative inside a cross (a bar wipes in from the right, a bar drops from the top), then widen both until the negative fills the frame at the cut. Expose the gap between the bars, contrast and shot B\'s start as controls. Propose it for me to review.',
    limitations: ['The cross widens smoothly; the reference breaks into blocks as it opens.', 'Bar placement and widening are keyframes in the proposal; the card offers the gap between bars, contrast and shot B\'s start.', 'The bars are placed for a 16:9 frame.'],
  },
];

/** A promoted public brief replaces its discovery card, not the retained private files. */
export function withoutPromotedCopies(effects: GuideEffect[]) {
  const replaced = new Set(promotedRecipes.map(effect => effect.promotedFrom));
  return effects.filter(effect => effect.origin !== 'user' || !replaced.has(effect.id));
}

export function recipeStatusLabel(effect: GuideEffect) {
  if (effect.savedRecipe) return "Saved template · adapt to your footage";
  if (effect.implementation === 'implemented') return 'Implemented template · built with your agent';
  if (effect.status === 'complete') return 'Verified recreation';
  if (effect.status === 'partial') return 'Partial recreation · read limitations';
  if (effect.exampleKind === 'reference' || effect.status === 'candidate') return 'Reference example';
  return effect.video || effect.image ? 'Demonstration · not catalog-verified' : 'Demo not available yet';
}
