// Creator features inside proposal_create, as capability_catalog search entries.
//
// The feature list is derived, not hand-kept: operation kinds, `patch` fields and
// top-level `props` come from the published proposal schema (mcp/proposal-schema.json),
// labels come from the control registries (src/lib/timeline/effect-controls.ts and
// src/lib/agent/proposal-controls.ts via mcp/feature-labels.json), and descriptions come
// from the schema itself. FEATURE_VOCABULARY only adds creator wording to features that
// already exist; a key that names no derived feature fails the test.
//
// Regenerate the label snapshot after changing either control registry:
//   node --import tsx mcp/generate-feature-labels.ts --write
import fs from 'node:fs';

const read = relative => JSON.parse(fs.readFileSync(new URL(relative, import.meta.url), 'utf8'));
export const FEATURE_CAPABILITY = 'proposal-authoring';
export const FEATURE_TOOL = 'proposal_create';
const OPERATION = 'proposal.options[].operations[]';
const OPTION = 'proposal.options[]';
// Operation keys that are not features of their own: addressing, generic containers
// (indexed field by field below) and free text.
const NOT_FEATURES = new Set(['element_id', 'patch', 'props', 'clear_patch', 'clear_props', 'rationale']);
export const SEARCH_TEXT = Symbol('feature search text');

/**
 * Creator wording for derived features, keyed by feature path below `operations[]`
 * (or `timing_controls`). Prefer phrases a creator types over field names; labels and
 * field names are already searchable.
 */
export const FEATURE_VOCABULARY = {
  source_range_cut: ['cut out silence', 'remove silence', 'silence', 'silent part', 'dead air', 'remove pause', 'pause', 'pauses', 'cut a section', 'remove a section', 'delete part', 'remove part', 'ripple delete', 'jump cut', 'tighten'],
  source_range_restore: ['restore a cut', 'put back removed part', 'uncut'],
  speed_change: ['speed up talking', 'talk faster', 'speed up everything', 'faster pace', 'slow everything down', 'speed up the whole video'],
  remove_visual: ['delete clip', 'remove clip', 'remove shot', 'delete part'],
  remove_text: ['delete text', 'remove title'],
  create_text: ['add text', 'add title', 'title', 'title card', 'lower third', 'headline', 'name tag', 'on screen text', 'text overlay'],
  create_visual: ['add clip', 'add image', 'insert footage', 'b roll', 'picture in picture', 'pip', 'overlay', 'inset video'],
  create_audio: ['add music', 'add song', 'background music', 'add sound effect', 'sfx', 'voiceover'],
  create_transition: ['add transition', 'transition', 'crossfade', 'dissolve', 'whip pan', 'wipe', 'page turn', 'film burn', 'camera flash', 'dip to black'],
  set_lane_order: ['bring to front', 'send to back', 'reorder layers', 'layer order', 'move layer up', 'move layer down', 'mute track', 'mute lane', 'stacking order'],
  set_output_format: ['aspect ratio', 'vertical', 'make vertical', 'portrait', 'landscape', 'widescreen', '9 16', '16 9', '4 5', 'tiktok', 'reels', 'shorts', 'instagram', 'resize for', 'reformat', 'output format'],
  opening_sequence_edit: ['cut the intro', 'trim the opening', 'remove opening', 'punch in', 'tighten the start'],
  use_recast: ['recast', 'recast this clip', 'replace the people', 'swap the person', 'swap the face', 'put me in this shot', 'replace the singer', 'face swap'],
  use_video_stabilization: ['stabilize', 'stabilise', 'stabilization', 'shaky', 'shaky footage', 'shake', 'camera shake', 'steady', 'steady footage', 'smooth motion', 'lock camera'],
  use_voice_enhancement: ['clean up voice', 'clean voice', 'voice cleanup', 'enhance voice', 'enhance audio', 'enhance speech', 'background noise', 'remove noise', 'noise', 'denoise', 'noise reduction', 'hiss', 'hum', 'clearer voice'],
  reattach_original_audio: ['original audio', 'restore original sound'],
  sync_speech_visual: ['lip sync', 'sync picture to speech'],
  replace_captions: ['edit captions', 'restyle captions', 'caption font', 'fix caption text'],
  'patch.playback_rate': ['slow down', 'slow motion', 'slowmo', 'speed up', 'faster', 'slower', 'playback speed', 'speed'],
  'patch.volume': ['volume', 'quieter', 'louder', 'turn down', 'turn up', 'lower volume', 'gain', 'level'],
  'patch.fade_in': ['fade in', 'fade up', 'fade music', 'fade audio'],
  'patch.fade_out': ['fade out', 'fade down', 'fade music', 'fade audio'],
  'patch.trim_start': ['trim', 'trim start', 'trim clip', 'shorten clip', 'cut the beginning'],
  'patch.trim_end': ['trim', 'trim end', 'trim clip', 'shorten clip', 'cut the ending'],
  'patch.timeline_start': ['move clip', 'shift clip', 'nudge', 'start later', 'start earlier'],
  'patch.duration': ['lengthen', 'make longer', 'make shorter', 'extend clip', 'hold longer'],
  'patch.lane_key': ['move to another track', 'change track'],
  'props.volume_envelope': ['duck music', 'ducking', 'duck under voice', 'duck', 'volume automation', 'volume curve', 'dip music', 'fade music'],
  'props.playback_speed_steps': ['speed ramp', 'variable speed', 'speed curve', 'slow down part', 'slow motion'],
  'props.playback_reverse': ['reverse', 'play backward', 'play in reverse', 'rewind'],
  'props.chroma_key_color': ['green screen', 'blue screen', 'chroma key', 'key out green', 'keying'],
  'props.grade_temperature': ['warmer', 'cooler', 'warm', 'cool', 'white balance', 'color temperature', 'color grade', 'colour grade'],
  'props.grade_exposure_ev': ['brighten', 'brighter', 'darken', 'darker', 'too dark', 'too bright', 'color grade', 'color correct'],
  'props.grade_saturation': ['saturation', 'saturate', 'more colorful', 'desaturate', 'black and white', 'vibrance', 'color grade'],
  'props.grade_contrast': ['punchier', 'flat', 'color grade'],
  'props.grade_hue_degrees': ['hue shift', 'shift colors'],
  'props.media_scale': ['zoom in', 'zoom out', 'zoom', 'scale up', 'bigger', 'smaller', 'enlarge'],
  'props.media_scale_keyframes': ['ken burns', 'slow zoom', 'animated zoom', 'push in'],
  'props.transition_keyframes': ['ken burns', 'keyframes', 'animate position', 'pan and zoom'],
  'props.media_offset_x': ['move left', 'move right', 'reposition', 'pan'],
  'props.media_offset_y': ['move up', 'move down', 'reposition'],
  'props.media_mirror': ['flip', 'flip horizontally', 'flip vertically', 'mirror'],
  'props.media_orientation': ['rotate', 'rotation', 'turn sideways', 'rotate 90'],
  'props.mask_inset': ['crop', 'crop edges', 'letterbox', 'trim edges'],
  'props.semanticLayout': ['top left', 'top right', 'bottom left', 'bottom right', 'move to corner', 'corner', 'position', 'placement', 'picture in picture', 'layout'],
  'props.positionPreset': ['lower third', 'text position'],
  'props.animationIn': ['text animation', 'animate in', 'entrance animation', 'intro animation'],
  'props.animationOut': ['text animation', 'animate out', 'exit animation', 'outro animation'],
  'props.subject_glow': ['glow', 'glow around subject', 'halo', 'subject glow'],
  'props.gradient_map_amount': ['thermal', 'thermal camera', 'thermal look', 'heat map', 'heat vision', 'infrared', 'false color', 'gradient map', 'color map', 'thermal flash'],
  'props.gradient_map_contrast': ['thermal contrast', 'color map contrast', 'punchier thermal'],
  'props.gradient_map_shadows': ['thermal colors', 'shadow color', 'color map colors', 'gradient colors'],
  'props.gradient_map_midtones': ['thermal colors', 'midtone color', 'color map colors', 'gradient colors'],
  'props.gradient_map_highlights': ['thermal colors', 'highlight color', 'color map colors', 'gradient colors'],
  'props.glitch_amount': ['glitch', 'glitch effect', 'digital glitch', 'datamosh', 'glitch burst', 'rgb split', 'chromatic aberration', 'pixel sort', 'corrupted video', 'distortion'],
  'props.glitch_block_size': ['glitch blocks', 'bigger glitch blocks', 'glitch bands'],
  'props.glitch_shift': ['glitch shift', 'glitch displacement', 'shift sideways'],
  'props.glitch_rgb_split': ['rgb split', 'color split', 'chromatic aberration', 'channel split'],
  'props.glitch_smear': ['pixel smear', 'datamosh smear', 'pixel sort', 'smear'],
  'props.glitch_rate': ['glitch speed', 'faster glitch', 'glitch flicker'],
  'props.glitch_seed': ['glitch pattern', 'different glitch', 'reroll glitch'],
  'props.film_grain': ['film grain', 'grain', 'film look', 'filmic', 'shot on film', '35mm', '16mm', 'kodak', 'analog look', 'noise texture'],
  'props.film_grain_size': ['grain size', 'coarser grain', 'finer grain', '16mm grain'],
  'props.film_halation': ['halation', 'red glow', 'film halation', 'glow around lights', 'cinestill'],
  'props.film_halation_radius': ['halation spread', 'wider halation'],
  'props.film_bloom': ['bloom', 'glow', 'dreamy glow', 'diffusion', 'pro mist', 'soft glow', 'highlight glow'],
  'props.film_bloom_radius': ['bloom spread', 'wider glow'],
  'props.film_glow_threshold': ['glow threshold', 'more glow', 'less glow'],
  'props.film_vignette': ['vignette', 'dark corners', 'darker edges', 'frame the subject'],
  'props.film_vignette_size': ['vignette size', 'tighter vignette'],
  'props.film_vignette_softness': ['vignette softness', 'softer vignette'],
  'props.film_split_tone': ['split tone', 'split toning', 'teal and orange', 'orange and teal', 'tinted shadows', 'cinematic color'],
  'props.film_split_shadow_hue': ['shadow tint', 'teal shadows', 'blue shadows'],
  'props.film_split_highlight_hue': ['highlight tint', 'warm highlights', 'golden highlights'],
  'props.film_split_balance': ['split tone balance'],
  'props.edge_aura': ['aura', 'edge glow'],
  'props.media_opacity': ['transparency', 'see through', 'translucent'],
  'props.fontPreset': ['font', 'typeface'],
  'props.textColor': ['text color', 'font color'],
  timing_controls: ['freeze frame', 'freeze', 'hold frame', 'hold on frame', 'hold last frame', 'hold', 'spacing between entrances', 'stagger'],
};

const words = value => String(value).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_.[\]-]+/g, ' ').trim();
const firstSentence = text => typeof text === 'string' ? text.split(/(?<=\.)\s/)[0].slice(0, 240) : undefined;
const childVocabulary = schema => Object.entries(schema?.properties ?? {}).flatMap(([name, child]) => [name, ...(Array.isArray(child?.enum) ? child.enum.filter(value => typeof value === 'string') : [])]);

/** Feature entries for catalog search. Pure: callers pass the schema, labels and vocabulary. */
export function featureEntries({ schema = read('./proposal-schema.json'), labels = read('./feature-labels.json').labels, vocabulary = FEATURE_VOCABULARY } = {}) {
  const option = schema.properties?.options?.items?.properties ?? {};
  const operation = option.operations?.items?.properties ?? {};
  const entry = (key, path, node, name, extra = []) => {
    const aliases = [...new Set([...(labels[key.split('.').at(-1)] ?? []), ...(vocabulary[key] ?? [])])];
    const result = { kind: 'feature', id: `feature:${key}`, name, capability: FEATURE_CAPABILITY, tool: FEATURE_TOOL, field_path: path,
      ...(node.description ? { description: firstSentence(node.description) } : {}), search_aliases: aliases };
    Object.defineProperty(result, SEARCH_TEXT, { value: [words(key), node.description ?? '', ...extra.map(words)].join(' ') });
    return result;
  };
  const entries = [];
  for (const [kind, node] of Object.entries(operation)) {
    if (NOT_FEATURES.has(kind) || node?.type !== 'object') continue;
    entries.push(entry(kind, `${OPERATION}.${kind}`, node, `${words(kind)} operation`, childVocabulary(node)));
  }
  for (const container of ['patch', 'props']) for (const [field, node] of Object.entries(operation[container]?.properties ?? {})) {
    const key = `${container}.${field}`;
    entries.push(entry(key, `${OPERATION}.${key}`, node, labels[field]?.[0] ?? words(field), childVocabulary(node)));
  }
  if (option.timing_controls) entries.push(entry('timing_controls', `${OPTION}.timing_controls[]`, option.timing_controls, 'timing controls', childVocabulary(option.timing_controls.items)));
  return entries;
}

/** The sub-schema at a feature path, so `get` on a feature returns its shape, not the whole proposal. */
export function featureSchema(path, schema = read('./proposal-schema.json')) {
  let node = { properties: { proposal: schema } };
  for (const part of path.split('.')) {
    node = node?.properties?.[part.replace(/\[\]$/, '')];
    if (part.endsWith('[]')) node = node?.items;
    if (!node) return null;
  }
  return node;
}
