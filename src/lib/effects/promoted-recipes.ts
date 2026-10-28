import type { GuideEffect } from './guide';

const DEB_REFERENCE = '@willrvail breakdown of a video by @nvision.media; https://www.instagram.com/reel/Deb-VcJRpxp/';

/** Public construction briefs. Private references and demonstrations are not copied. */
export const promotedRecipes: GuideEffect[] = [
  {
    id: 'FX-SPEED-ENTRANCE-EXIT', promotedFrom: 'user-speed-entrance-exit', origin: 'shared', implementation: 'implemented',
    title: 'Speed Entrance & Exit', skill: 'speed-entrance-exit',
    description: 'A moving subject streaks into or out of a fixed scene while the background stays still.',
    inputs: [], needs: ['Performance footage', 'Matching empty background'],
    prompt: 'Build Speed Entrance & Exit from my performance footage and matching empty background. Follow the speed-entrance-exit skill: move a cut-out of me between two keyframed places over a few frames with blur, never by playing the footage faster. If I marked stops, shoot me from each mark to the next and hold live at each one. Preserve the original performance, keep the background and subject editable, give me a hold dial per stop, check the complete motion at normal speed and propose changes to my existing edit.',
    limitations: ['Whatever the camera cropped stays cropped: a subject cut off at the frame edge streaks in cut off.', 'A fixed camera and matching empty background are the supported starting point. Moving cameras require additional tracking.', 'Fresh-input reuse and complete unaided editing acceptance remain to be checked.'],
  },
  {
    id: 'FX-SPEED-HOPS-TO-CAMERA', origin: 'shared', implementation: 'implemented',
    title: 'Speed hops to camera', skill: 'speed-entrance-exit',
    description: 'You streak from stop to stop across a still scene, land standing at each one, arrive in front of the camera to say your line, then streak out of frame, with a whoosh on every hop.',
    inputs: [], needs: ['One locked-off take that starts on the empty scene', 'Marks where you stop'],
    referenceCredit: 'Marvin Appiah Korang · speed-effect tutorial',
    prompt: 'Build Speed hops to camera from my locked-off take and my marked stops. Follow the speed-entrance-exit skill (Mark to mark): move a cut-out of me between keyframed places with blur, never by playing the footage faster. Use the first seconds of the take, before I walk in, as the empty scene. Open on me at the first stop, streak mark to mark and land standing at each with a brief live hold, streak into my line in front of the camera, play it live, then streak me out of frame when I finish and end shortly after. Measure takeoff and settle frames, keep the blur light enough that I stay visible, keep cropped edges off screen, and put a whoosh from the speed whoosh sounds in the Library on every hop. Leave out captions, colour grading and music. Give me hold, hop length and blur dials in time order, check every landing at normal speed, and propose it for me to review.',
    limitations: ['Whatever the camera cropped stays cropped; a close-up leaves by lunging past the camera instead of sliding.', 'Needs a fixed camera and a take that starts on the empty scene; moving cameras need tracking first.', 'The hop sounds come from the Library\'s speed whoosh set (members).', 'Built and tuned on one take (a walk toward the camera with six stops); other footage is untested.'],
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
    id: 'FX-PAPER-CUTOUT', origin: 'shared', implementation: 'implemented',
    title: 'Paper cutout', skill: 'scratchpad-treatment',
    description: 'Your subject is cut out of the moving shot and outlined in thick paper, like a scrapbook sticker.',
    inputs: [], needs: ['A shot with the subject', 'A mark or time, and who to cut out'],
    prompt: 'Build Paper cutout on [SUBJECT] at [MARK OR TIME]. Follow the Paper cutout template in the scratchpad-treatment skill: prepare a moving cutout of the subject with cutout_prepare over the source window under the mark, then propose the cutout as its own clip above the shot, aligned to the same source moment, with sticker_outline on, a [COLOR, default white] paper outline about 14 px wide, and size and position set explicitly. Expose Paper outline, Size, Horizontal and Vertical as the main dials and Outline color under Advanced. Propose it for me to review.',
    limitations: ['The outline follows the cutout, so anything the cutout misses, such as a hand or a hat brim, has no outline.', 'Fine hair and motion blur give a slightly soft outline edge.', 'The outline width is fixed in pixels; it does not grow with Size.'],
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
    id: 'FX-MOTION-SKETCH-3D', origin: 'shared', implementation: 'implemented',
    title: '3D Sketch Scene', skill: 'motion-graphics',
    description: 'Any 3D scene you can describe, drawn in ink as it builds, then flown through by the camera: a city, a forest, a product on a plinth, a logo, a map of your street.',
    inputs: [], needs: ['What the scene shows, in words'],
    brings: { step: 'Describe the scene', request: 'to draw [WHAT THE SCENE SHOWS]' },
    prompt: 'Build a 3D Sketch Scene of [WHAT THE SCENE SHOWS], with the camera [FLYING THROUGH / CIRCLING / RISING OVER] it[, landing on WHAT OR WHEN]. Follow the 3D Sketch Scene template in the motion-graphics skill: write a scene.js for my subject from simple shapes (boxes, cylinders, cones, spheres, extruded outlines for logos and letters, ground grids, city and forest generators) and keep the shared engine unchanged. Expose Camera, Camera time, Build time, Density, Height, Wobble and Variation as the main dials, and Detail, Hold, Ink, Paper and Paper fill under Advanced; turn Paper fill off if it should lay over my footage. Propose it for me to review.',
    limitations: ['Everything is built from simple shapes; imported 3D models and photos are not supported, and words are extruded outlines rather than typed text.', 'It draws as ink lines; Looks do not apply to it yet, so restyle it with Ink, Paper, Paper fill and Wobble.', 'Lines are one pixel wide at 1920 × 1080.'],
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
    id: 'FX-CROSS-NEGATIVE', origin: 'shared', implementation: 'implemented',
    title: 'Cross into Negative', skill: 'video-compositing',
    description: 'A cross-shaped window opens over one shot onto the next as a black-and-white negative, then widens to fill the frame.',
    inputs: [], needs: ['Two shots'],
    referenceCredit: DEB_REFERENCE,
    prompt: 'Build Cross into Negative from [SHOT A] into [SHOT B]. Follow the Cross into Negative template in the video-compositing skill: show shot B as a black-and-white negative inside a cross (a bar wipes in from the right, a bar drops from the top), then widen both until the negative fills the frame at the cut. Expose the gap between the bars, contrast and shot B\'s start as controls. Propose it for me to review.',
    limitations: ['The cross widens smoothly; the reference breaks into blocks as it opens.', 'Bar placement and widening are keyframes in the proposal; the card offers the gap between bars, contrast and shot B\'s start.', 'The bars are placed for a 16:9 frame.'],
  },
  {
    id: 'FX-VIDEO-LETTERS', origin: 'shared', implementation: 'implemented',
    title: 'Video Letters', skill: 'video-letters',
    description: 'A big, thick word fills the frame and a video plays only inside its letters.',
    inputs: [], needs: ['A short word', 'A video to show through it'],
    prompt: 'Build Video Letters with the word [WORD] and [VIDEO] playing inside it. Follow the video-letters skill: one native title in heavy block letters (Anton by default) with the video as its fill, using the video\'s prepared preview, on its own text lane above the other layers. Give me Size, Extra time on screen, Animation in, Fill speed and Animation out as controls. Propose it for me to review.',
    limitations: ['Which part of the video shows inside the letters is not a control yet; the video fills the word, centred.', 'Letter spacing is not a control yet; Size sets the word\'s width, up to 300 px at 1080 wide.', 'Thick block fonts read best; thin or script fonts leave too little letter to watch the video through.'],
  },
];

/** A promoted public brief replaces its discovery card, not the retained private files. */
/** A promoted template replaces the creator's own discovery card, but keeps that card's private reference
 * media (example, tutorial, poster, credit) when this profile has it; the shared brief never carries them. */
export function withoutPromotedCopies(effects: GuideEffect[]) {
  const replaced = new Set(promotedRecipes.map(effect => effect.promotedFrom));
  const own = new Map(effects.filter(effect => effect.origin === 'user' && replaced.has(effect.id)).map(effect => [effect.id, effect]));
  return effects.filter(effect => effect.origin !== 'user' || !replaced.has(effect.id)).map(effect => {
    const copy = effect.origin !== 'user' && effect.promotedFrom ? own.get(effect.promotedFrom) : undefined;
    if (!copy) return effect;
    if (effect.video || effect.image) return { ...effect, fromYours: true };
    const { video, tutorialVideo, poster, exampleKind, sourceUrl, credit, ownResultVideo, suppliedVideos, tile } = copy;
    return { ...effect, fromYours: true, video, tutorialVideo, poster, exampleKind, sourceUrl, ...(credit ? { referenceCredit: credit } : {}), ...(ownResultVideo ? { ownResultVideo } : {}), ...(suppliedVideos?.length ? { suppliedVideos } : {}), ...(tile && ownResultVideo ? { tile } : {}) };
  });
}

export function recipeStatusLabel(effect: GuideEffect) {
  if (effect.savedRecipe) return "Saved template · adapt to your footage";
  if (effect.implementation === 'implemented') return 'Implemented template · built with your agent';
  if (effect.status === 'complete') return 'Verified recreation';
  if (effect.status === 'partial') return 'Partial recreation · read limitations';
  if (effect.exampleKind === 'reference' || effect.status === 'candidate') return 'Reference example';
  return effect.video || effect.image ? 'Demonstration · not catalog-verified' : 'Demo not available yet';
}
