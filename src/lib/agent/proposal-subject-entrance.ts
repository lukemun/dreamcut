import { quantizeVisualFrameSpan } from '../timeline/frame-quantization';

/** Proposal dials compile to the same native keyframes for preview and approval. */
type EntranceVisual = { timeline_start?: number; subject_entrance_seconds?: number; subject_flash_seconds?: number; subject_glow_fade_seconds?: number; subject_flash?: number; subject_glow?: number; source_start_seconds?: number; source_end_seconds?: number; playback_rate?: number; transition_keyframes?: Record<string, unknown> };
export function compileProposalSubjectEntrance<T extends {create_visual?: EntranceVisual}>(operation: T): T {
  const v = operation.create_visual;
  if (v?.subject_entrance_seconds === undefined) return operation;
  if (!v.transition_keyframes) throw new Error('Subject entrance must declare transition_keyframes for its mutation budget');
  const start = v.subject_entrance_seconds, flash = v.subject_flash_seconds!, fade = v.subject_glow_fade_seconds!;
  // Use the same frame span as visual creation, including its rounded start.
  // Subtracting handled source times can otherwise put the final key a few
  // floating-point bits beyond the created clip's duration.
  const duration = quantizeVisualFrameSpan(v.timeline_start ?? 0,
    (v.source_end_seconds! - v.source_start_seconds!) / (v.playback_rate ?? 1)).duration;
  if (![start, flash, fade, duration, v.subject_flash, v.subject_glow].every(n => typeof n === 'number' && Number.isFinite(n)) || start < 0 || flash < 1/30 || fade < 1/30 || start + flash + fade > duration + 1e-6) throw new Error('Subject entrance requires complete controls and flash/fade inside the clip');
  const head = start > 0 ? [{t:0,v:0,ease:'hold'}] : [];
  return {...operation, create_visual: {...v, transition_keyframes: {...v.transition_keyframes,
    media_opacity: start > 0 ? [{t:0,v:0,ease:'hold'},{t:start,v:1,ease:'hold'}] : [{t:0,v:1,ease:'hold'},{t:duration,v:1,ease:'hold'}],
    subject_flash:[...head,{t:start,v:v.subject_flash,ease:'hold'},{t:start+flash,v:0,ease:'hold'}],
    subject_glow:[...head,{t:start,v:v.subject_glow,ease:'hold'},{t:start+flash,v:v.subject_glow!*5/9,ease:'linear'},{t:start+flash+fade,v:0,ease:'hold'}],
  }}} as T;
}
