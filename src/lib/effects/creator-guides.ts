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
    steps: ['Prepare moving subject masks on the original source clock.', 'Place the subject over the matching empty scene.', 'Keyframe the cut-out from where the subject is to another place (off frame, or the next marked stop) over a few frames with directional blur; never speed the footage up. Check the full movement and expose a hold per stop.'],
  },
  'FX-SPEED-HOPS-TO-CAMERA': {
    inputs: [input('One locked-off take', 'Use a tripod. Start recording on the empty scene (a clean slate with nobody in it) for a couple of seconds, then walk in, stand still for a moment at each stop, finish in front of the camera, say your line and walk out of frame.'), input('Marks where you stop', 'Mark each stop, and where you finish talking, in Storyboard or on the clip.')],
    generation: 'Use the reference to plan a fully clothed fictional performer in a fixed scene. Generate clean ordinary motion that starts on the empty scene; build the hops, blur and sounds in DreamCut, not into the generated footage.',
    steps: ['Cut you out at each stop and measure when you settle and when you take your next step.', 'Streak a cut-out of you from each stop to the next over a few frames with blur pointed the way you travel, landing standing on the live footage; never speed the footage up.', 'Play your line live, streak you out of frame when you finish, and put a whoosh on every hop. Hold, hop length and blur become dials in time order.'],
  },
  'FX-FLASH-EFFECT': {
    inputs: [input('One locked-off take of your walk to the camera', 'Use a tripod. Start recording on the empty scene for a couple of seconds, then walk from the back of the scene to the camera through several places, and say your line at the camera.'), input('Marks where you flash', 'Optional: mark each pose you want in Storyboard or on the clip. Without marks, six to eight poses are spread along your walk.')],
    generation: 'Use the reference to plan a fully clothed fictional performer walking toward a fixed camera. Generate clean ordinary motion that starts on the empty scene; build the flashes, glow and clicks in DreamCut, not into the generated footage.',
    steps: ['Cut you out at each pose, keeping poses off the frame edge.', 'Show each pose for a few frames over the empty scene, white for its first frame with a glow, with a shutter click on every flash.', 'Play your line live from the last pose. Time per pose, white flash, glow and click volume become dials.'],
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
  'FX-MOTION-SKETCH-3D': {
    inputs: [input('What the scene shows', 'Describe it in words: the objects, roughly where they stand and how big they are, and where the camera should go (fly through, circle or rise) and land. Logos and letters are drawn as extruded outlines.')],
    generation: 'Nothing is generated; the scene is drawn from code in DreamCut. Turn Paper fill off to lay it over your own footage.',
    steps: ['Build the scene from simple 3D shapes and generators (city, forest, ground grid).', 'Draw it in as ink, then move the camera through it.', 'Expose camera, timing, density, height, wobble, ink, paper and paper fill as controls.'],
  },
  'FX-CLONE-CONVERGE': {
    inputs: [input('Lock the camera', 'Film the person stopping in several places, then approaching the camera and saying the line. Keep each stop live for a few extra moments.'), input('Film the empty set', 'Record the same framing and light with nobody in the shot.'), input('Choose the stops and line', 'Say which stops and spoken line to keep. Exact marks help; DreamCut can inspect missing marks.')],
    generation: 'Supply filmed footage for the live movement and speech. DreamCut prepares moving cutouts; generation is not needed.',
    steps: ['Measure usable live stop windows and prepare source-matched moving cutouts.', 'Flash the waiting copies into place over the empty set, then bring in the live foreground.', 'Rush every background copy behind the foreground on the same frame, with linked shutters, movement sounds and one impact.', 'Leave a live beat before the original speech; expose timing and sound controls and verify timing extremes.'],
  },
  'FX-CLONE-FLASH': {
    inputs: [input('A still shot of a person', 'Keep the camera still and leave room beside the person. Film a few extra seconds so later moments can supply the copies. A plain, even background hides cutout edges best.')],
    generation: 'A still shot can be generated; keep the background stable. The copies and flashes are made in DreamCut.',
    steps: ['Cut out the person from later in the same take.', 'Place two or three copies beside them on their own lanes.', 'Flash each copy white as it arrives, with Camera 02 Shutter Click attached to its entrance.', 'Keep each shutter linked to its copy; expose position, source moment and shutter volume, including mute. The visual demo stays silent.'],
  },
  'FX-PAPER-CUTOUT': {
    inputs: [input('A shot with the subject', 'Film the person moving freely with a little space around them, against a background that differs from their clothes and hair. Keep them in view for the whole moment; if several people appear, say who to cut out.')],
    generation: 'The shot can be generated. The moving cutout and the paper outline are made in DreamCut.',
    steps: ['Cut out the subject from the shot under the mark, following them as they move.', 'Place the cutout over the shot on the same moment, with a thick paper outline.', 'Expose the outline width, size, position and outline color.'],
  },
  'FX-SILHOUETTE-WINDOW': {
    inputs: [input('A shot of a person', 'A clear silhouette works best: a profile against the sky, or a figure against a plain background.'), input('Several short fill clips', 'Supply clips with strong color or texture; about 0.6 seconds of each is used, in the order you give.')],
    generation: 'Fill clips can be filmed or generated. The window is made in DreamCut from the person\'s cutout.',
    steps: ['Prepare a moving cutout mask of the person.', 'Place the fill clips in order above the shot, each windowed to the person\'s silhouette.', 'Tune edge softness, edge size and window strength.'],
  },
  'FX-VIDEO-LETTERS': {
    inputs: [input('A short word', 'One short word reads best: the bigger the letters, the more of the video shows.'), input('A video', 'Supply the clip to play inside the letters. Busy, colourful footage reads best; the video fills the word, centred.')],
    generation: 'The video can be filmed or generated; the letters are made in DreamCut as editable text.',
    steps: ['Set the word in heavy block letters.', 'Fill the letters with the video, playing in step with the edit.', 'Tune the size, how long it stays on screen and how it fades in and out.'],
  },
  'FX-CROSS-NEGATIVE': {
    inputs: [input('Two shots', 'Supply the outgoing shot and the shot it cuts to. A shot B with strong light and shadow reads best as a negative.')],
    generation: 'Either shot can be filmed or generated; the cross and negative are made in DreamCut.',
    steps: ['Turn shot B black and white and invert it with a white difference layer.', 'Open a bar from the right and a bar from the top, each showing the negative.', 'Widen both bars until the negative fills the frame at the cut; expose the gap between bars and contrast.'],
  },
  'FX-MASK-GLITCH': {
    inputs: [input('Ordered shots', 'Supply the outgoing and incoming footage in order. Identify the subject to appear early; it should have visible, separable edges. DreamCut prepares the matching cutouts.')],
    generation: 'Source scenes can be generated. Derive both the white and original-color subject from the same incoming footage so their silhouettes match.',
    steps: ['Isolate the incoming subject.', 'Show its white silhouette, then its original color over the outgoing shot.', 'Switch to the incoming scene without a gap or positional jump.'],
  },
  'layered-paper-cutout': {
    inputs: [input('Portrait', 'Supply one clear portrait with the subject edges visible.'), input('Music and hits', 'Supply the music and identify the hits to emphasize, or ask in chat to suggest them.')],
    generation: 'The portrait or paper textures can be generated. Keep the subject consistent and derive the paper layers from its silhouette.',
    steps: ['Separate the portrait from its background.', 'Build color paper layers behind the subject.', 'Reveal layers back to front on the selected music hits.'],
  },
  'talking-head-cutout': {
    inputs: [input('Photo or video', 'Supply the photo, or the full video with the section to use, and the subject to keep. For video, retain the original audio; do not send only a screenshot.')],
    generation: 'Use the real recording when preserving a subject and its sound. A generated replacement is a different input and must not silently replace the subject.',
    steps: ['Isolate the visible subject over the chosen section.', 'Preserve moving hair, hands and fine edges.', 'Keep the transparent picture synchronized with the original sound.'],
  },
};

export function creatorGuideFor(effect: GuideEffect): CreatorGuide | undefined {
  if (effect.origin === 'user') return undefined;
  return creatorGuides[effect.id ?? effect.skill];
}
