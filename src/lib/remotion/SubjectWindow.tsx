'use client';
import { useEffect, useLayoutEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { AbsoluteFill, useCurrentFrame, useRenderResource, useVideoConfig } from '@/lib/frame-runtime';
import {
  hasSubjectWindowBinding, subjectWindowAlpha, subjectWindowEmptyAlpha, subjectWindowPlanAtFrame, subjectWindowRgba,
  type SubjectWindowPlan,
} from '@/lib/timeline/subject-window';
import { loadMask } from './GridMatte';

type WindowImage = { key: string; url: string };
const imageCache = new Map<string, Promise<WindowImage>>();

/** Same alpha bytes the CanvasKit path uploads (timeline/subject-window.ts), as a PNG mask image. */
function windowImage(plan: SubjectWindowPlan): Promise<WindowImage> {
  const key = JSON.stringify(plan);
  const cached = imageCache.get(key);
  if (cached) { imageCache.delete(key); imageCache.set(key, cached); return cached; }
  const promise = (async () => {
    const pixels = await loadMask(plan.url!);
    const rgba = subjectWindowRgba(subjectWindowAlpha(plan, pixels));
    const canvas = document.createElement('canvas');
    canvas.width = plan.gridWidth; canvas.height = plan.gridHeight;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Subject window canvas unavailable');
    context.putImageData(new ImageData(rgba, plan.gridWidth, plan.gridHeight), 0, 0);
    const url = canvas.toDataURL('image/png');
    canvas.width = 1; canvas.height = 1;
    // Decode before the frame settles so the CSS mask paints this frame's window.
    const image = new Image(); image.src = url; await image.decode();
    return { key, url };
  })();
  imageCache.set(key, promise);
  promise.catch(() => { if (imageCache.get(key) === promise) imageCache.delete(key); });
  while (imageCache.size > 24) imageCache.delete(imageCache.keys().next().value!);
  return promise;
}

/**
 * Shows the wrapped clip only inside (or outside) its subject clip's moving cutout, in
 * composition space. `frameOffset` turns a Sequence-local frame back into the timeline frame
 * the subject's clock is read at. The wrapper stays mounted so the clip never remounts when
 * the window opens or closes.
 */
export function SubjectWindow({ props, frameOffset = 0, children }: { props: Record<string, unknown> | null | undefined; frameOffset?: number; children: ReactNode }) {
  if (!hasSubjectWindowBinding(props)) return <>{children}</>;
  return <ActiveSubjectWindow props={props!} frameOffset={frameOffset}>{children}</ActiveSubjectWindow>;
}

function ActiveSubjectWindow({ props, frameOffset, children }: { props: Record<string, unknown>; frameOffset: number; children: ReactNode }) {
  const frame = useCurrentFrame() + frameOffset;
  const { fps, width, height } = useVideoConfig();
  let plan: SubjectWindowPlan | null = null, planError: Error | null = null;
  try { plan = subjectWindowPlanAtFrame(props, frame, fps, width, height); }
  catch (error) { planError = error instanceof Error ? error : new Error(String(error)); }
  const key = plan?.url ? JSON.stringify(plan) : null;
  const resource = useRenderResource(`Subject window ${key ?? planError?.message ?? 'none'}`);
  useLayoutEffect(() => { if (planError) resource.fail(planError); }, [planError?.message, resource]);
  const [ready, setReady] = useState<WindowImage | null>(null);
  useEffect(() => {
    if (!plan?.url || !key) return;
    let cancelled = false;
    windowImage(plan).then(value => { if (!cancelled) setReady(value); }).catch(error => { if (!cancelled) resource.fail(error); });
    return () => { cancelled = true; };
    // The plan is fully described by its key.
  }, [key, resource]);
  useLayoutEffect(() => { if (!planError && (!key || ready?.key === key)) resource.done(); }, [key, ready, resource, planError]);
  let style: CSSProperties = {};
  if (plan && !plan.url) {
    const alpha = subjectWindowEmptyAlpha(plan);
    style = alpha >= 1 ? {} : { opacity: alpha };
  } else if (plan && ready) {
    // Until this frame's window decodes, keep the previous one (playback); export waits on the resource.
    style = { maskImage: `url("${ready.url}")`, maskSize: '100% 100%', maskRepeat: 'no-repeat', maskPosition: '0 0', maskMode: 'alpha' };
  } else if (plan) {
    style = { opacity: 0 };
  }
  return <AbsoluteFill style={style}>{children}</AbsoluteFill>;
}
