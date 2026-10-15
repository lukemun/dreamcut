import type {TimelineElement, TimelineTransition} from '../../components/studio/timeline/types';
import {buildCompositionElements} from '../render/composition-adapters';
import {buildTimelineTransitionLayout} from '../timeline/transitions';
import {gpuSceneCapabilityIssues,type GpuDrawingEngine} from './scene';

/** Read-only working-cut inventory. A saved timeline is not yet a composition:
 * live transitions, outline ownership, disabled actors and muted lanes must be
 * projected through the same owners used by the editor before checking coverage.
 * A clean inventory establishes admission only, never visual/performance parity.
 */
export function gpuTimelineCapabilityInventory(
  elements: TimelineElement[], transitions: TimelineTransition[], mediaScope: string,
  mutedLanes = new Set<string>(), engine:GpuDrawingEngine='webgpu', hiddenLanes = new Set<string>(),
) {
  const layout = buildTimelineTransitionLayout(elements.filter(element => !element.removed_at), transitions);
  const composition = buildCompositionElements(layout.renderedElements, mutedLanes, hiddenLanes);
  const issues = gpuSceneCapabilityIssues(composition, mediaScope, engine);
  const counts: Record<string, number> = {};
  for (const issue of issues) counts[issue.capability] = (counts[issue.capability] ?? 0) + 1;
  const renderedIds = new Set(composition.map(element => element.id));
  const transitionCounts: Record<string, number> = {};
  for (const chip of layout.transitionChips) {
    if (!renderedIds.has(chip.from_element_id) || !renderedIds.has(chip.to_element_id)) continue;
    transitionCounts[chip.type] = (transitionCounts[chip.type] ?? 0) + 1;
  }
  return {engine,actorCount: composition.length, issueCount: issues.length, counts, transitionCounts, issues};
}
