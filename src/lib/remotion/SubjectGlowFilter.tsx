'use client';
import { useId, type ReactNode } from 'react';
import { AbsoluteFill } from '@/lib/frame-runtime';
import { resolveSubjectGlow, SUBJECT_GLOW_FIELDS } from '../timeline/subject-glow';

/** Filter the isolated actor as a group; never filter the background or remount
 * its decoder when animated flash/glow crosses zero. Alpha drives the halo. */
export function SubjectGlowFilter({ props, seconds, width, children }: {
  props?: Record<string, unknown> | null; seconds: number; width: number; children: ReactNode;
}) {
  const id = `subject-glow-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const keys = props?.keyframes as Record<string, unknown> | undefined;
  const mounted = SUBJECT_GLOW_FIELDS.some(field => props?.[field] !== undefined || keys?.[field] !== undefined);
  const { flash, strength, radius } = resolveSubjectGlow(props, seconds);
  if (!mounted) return children;
  return <>
    <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute' }}><defs>
      <filter id={id} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
        <feGaussianBlur in="SourceAlpha" stdDeviation={radius * width / 1080} result="halo-alpha" />
        <feComponentTransfer in="halo-alpha" result="halo-strength"><feFuncA type="linear" slope={strength} /></feComponentTransfer>
        <feFlood floodColor="#ffffff" result="white" />
        <feComposite in="white" in2="halo-strength" operator="in" result="halo" />
        <feColorMatrix in="SourceGraphic" type="matrix" values={`${1-flash} 0 0 0 ${flash} 0 ${1-flash} 0 0 ${flash} 0 0 ${1-flash} 0 ${flash} 0 0 0 1 0`} result="subject" />
        <feMerge><feMergeNode in="halo" /><feMergeNode in="subject" /></feMerge>
      </filter>
    </defs></svg>
    <AbsoluteFill style={{ filter: flash > 0 || strength > 0 ? `url(#${id})` : undefined }}>{children}</AbsoluteFill>
  </>;
}
