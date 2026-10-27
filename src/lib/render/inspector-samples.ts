import { TIMELINE_TRANSITION_TYPES } from '../timeline/contracts';
export const INSPECTOR_SAMPLE_FPS = 30;
export const INSPECTOR_SAMPLE_FRAMES = 31;
/** Eight frames at rest, fifteen frames of treatment, eight frames of result. */
export const inspectorSampleSpecs = [
  ...TIMELINE_TRANSITION_TYPES.map((type, index) => ({name:`transition-${type}`, kind:'transition' as const, type, startFrame:index * 46, endFrame:index * 46 + 31})),
  ...(['flash','glow'] as const).map((type,index) => ({name:`effect-${type}`, kind:'effect' as const, type, startFrame:TIMELINE_TRANSITION_TYPES.length * 46 + index * 31, endFrame:TIMELINE_TRANSITION_TYPES.length * 46 + (index + 1) * 31})),
  // Picture looks are recorded on their own sample photo (scripts/record-look-previews.ts), not the sample project.
  ...(['film','glitch','gradient_map'] as const).map(type => ({name:`look-${type}`, kind:'look' as const, type, startFrame:0, endFrame:31})),
];
