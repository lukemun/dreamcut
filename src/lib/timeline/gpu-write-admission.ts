import type {TimelineElement, TimelineTransition} from '@/components/studio/timeline/types';
import {buildCompositionElements} from '@/lib/render/composition-adapters';
import {buildTimelineTransitionLayout} from './transitions';
import {gpuSceneCapabilityIssues, type GpuCapabilityIssue} from '@/lib/gpu-preview/scene';
import {currentFrameRate} from './frame-rate-scope';

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

/**
 * Server-side preview evidence for media-filled text (the same `runtime_media_fill_preview` the
 * editor payload hydrates). Without it a new video-filled title can never prove its prepared
 * preview, so admission would refuse every one; with it an unverified proxy is still refused.
 */
export type CaptionFillPreparer = (props: Record<string, unknown>) => unknown;

function withCaptionFillEvidence(timeline: TimelineLike, prepare: CaptionFillPreparer): TimelineLike {
  return {...timeline, elements: timeline.elements.map(element => {
    const props = (element.props ?? {}) as Record<string, unknown>;
    if (element.type !== 'caption_text' || typeof props.mediaFillVideoUrl !== 'string' || !props.mediaFillVideoUrl) return element;
    return {...element, props: {...props, runtime_media_fill_preview: prepare(props)}} as TimelineElement;
  })};
}

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

// The issues of a write's base, kept for the last deep-frozen base (the timeline snapshot every pending
// card validates against): validating each option of each card projected the same timeline again.
// Frozen rows cannot change, so the same row objects in the same order, under the same frame rate,
// give the same projection. A base with any unfrozen row is projected every time.
let frozenBase: {elements: readonly TimelineElement[]; transitions: readonly TimelineTransition[]; fps: number; issues: GpuCapabilityIssue[]} | null = null;
const frozenRow = (row: object) => Object.isFrozen(row) && Object.isFrozen((row as {props?: object | null}).props ?? row);
const sameRows = <T>(left: readonly T[], right: readonly T[]) => left.length === right.length && left.every((row, index) => row === right[index]);

function baseIssues(timeline: TimelineLike): GpuCapabilityIssue[] {
  const transitions = timeline.transitions ?? [];
  const fps = currentFrameRate();
  if (frozenBase && frozenBase.fps === fps && sameRows(frozenBase.elements, timeline.elements) && sameRows(frozenBase.transitions, transitions)) return frozenBase.issues;
  const issues = projectedIssues(timeline);
  frozenBase = timeline.elements.every(frozenRow) && transitions.every(frozenRow)
    ? {elements: [...timeline.elements], transitions: [...transitions], fps, issues} : null;
  return issues;
}

function elementLabel(element: TimelineElement | undefined, id: string) {
  const props = (element?.props ?? {}) as Record<string, unknown>;
  const name = [props.label, props.timeline_label, props.text].find(value => typeof value === 'string' && value.trim());
  const kind = element?.type ?? 'element';
  return name ? `${kind} "${String(name).trim().slice(0, 40)}" (${id})` : `${kind} ${id}`;
}

/** Issues present after the write that were not already present on the same (or source) element before it. */
export function gpuWriteAdmissionIssues(before: TimelineLike, after: TimelineLike, prepareCaptionFill?: CaptionFillPreparer): GpuWriteAdmissionIssue[] {
  // Only the written result is prepared: pre-existing issues stay pre-existing, so the cached base is unaffected.
  const afterIssues = projectedIssues(prepareCaptionFill ? withCaptionFillEvidence(after, prepareCaptionFill) : after);
  if (!afterIssues.length) return [];
  const key = (elementId: string, capability: string) => `${elementId}\u0000${capability}`;
  const existing = new Set(baseIssues(before).map(issue => key(issue.elementId, issue.capability)));
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
export function assertGpuWriteAdmissible(before: TimelineLike, after: TimelineLike, context: string, prepareCaptionFill?: CaptionFillPreparer) {
  const issues = gpuWriteAdmissionIssues(before, after, prepareCaptionFill);
  if (issues.length) throw new GpuWriteAdmissionError(issues, context);
}
