'use client';
import { useId, type ReactNode } from 'react';
import { AbsoluteFill } from '@/lib/frame-runtime';
import { resolveStickerOutline } from '../timeline/sticker-outline';

/** Outline the decoded scene alpha on the effect clock, including frozen picture. */
export function StickerOutlineFilter({props, seconds, width, children}: {
  props?: Record<string, unknown> | null; seconds: number; width: number; children: ReactNode;
}) {
  const id = `paper-outline-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const radius = resolveStickerOutline(props, seconds) * width / 1080;
  if (props?.sticker_outline !== true) return children;
  return <>
    <svg width="0" height="0" aria-hidden="true" style={{position:'absolute'}}><defs>
      <filter id={id} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
        <feMorphology in="SourceAlpha" operator="dilate" radius={radius} result="edge" />
        <feGaussianBlur in="edge" stdDeviation={0.6 * width / 1080} result="soft-edge" />
        <feFlood floodColor={String(props.sticker_outline_color ?? '#ffffff')} result="color" />
        <feComposite in="color" in2="soft-edge" operator="in" result="outline" />
        <feMerge><feMergeNode in="outline"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs></svg>
    <AbsoluteFill style={{filter:radius > 0 ? `url(#${id})` : undefined}}>{children}</AbsoluteFill>
  </>;
}
