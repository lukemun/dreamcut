import {
  collectKeyframeTimes,
  keyframeValuesAtTime,
  readKeyframeMap,
  type KeyframeEase,
  type KeyframeValue,
} from "./keyframes";
import { readVolumeEnvelopePoints } from "./volume-envelope";

export const VOLUME_ENVELOPE_FIELD = "volume_envelope";
const TIME_EPSILON = 0.001;

export type AutomationElement = {
  props?: Record<string, unknown> | null;
  volume?: unknown;
  duration: number;
};

export type AutomationValue = {
  field: string;
  value: KeyframeValue;
  ease: KeyframeEase;
  interpolationLocked?: boolean;
};

export function hasPersistedVolumeAutomation(element: AutomationElement) {
  const raw = element.props?.volume_envelope;
  return Array.isArray(raw) && raw.length >= 2;
}

export function volumeAutomationPointIndexAtTime(element: AutomationElement, timeSeconds: number) {
  if (!hasPersistedVolumeAutomation(element)) return -1;
  return readVolumeEnvelopePoints(element, element.duration).findIndex(
    (point) => Math.abs(point.time_seconds - timeSeconds) <= TIME_EPSILON,
  );
}

/** Project every editable automation authority into one Inspector view. Writes
 * still go back to their native schemas; this function does not conflate them. */
export function collectElementAutomationTimes(element: AutomationElement) {
  const genericFields = Object.keys(readKeyframeMap(element.props));
  const genericTimes = collectKeyframeTimes(element.props, genericFields, element.duration);
  const volumeTimes = hasPersistedVolumeAutomation(element)
    ? readVolumeEnvelopePoints(element, element.duration).map((point) => point.time_seconds)
    : [];
  return [...new Set([...genericTimes, ...volumeTimes])].sort((a, b) => a - b);
}

export function elementAutomationValuesAtTime(element: AutomationElement, timeSeconds: number): AutomationValue[] {
  const values: AutomationValue[] = keyframeValuesAtTime(element.props, timeSeconds);
  const volumePointIndex = volumeAutomationPointIndexAtTime(element, timeSeconds);
  if (volumePointIndex >= 0) {
    values.push({
      field: VOLUME_ENVELOPE_FIELD,
      value: readVolumeEnvelopePoints(element, element.duration)[volumePointIndex]!.volume,
      ease: "linear",
      interpolationLocked: true,
    });
  }
  return values;
}

export function hasElementAutomationMoments(element: AutomationElement) {
  return collectElementAutomationTimes(element).length > 0;
}
