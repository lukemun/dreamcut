import type { GuideEffect } from './guide';

/** Creator-facing instructions shared by Library, Guide and the public recipe pages. */
export type CreatorGuide = {
  inputs: { title: string; directions: string }[];
  generation: string;
  steps: string[];
};
const input = (title: string, directions: string) => ({ title, directions });
export const creatorGuides: Record<string, CreatorGuide> = {
  'FX-SPEED-ENTRANCE-EXIT': {
    inputs: [input('Performance footage', 'Use a locked camera and keep the whole subject visible. Record the gesture before each entrance or exit and leave time on both sides.'), input('Matching empty background', 'Record the same scene without the subject, preserving camera position, lighting and framing.')],
    generation: 'Use the reference to plan a fully clothed fictional performer in a fixed scene. Generate clean ordinary motion and a matching background; build the speed movement and blur in DreamCut, not into the generated footage.',
    steps: ['Prepare moving subject masks on the original source clock.', 'Place the subject over the matching empty scene.', 'Animate entrance and exit travel with directional blur; check the full movement and expose timing controls.'],
  },
  'FX-MASK-GLITCH-GLOW': {
    inputs: [input('Ordered pose or performance takes', 'Film several distinct poses with the camera locked, preserving the whole body and hands.'), input('Matching empty background', 'Keep the camera and lighting fixed while recording the scene without the performer.')],
    generation: 'Generate a fictional fully clothed performer with clear separated poses and a stable background. Use the reference for staging; create the flashes, glow and reveal timing as editable DreamCut controls.',
    steps: ['Isolate each subject or pose with source-timed masks.', 'Sequence the subjects over the separate background.', 'Time a brief white flash and optional glow, then restore original color; expose spacing and glow controls.'],
  },
  'FX-MOVING-GRID-MATTE': {
    inputs: [input('Moving subject footage', 'Supply a continuous shot with a clear silhouette and spare space around the moving subject.'), input('Background', 'Choose the separate scene or image visible outside the grid silhouette.')],
    generation: 'Generate an ordinary continuous shot with stable anatomy and framing. Prepare its matching mask, then create the square-cell treatment in DreamCut; do not generate the grid into the footage.',
    steps: ['Prepare a grayscale subject mask covering the complete source interval.', 'Bind the mask to the continuous original clip and enable Moving Grid Matte.', 'Tune cell size, coverage and grid lines while retaining a separate background.'],
  },
  'FX-WORD-SEARCH-TRACE': {
    inputs: [input('Two to four short shots', 'Supply one shot for each word, roughly one to two seconds each. Busy or bright backgrounds still work; the letters carry a soft shadow.'), input('One word per shot', 'Choose a short word for each shot, A to Z only, up to 12 letters. Say if a word should run across, down or diagonally.')],
    generation: 'Shots can be filmed or generated; the letter grid and outlines are made in DreamCut, so never generate them into the footage.',
    steps: ['Hide each word in a letter grid sized to the canvas.', 'Start each outline just after its cut and let it draw around the word.', 'Expose the words, directions, trace timing, letter size and color as controls.'],
  },
  'FX-MOTION-EXPLAINER': {
    inputs: [input('Your title and key point', 'One short title and the single point you want remembered. Name the words in it to mark.'), input('One number', 'The figure that proves the point, with what comes before or after it (%, ×, $) and a short caption.'), input('Three steps and a closing line', 'Three short steps of up to about six words each, and the line to end on.')],
    generation: 'The graphic is built from code in DreamCut, so nothing is generated: no footage, people or imagery. Pick a look (Paper, Keynote, Swiss, Terminal or Chalk) and an accent color, or switch the backdrop off to lay it over your own footage.',
    steps: ['Lay out five scenes in the chosen look and sized to the project.', 'Bring each scene in with the look\'s own motion; mark the key words and count the number up.', 'Expose every word, the number and each scene time as controls.'],
  },
  'FX-MOTION-CHART': {
    inputs: [input('A title', 'Say what is measured, plus an optional subtitle and source note.'), input('Two to six labels and values', 'One label and one number per bar or point, the unit (k, %, $) and which item to highlight. Choose bars or a line.')],
    generation: 'The graphic is built from code in DreamCut, so nothing is generated: no footage, people or imagery. Pick a look (Paper, Keynote, Swiss, Terminal or Chalk) and an accent color, or switch the backdrop off to lay it over your own footage.',
    steps: ['Scale the chart to a rounded maximum and lay it out for the canvas shape.', 'Grow each item in turn while its value counts up, then let the highlighted item stand out.', 'Expose every label, value, unit, highlight and timing as controls.'],
  },
  'FX-MOTION-PLANS': {
    inputs: [input('Plan names and prices', 'Two or three plans with a price each, the currency and what the price is per (month, class).'), input('Up to five features', 'List features from basic to premium and say how many each plan includes. Name the plan to highlight and its badge.')],
    generation: 'The graphic is built from code in DreamCut, so nothing is generated: no footage, people or imagery. Pick a look (Paper, Keynote, Swiss, Terminal or Chalk) and an accent color, or switch the backdrop off to lay it over your own footage.',
    steps: ['Set the plans side by side, or stacked on a tall canvas.', 'Bring the cards in, count up the prices and draw the ticks row by row.', 'Ring the highlighted plan with its badge; expose names, prices, features and timing as controls.'],
  },
  'FX-MOTION-WALKTHROUGH': {
    inputs: [input('Two to four steps', 'A short title and one line of detail for each step, plus a heading.'), input('A screenshot per step (optional)', 'Clear screenshots or pictures, landscape works best. Steps without one show a drawn stand-in screen.')],
    generation: 'Screenshots are your own; the screen, numbers, progress bar and motion are built from code in DreamCut. Pick a look and an accent color.',
    steps: ['Copy each screenshot into the graphic and frame it on a screen.', 'Show one numbered step at a time; slide the next picture in and fill the progress bar.', 'Expose the words, look, step time and change time as controls.'],
  },
  'FX-MOTION-KINETIC': {
    inputs: [input('A short phrase', 'Up to about twelve words. Name any words to show in the accent color.'), input('The beat or word times (optional)', 'An even beat between words, or exact seconds for each word to follow music or speech.')],
    generation: 'The graphic is built from code in DreamCut, so nothing is generated: no footage, people or imagery. Pick a look (Paper, Keynote, Swiss, Terminal or Chalk) and an accent color, or switch the backdrop off to lay it over your own footage.',
    steps: ['Set the phrase to build into lines, or one large word at a time.', 'Land each word on its beat with the chosen landing.', 'Expose the phrase, beat, word times, landing and size as controls.'],
  },
  'FX-MASKING-HOOK': {
    inputs: [input('One shot of a person', 'Supply the shot the video opens on. The person should be clearly separable from the background for the half second before the shot starts; a bright sky behind a white shirt makes a noisy cutout.')],
    generation: 'The shot can be filmed or generated; the cutout and flashes are made in DreamCut, so never generate the flashes into the footage.',
    steps: ['Cut out the person for the half second before the shot starts.', 'Flash the cutout white, then in color, then just the head, 4 frames each on black with one black frame between.', 'Start the shot from the exact source moment the flashes end; expose flash strength, color and color amount.'],
  },
  'FX-CLONE-FLASH': {
    inputs: [input('A still shot of a person', 'Keep the camera still and leave room beside the person. Film a few extra seconds so later moments can supply the copies. A plain, even background hides cutout edges best.')],
    generation: 'A still shot can be generated; keep the background stable. The copies and flashes are made in DreamCut.',
    steps: ['Cut out the person from later in the same take.', 'Place two or three copies beside them on their own lanes.', 'Flash each copy white as it arrives, then let it settle into color; expose each copy\'s position and source moment.'],
  },
  'FX-SILHOUETTE-WINDOW': {
    inputs: [input('A shot of a person', 'A clear silhouette works best: a profile against the sky, or a figure against a plain background.'), input('Several short fill clips', 'Supply clips with strong color or texture; about 0.6 seconds of each is used, in the order you give.')],
    generation: 'Fill clips can be filmed or generated. The window is made in DreamCut from the person\'s cutout.',
    steps: ['Prepare a moving cutout mask of the person.', 'Place the fill clips in order above the shot, each windowed to the person\'s silhouette.', 'Tune edge softness, edge size and window strength.'],
  },
  'FX-LYRIC-POP': {
    inputs: [input('A shot', 'Leave clear space beside the subject for the word.'), input('The word', 'One short word, and the beat or moment it should land on.')],
    generation: 'The shot can be filmed or generated; the word is native editable text, so never generate it into the footage.',
    steps: ['Place the word as native text in DM Serif Display, gold.', 'Spring it on over a quarter second on the beat and hold it about 1.4 seconds.', 'Expose hold, size and spring time.'],
  },
  'FX-CROSS-NEGATIVE': {
    inputs: [input('Two shots', 'Supply the outgoing shot and the shot it cuts to. A shot B with strong light and shadow reads best as a negative.')],
    generation: 'Either shot can be filmed or generated; the cross and negative are made in DreamCut.',
    steps: ['Turn shot B black and white and invert it with a white difference layer.', 'Open a bar from the right and a bar from the top, each showing the negative.', 'Widen both bars until the negative fills the frame at the cut; expose the gap between bars and contrast.'],
  },
  'FX-12': {
    inputs: [input('Shopping footage', 'Supply the shopping clips in order and identify each pickup.'), input('Basket and products', 'Supply a basket image and a clear image of each product. DreamCut can prepare separate cutouts; identify which items should accumulate.')],
    generation: 'A basket or product artwork can be generated. Use consistent perspective and lighting; real product labels need supplied artwork.',
    steps: ['Prepare the basket and product cutouts.', 'Keep the basket in one position across shots and add each product on its pickup.', 'Check that earlier products remain inside the basket.'],
  },
  'FX-14': {
    inputs: [input('Laptop footage', 'Supply a shot with room for a floating screen above the laptop.'), input('Screen content', 'Supply the original screen recording or screenshot and the interval to show.')],
    generation: 'A generic laptop background can be generated. Supply actual screen content when text or interface accuracy matters.',
    steps: ['Fit the screen content above the laptop.', 'Adjust transparency and placement while keeping it readable.', 'Preserve the timing of a moving screen recording.'],
  },
  'FX-06': {
    inputs: [input('Two outfit takes', 'Film the same hand gesture in both outfits with the camera, framing and lighting unchanged. Leave footage before and after the gesture.')],
    generation: 'Paired generated takes may not preserve hands, identity or motion. Filmed matching takes are the more controllable input; inspect any generated pair before planning the cut.',
    steps: ['Find matching points in the hand gesture.', 'Align the body and hand positions, then cut at the gesture peak.', 'Check the movement through the join.'],
  },
  'FX-07': {
    inputs: [input('Two location takes', 'Film a low-angle shoe approach in the first location and retreat in the second. Match direction and apparent shoe size; retain the full approach and retreat.')],
    generation: 'Generated paired motion needs inspection for shoe shape, direction and scale continuity. Matching filmed takes are preferable for an exact join.',
    steps: ['Match the shoe coverage and camera angle.', 'Cut while the shoe obscures the scene.', 'Check that the retreat continues the incoming movement.'],
  },
  'FX-08': {
    inputs: [input('Starting scene', 'Supply one photo or video to begin on.'), input('Destination scene', 'Supply one scene with the objects already in their final arrangement. Identify the objects and their entrance order; DreamCut prepares their cutouts.')],
    generation: 'Either scene can be generated. Generate the destination composition first and extract its objects so their positions match at the handoff.',
    steps: ['Separate the chosen objects from the destination scene.', 'Bring them over the starting scene in the chosen order.', 'Switch to the destination after they land, then flash their silhouettes white.'],
  },
  'FX-11': {
    inputs: [input('Starting and drinks shots', 'Supply the outgoing shot and an incoming shot of hands holding the drinks. Keep hands and cups fully in frame and retain movement around the intended cut.')],
    generation: 'Generated hands and cups must remain consistent across frames. Still images can support a simpler cutout version, but will not recreate moving hands.',
    steps: ['Isolate the moving hands and drinks from the incoming shot.', 'Show those layers over the outgoing shot.', 'Switch the background when the layers align with the incoming picture.'],
  },
  'FX-16': {
    inputs: [input('Walking and restaurant shots', 'Supply the outgoing walk and destination exterior. Identify the signs or lanterns that should appear first; keep them unobstructed in the destination.')],
    generation: 'A restaurant exterior can be generated; exact signs need supplied artwork. Extract reveal pieces from the same exterior so they fit when the scene switches.',
    steps: ['Extract the chosen exterior details.', 'Reveal the pieces over the walk in order.', 'Align them to the exterior, switch scenes and add the requested glitch or flash accent.'],
  },
  'FX-15': {
    inputs: [input('Closing laptop shot', 'Film the lid closing with its moving edge visible throughout the intended wipe. Leave time before and after the action.'), input('Destination shot', 'Supply the scene that should appear behind the lid.')],
    generation: 'The destination can be generated. A generated laptop shot must have a continuous, trackable lid edge; inspect it before using it.',
    steps: ['Track the moving lid edge.', 'Reveal the destination only on the uncovered side.', 'Check the edge and foreground occlusion through the whole wipe.'],
  },
  'FX-02': {
    inputs: [input('Title artwork and scenes', 'Supply the exact title artwork and ordered background shots.'), input('Paper and handoff footage', 'Supply an unfolding paper sequence or ask in chat for a plan. For a handoff into a real card, film the same artwork at the intended size and angle.')],
    generation: 'Paper textures or unfolding frames can be generated, but text, folds and the handoff pose need verification. Keep exact title lettering as supplied artwork.',
    steps: ['Prepare unfolding paper states around the title artwork.', 'Time the unfolding across the selected shots.', 'Match the final paper pose to the filmed card, preserving any hand in front.'],
  },
  'FX-05': {
    inputs: [input('Footage and chapter labels', 'Supply the footage, the exact time and activity text for each chapter, and when each chapter begins and ends.')],
    generation: 'Background footage may be generated. Keep time and activity labels as editable text instead of generating them into the picture.',
    steps: ['Create separate time and activity text layers.', 'Keep their position consistent across chapters.', 'Update the text at each chapter boundary and check legibility.'],
  },
  'FX-10': {
    inputs: [input('Before and after lunch', 'Film both states from the same angle with the plates in matching positions. Leave extra footage around the planned join.')],
    generation: 'Paired images can be generated, but plate placement and viewpoint must match. Inspect the pair before committing to a match cut.',
    steps: ['Choose corresponding frames.', 'Align plate positions and scale.', 'Cut between the food states while retaining the original footage.'],
  },
  'FX-19': {
    inputs: [input('Before and after dinner', 'Film the full and empty bowl from the same viewpoint with the bowl centered in the same place. Leave footage around the join.')],
    generation: 'Paired images can be generated if bowl shape, center and camera angle stay consistent; inspect those details before use.',
    steps: ['Choose matching bowl views.', 'Align center and size.', 'Cut between states and check the visual continuity.'],
  },
  'FX-20': {
    inputs: [input('Background and title', 'Supply the background, exact title and secondary text. Describe what should move away to reveal the title; this reference mechanism is still provisional.')],
    generation: 'The background or covering object can be generated. Keep lettering editable and settle the reveal action before generating assets.',
    steps: ['Agree on the object or action that uncovers the title.', 'Create editable title layers.', 'Build and inspect the reveal; report any departure from the reference.'],
  },
  'FX-SCRATCHPAD': {
    inputs: [input('Artwork', 'Supply a cutout, logo or silhouette. If it has a background, ask in chat to cut it out first.'), input('Border preference', 'Describe the border width and whether the paper edge should look smooth or rough.')],
    generation: 'The base artwork can be generated. Applying the outline should preserve its pixels and pose; the historical example changes pose and is not a fidelity pass.',
    steps: ['Preserve the original artwork.', 'Add a continuous white border with room around the edges.', 'Check corners and crop edges for clipping.'],
  },
  'FX-INVERSE-CAPTIONS': {
    inputs: [input('Background and words', 'Supply the background footage and exact caption text. For speech, supply the original recording; DreamCut prepares reviewed word timing.')],
    generation: 'Background visuals can be generated. Captions remain native text; speech timing comes from the actual recording.',
    steps: ['Prepare caption text and timing.', 'Apply the Inverse Video treatment with the Blue steel option.', 'Check readability over changing backgrounds.'],
  },
  'FX-FILM-BURN': {
    inputs: [input('Two shots', 'Supply both original shots with extra footage around the cut.'), input('Optional burn texture', 'Supply a cleared film-burn texture if you want a particular look; otherwise describe the warmth and strength.')],
    generation: 'An abstract burn texture can be generated if desired. Generation is optional; the flare timing and intensity remain editable.',
    steps: ['Layer a warm flare across the join.', 'Cut near its peak.', 'Fade the flare away to reveal the incoming shot.'],
  },
  'FX-MASK-GLITCH': {
    inputs: [input('Ordered shots', 'Supply the outgoing and incoming footage in order. Identify the subject to appear early; it should have visible, separable edges. DreamCut prepares the matching cutouts.')],
    generation: 'Source scenes can be generated. Derive both the white and original-color subject from the same incoming footage so their silhouettes match.',
    steps: ['Isolate the incoming subject.', 'Show its white silhouette, then its original color over the outgoing shot.', 'Switch to the incoming scene without a gap or positional jump.'],
  },
  'FX-CAMERA-FLASH': {
    inputs: [input('Two shots and cut point', 'Supply the outgoing and incoming shots and identify where the switch should happen.')],
    generation: 'No generated flash asset is needed. Either source shot can be generated separately if desired.',
    steps: ['Build a brief white wash.', 'Switch shots at the flash peak.', 'Clear the wash quickly so the new scene reads.'],
  },
  'FX-BLACKOUT': {
    inputs: [input('Cover and uncover takes', 'End the first take by fully covering the lens. Start the next with the lens covered, then uncover it. Match hand direction and retain the covered portions.')],
    generation: 'Generated takes must actually reach full coverage and keep consistent movement. A simple fade to black is a different treatment from the demonstrated lens-cover join.',
    steps: ['Find full darkness in both takes.', 'Join them while the lens is covered.', 'Check that covering and uncovering feel like one motion.'],
  },
  'FX-WHIP-PAN': {
    inputs: [input('Matching camera turns', 'Supply the full outgoing and incoming shots with camera travel in the same screen direction. Include the incoming turn before the intended start, not only an already-trimmed clip.')],
    generation: 'Generated footage needs real, continuous directional movement and spare frames before the incoming start. Blur alone cannot supply that motion.',
    steps: ['Choose the developed camera turn in the incoming shot.', 'Blend into its moving lead-in frames while matching direction.', 'Tune duration and blur; check that motion continues without a frozen or repeated boundary.'],
  },
  'FX-NEGATIVE-POP': {
    inputs: [input('Subject and background', 'Supply the original image or footage and identify the subject. DreamCut prepares an isolated version and a matching negative.')],
    generation: 'The source can be generated. Derive the negative from that same source rather than generating a second, potentially different subject.',
    steps: ['Isolate the subject and prepare a registered negative.', 'Show the negative briefly.', 'Return to the original color while leaving the background independently editable.'],
  },
  'FX-SCENE-PORTAL': {
    inputs: [input('Host footage', 'Supply footage with a clearly bounded region where the other scene should appear. Keep that region visible through the transition.'), input('Insert and destination', 'Supply the moving insert and destination footage. Describe when the portal should become the full scene; DreamCut prepares tracking and masks.')],
    generation: 'Host or insert footage can be generated. The host needs a stable, trackable region; inspect geometry before attempting the portal.',
    steps: ['Track and mask the chosen region.', 'Fit the moving insert inside it.', 'Coordinate the zoom and full-scene handoff, checking edges throughout.'],
  },
  'layered-paper-cutout': {
    inputs: [input('Portrait', 'Supply one clear portrait with the subject edges visible.'), input('Music and hits', 'Supply the music and identify the hits to emphasize, or ask in chat to suggest them.')],
    generation: 'The portrait or paper textures can be generated. Keep the subject consistent and derive the paper layers from its silhouette.',
    steps: ['Separate the portrait from its background.', 'Build color paper layers behind the subject.', 'Reveal layers back to front on the selected music hits.'],
  },
  'talking-head-cutout': {
    inputs: [input('Original recording', 'Supply the full talking-head video, the section to use and the person to keep. Retain the original audio; do not send only a screenshot.')],
    generation: 'Use the real recording when preserving a speaker and their speech. A generated replacement is a different input and must not silently replace the person.',
    steps: ['Isolate the visible person over the chosen section.', 'Preserve moving hair, hands and clothing edges.', 'Keep the transparent picture synchronized with the original speech.'],
  },
};

export function creatorGuideFor(effect: GuideEffect): CreatorGuide | undefined {
  if (effect.origin === 'user') return undefined;
  return creatorGuides[effect.id ?? effect.skill];
}
