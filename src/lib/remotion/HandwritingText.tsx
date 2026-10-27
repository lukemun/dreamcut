import { HandwritingInkWeight } from "./HandwritingInkWeight";
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { captionHandwritingAssetKey, handwritingAssetKey, handwritingAssetsLoaded, hasHandwritingPack, loadHandwritingAssets } from '../timeline/handwriting-packs';
import { useRenderResource } from '../frame-runtime';
import { resolveCaptionProps } from '../timeline/captions';
import type { HandwritingRevealMode } from './LineHandwritingMask';
import { PreparedHandwritingText } from './PreparedHandwritingText';
import { PermanentMarkerText } from './PermanentMarkerText';
import { layoutHandwriting, penStrokeProgress } from '../timeline/handwriting';
import { HandwritingImageFill, type HandwritingFill } from './HandwritingImageFill';

/** Shared frame-driven SVG for Player and export. No DOM measurements or animation timers. */
function HandwritingTextInk({ text, progress, fontSize, maxWidth, singleLine, align, color, fontPreset, imageFill, revealMode }: {
  fontPreset?: string; text: string; progress: number; fontSize: number; maxWidth: number;
  singleLine: boolean; align: 'left' | 'center' | 'right'; color: string; imageFill?: HandwritingFill; revealMode?: HandwritingRevealMode;
}) {
  const assetKey = handwritingAssetKey(fontPreset, revealMode);
  if (assetKey && !handwritingAssetsLoaded(assetKey)) return <HandwritingAssetGate assetKey={assetKey}>
    <HandwritingTextInk {...{ text, progress, fontSize, maxWidth, singleLine, align, color, fontPreset, imageFill, revealMode }} />
  </HandwritingAssetGate>;
  return <HandwritingTextLoaded {...{ text, progress, fontSize, maxWidth, singleLine, align, color, fontPreset, imageFill, revealMode }} />;
}

function HandwritingTextLoaded({ text, progress, fontSize, maxWidth, singleLine, align, color, fontPreset, imageFill, revealMode }: React.ComponentProps<typeof HandwritingTextInk>) {
  const scale = fontSize / 32;
  const layout = useMemo(() => layoutHandwriting(text, singleLine ? Infinity : maxWidth / scale, align), [text, singleLine, maxWidth, scale, align]);
  const fittedScale = Math.min(scale, maxWidth / layout.width);
  const clock = Math.min(1, Math.max(0, progress)) * layout.duration;
  if (fontPreset && revealMode !== 'saved_strokes' && hasHandwritingPack(fontPreset, 'line_mask')) return <PreparedHandwritingText revealMode="line_mask" fontPreset={fontPreset} text={text} progress={progress} fontSize={fontSize} maxWidth={maxWidth} singleLine={singleLine} align={align} color={color} imageFill={imageFill} />;
  if (fontPreset === "permanent_marker") return <PermanentMarkerText text={text} progress={progress} fontSize={fontSize} maxWidth={maxWidth} singleLine={singleLine} align={align} color={color} imageFill={imageFill} />;
  if (fontPreset && hasHandwritingPack(fontPreset, 'saved_strokes')) return <PreparedHandwritingText revealMode={revealMode} fontPreset={fontPreset} text={text} progress={progress} fontSize={fontSize} maxWidth={maxWidth} singleLine={singleLine} align={align} color={color} imageFill={imageFill} />;
  const fill = imageFill && (imageFill.videoUrl || imageFill.urls.length) ? imageFill : undefined;
  const inkColor = fill ? '#ffffff' : color;
  const ink = <>
    {layout.strokes.map((stroke, i) => {
      const p = penStrokeProgress(stroke, clock);
      return p > 0 ? <path key={i} d={stroke.d} transform={`translate(${stroke.x} ${stroke.y + 3})`} fill="none" stroke={inkColor}
        strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1 - p} /> : null;
    })}
    {layout.fallback.map((g, i) => clock > g.start ? <text key={i} x={g.x} y={g.y + 25} fontSize={24} fill={inkColor}>{g.text}</text> : null)}
  </>;
  if (fill) return <HandwritingImageFill label={text} fill={fill} width={layout.width} height={layout.height} displayWidth={layout.width * fittedScale} displayHeight={layout.height * fittedScale}>{ink}</HandwritingImageFill>;
  return <svg aria-label={text} role="img" data-handwriting="stroke-paths" viewBox={`0 0 ${layout.width} ${layout.height}`}
    width={layout.width * fittedScale} height={layout.height * fittedScale}
    style={{ display: 'inline-block', verticalAlign: 'middle', overflow: 'visible' }}>
    {ink}
  </svg>;
}

export function HandwritingText({ weight = 0, ...props }: React.ComponentProps<typeof HandwritingTextInk> & { weight?: number }) {
  return <HandwritingInkWeight weight={weight} fontSize={props.fontSize}><HandwritingTextInk {...props} /></HandwritingInkWeight>;
}

/** Holds the frame session (seek, frame-state capture, export) until the pack is loaded. */
function HandwritingAssetGate({ assetKey, children }: { assetKey: string; children: ReactNode }) {
  const [ready, setReady] = useState(() => handwritingAssetsLoaded(assetKey));
  const resource = useRenderResource(`handwriting pack: ${assetKey}`);
  useEffect(() => {
    let cancelled = false;
    void loadHandwritingAssets(assetKey).then(() => { if (!cancelled) { resource.done(); setReady(true); } },
      error => { if (!cancelled) resource.fail(error); });
    return () => { cancelled = true; };
  }, [assetKey, resource]);
  return ready ? children : null;
}

/** Composition-level readiness: load every pack the timeline's handwriting captions use. */
export function useHandwritingAssetReadiness(elements: readonly { type: string; props?: Record<string, unknown> | null }[]) {
  const keys = JSON.stringify([...new Set(elements.flatMap(element => {
    if (element.type !== 'caption_text') return [];
    const key = captionHandwritingAssetKey(resolveCaptionProps(element.props ?? {}));
    return key ? [key] : [];
  }))].sort());
  const resource = useRenderResource(`handwriting packs: ${keys}`);
  useEffect(() => {
    let cancelled = false;
    void Promise.all((JSON.parse(keys) as string[]).map(loadHandwritingAssets))
      .then(() => { if (!cancelled) resource.done(); }, error => { if (!cancelled) resource.fail(error); });
    return () => { cancelled = true; };
  }, [keys, resource]);
}
