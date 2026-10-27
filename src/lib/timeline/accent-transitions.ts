import type { TimelineTransitionType, TimelineTransitionParams } from '@/components/studio/timeline/types';
import { resolveTransitionNumber } from './transition-controls';
export const ACCENT_TRANSITIONS = ['film_burn', 'camera_flash', 'blackout'] as const;
export function isAccentTransition(type: string | null | undefined) {
  return (ACCENT_TRANSITIONS as readonly string[]).includes(type ?? '');
}
/** Frame-derived wash with a fully covered midpoint and bounded hold. The picture
 * switches at that midpoint; clip timing and source handles remain unchanged. */
export function accentTransitionFrame(type: TimelineTransitionType, progress: number, params?: TimelineTransitionParams | null) {
  const p = Math.max(0, Math.min(1, progress));
  const hold = resolveTransitionNumber(params, 'params.accent_hold');
  const ramp = Math.max(.05, (1 - hold) / 2);
  const envelope = Math.min(1, p / ramp, (1 - p) / ramp);
  const strength = resolveTransitionNumber(params, 'params.accent_strength');
  const warm = type === 'film_burn';
  return {
    incomingOpacity: p >= .5 ? 1 : 0,
    washOpacity: Math.max(0, envelope) * strength,
    background: warm
      ? `linear-gradient(${75 + p * 35}deg, #e95813 0%, #ffb84c 23%, #fff9da 48%, #fffefa 62%, #f98027 100%)`
      : type === 'blackout' ? '#000000' : '#ffffff',
  };
}
