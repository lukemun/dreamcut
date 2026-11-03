import { readKeyframeMap, removeKeyframes } from './keyframes';
import { SUBJECT_GLOW_FIELDS } from './subject-glow';

type Props = Record<string, unknown>;
/** Presence is independent of the value at the playhead (a pulse often resolves to zero). */
export function hasMaskGlitch(props: Props) {
  if (props.subject_effect_state === 'removed') return false;
  return props.subject_effect_state === 'enabled' || props.subject_effect_state === 'disabled'
    || SUBJECT_GLOW_FIELDS.some(field => Number(props[field] ?? 0) !== 0 || !!readKeyframeMap(props)[field]);
}
export function hasSubjectGlow(props: Props) {
  if (typeof props.subject_glow_enabled === 'boolean') return props.subject_glow_enabled;
  return Number(props.subject_glow ?? 0) > 0 || !!readKeyframeMap(props).subject_glow;
}
export function maskGlitchPreset(props: Props, glow: boolean) {
  return {
    subject_effect_state: 'enabled', subject_flash: 0,
    subject_glow_enabled: glow, subject_glow: 0, subject_glow_radius: 18,
    keyframes: { ...readKeyframeMap(removeKeyframes(props, SUBJECT_GLOW_FIELDS)),
      subject_flash: [{ t: 0, v: 1, ease: 'hold' }, { t: 0.067, v: 0, ease: 'hold' }],
      subject_glow: [{ t: 0, v: 1.8 }, { t: 0.133, v: 0 }],
    },
  };
}
export function removeMaskGlitch(props: Props) {
  return { subject_effect_state: 'removed', subject_flash: 0, subject_glow: 0,
    subject_glow_radius: 10, subject_glow_enabled: false,
    keyframes: removeKeyframes(props, SUBJECT_GLOW_FIELDS).keyframes ?? {} };
}

export type SubjectEffect = 'flash' | 'glow';
const effectFields = { flash: ['subject_flash'], glow: ['subject_glow', 'subject_glow_radius'] } as const;
export function subjectEffectState(props: Props, effect: SubjectEffect): 'enabled' | 'disabled' | 'removed' {
  const explicit = props[`subject_${effect}_state`];
  if (explicit === 'enabled' || explicit === 'disabled' || explicit === 'removed') return explicit;
  if (props.subject_effect_state === 'removed') return 'removed';
  const field = effect === 'flash' ? 'subject_flash' : 'subject_glow';
  const present = Number(props[field] ?? 0) !== 0 || !!readKeyframeMap(props)[field]
    || (effect === 'flash' && ['enabled', 'disabled'].includes(String(props.subject_effect_state)))
    || (effect === 'glow' && props.subject_glow_enabled === true);
  if (!present || (effect === 'glow' && props.subject_glow_enabled === false && props.subject_effect_state !== 'disabled')) return 'removed';
  return props.subject_effect_state === 'disabled' || (effect === 'glow' && props.subject_glow_enabled === false) ? 'disabled' : 'enabled';
}
export function setSubjectEffectEnabled(props: Props, effect: SubjectEffect, enabled: boolean) {
  return { [`subject_${effect}_state`]: enabled ? 'enabled' : 'disabled' };
}
export function subjectEffectPreset(props: Props, effect: SubjectEffect) {
  return { [`subject_${effect}_state`]: 'enabled',
    ...(effect === 'flash' ? { subject_flash: 1 } : { subject_glow: 1.8, subject_glow_radius: 18 }),
    keyframes: removeKeyframes(props, effectFields[effect]).keyframes ?? {},
  };
}
export function removeSubjectEffect(props: Props, effect: SubjectEffect) {
  return { [`subject_${effect}_state`]: 'removed',
    ...(effect === 'flash' ? { subject_flash: 0 } : { subject_glow: 0, subject_glow_radius: 10 }),
    keyframes: removeKeyframes(props, effectFields[effect]).keyframes ?? {},
  };
}
