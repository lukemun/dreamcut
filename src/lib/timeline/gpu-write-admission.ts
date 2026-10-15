import type {TimelineElement, TimelineTransition} from '@/components/studio/timeline/types';
import {buildCompositionElements} from '@/lib/render/composition-adapters';
import {buildTimelineTransitionLayout} from './transitions';
import {gpuSceneCapabilityIssues, type GpuCapabilityIssue} from '@/lib/gpu-preview/scene';

/**
 * GPU-first write admission (docs/architecture/playback-rendering.md#gpu-first-feature-rule).
 * Agent-authored writes (proposal options and agent_workspace direct mutations) must not
 * introduce anything Browser GPU (CanvasKit) cannot draw. Only issues the write adds are
 * reported, so legacy content already on the timeline never blocks an unrelated edit.
 */

/** Media preparation state is checked separately, and preview proxies prepare automatically. */
const IGNORED_CAPABILITIES = new Set(['source']);
const MEDIA_SCOPE = 'agent-write-admission';

type TimelineLike = {elements: readonly TimelineElement[]; transitions?: readonly TimelineTransition[]};
export type GpuWriteAdmissionIssue = GpuCapabilityIssue & {label: string};

function projectedIssues(timeline: TimelineLike): GpuCapabilityIssue[] {
  // Same projection the editor and export use: live transitions, outline ownership,
  // cutout effects. Muted lanes stay in scope: muting is a review choice, not a fix.
  const layout = buildTimelineTransitionLayout(
    timeline.elements.filter(element => !element.removed_at),
    (timeline.transitions ?? []) as TimelineTransition[],
  );
  return gpuSceneCapabilityIssues(buildCompositionElements(layout.renderedElements, new Set()), MEDIA_SCOPE, 'canvaskit')
    .filter(issue => !IGNORED_CAPABILITIES.has(issue.capability));
}

function elementLabel(element: TimelineElement | undefined, id: string) {
  const props = (element?.props ?? {}) as Record<string, unknown>;
  const name = [props.label, props.timeline_label, props.text].find(value => typeof value === 'string' && value.trim());
  const kind = element?.type ?? 'element';
  return name ? `${kind} "${String(name).trim().slice(0, 40)}" (${id})` : `${kind} ${id}`;
}

/** Issues present after the write that were not already present on the same (or source) element before it. */
export function gpuWriteAdmissionIssues(before: TimelineLike, after: TimelineLike): GpuWriteAdmissionIssue[] {
  const afterIssues = projectedIssues(after);
  if (!afterIssues.length) return [];
  const key = (elementId: string, capability: string) => `${elementId}\u0000${capability}`;
  const existing = new Set(projectedIssues(before).map(issue => key(issue.elementId, issue.capability)));
  const beforeIds = new Set(before.elements.map(element => element.id));
  const afterById = new Map(after.elements.map(element => [element.id, element]));
  return afterIssues.filter(issue => {
    if (existing.has(key(issue.elementId, issue.capability))) return false;
    // A split or duplicate of legacy content inherits its source's pre-existing gaps.
    const element = afterById.get(issue.elementId);
    if (element && !beforeIds.has(element.id)) {
      const props = (element.props ?? {}) as Record<string, unknown>;
      for (const origin of [props.split_from_id, props.duplicated_from_id]) {
        if (typeof origin === 'string' && existing.has(key(origin, issue.capability))) return false;
      }
    }
    return true;
  }).map(issue => ({...issue, label: elementLabel(afterById.get(issue.elementId), issue.elementId)}));
}

export class GpuWriteAdmissionError extends Error {
  readonly status = 422;
  readonly code = 'GPU_ADMISSION_REJECTED';
  constructor(readonly issues: GpuWriteAdmissionIssue[], context: string) {
    super(`${context} rejected: ${issues.map(issue =>
      `${issue.label} uses ${issue.capability}, which Browser GPU cannot draw yet (${issue.reason}); use a supported alternative or extend the GPU renderer first`,
    ).join('; ')}.`);
    this.name = 'GpuWriteAdmissionError';
  }
}

/** Throw a 422 naming every element/capability the write would push off the Browser GPU path. */
export function assertGpuWriteAdmissible(before: TimelineLike, after: TimelineLike, context: string) {
  const issues = gpuWriteAdmissionIssues(before, after);
  if (issues.length) throw new GpuWriteAdmissionError(issues, context);
}
