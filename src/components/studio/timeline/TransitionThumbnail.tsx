import type { TimelineTransitionType } from './types';
import { RecordedEffectPreview } from './RecordedEffectPreview';
/** Recorded through the production compositor with the same vertical A/B source pair. */
export function TransitionThumbnail({ type }: { type: TimelineTransitionType }) {
  return <RecordedEffectPreview name={`transition-${type}`} />;
}
