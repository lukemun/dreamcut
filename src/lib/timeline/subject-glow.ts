import { resolveNumberKeyframe } from './keyframes';
export const SUBJECT_GLOW_FIELDS = ['subject_flash', 'subject_glow', 'subject_glow_radius'] as const;
export function boundedEffect(value: unknown, max: number, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(max, value)) : fallback;
}
export function resolveSubjectGlow(props: Record<string, unknown> | null | undefined, seconds: number) {
  const enabled = props?.subject_effect_state !== 'disabled' && props?.subject_effect_state !== 'removed';
  const flashEnabled = props?.subject_flash_state ? props.subject_flash_state === 'enabled' : enabled;
  const glowEnabled = props?.subject_glow_state ? props.subject_glow_state === 'enabled' : enabled && props?.subject_glow_enabled !== false;
  return {
    flash: !flashEnabled ? 0 : boundedEffect(resolveNumberKeyframe(props, 'subject_flash', seconds, boundedEffect(props?.subject_flash, 1)), 1),
    strength: !glowEnabled ? 0 : boundedEffect(resolveNumberKeyframe(props, 'subject_glow', seconds, boundedEffect(props?.subject_glow, 3)), 3),
    radius: boundedEffect(resolveNumberKeyframe(props, 'subject_glow_radius', seconds, boundedEffect(props?.subject_glow_radius, 80, 10)), 80, 10),
  };
}
