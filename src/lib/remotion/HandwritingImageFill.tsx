import {mediaTextImagePhase,mediaTextImageMotion,mediaTextVideoClock} from '../timeline/media-text-fill';
import React, { createContext, useContext, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Img, OffthreadVideo, useRemotionEnvironment, useVideoConfig } from '@/lib/frame-runtime';

/** Internal render resource request: retain shared glyph/reveal layout without
 * starting a media element. The GPU supplies the exact video sample separately. */
export const HandwritingFillMaskContext=createContext(false);

export type HandwritingFill = {
  videoUrl?: string; previewVideoUrl?: string; videoPlaybackRate?: number; urls: string[]; localSeconds: number; secondsPerImage: number;
  revealProgress?: number;
  revealStartFraction?: number;
  scene?: { width: number; height: number; x: number; y: number; anchorX: number; anchorY: number; boxWidth: number; align: string; offsetSeconds: number };
  crossfadeSeconds: number; scale: number; panPercent: number;
};

/** Keep moving media in HTML: video inside a masked SVG foreignObject can disappear on seek. */
export function HandwritingImageFill({ fill, width, height, displayWidth, displayHeight, label, children }: {
  fill: HandwritingFill; width: number; height: number; displayWidth: number; displayHeight: number; label: string; children: ReactNode;
}) {
  const maskOnly=useContext(HandwritingFillMaskContext);
  const { fps } = useVideoConfig();
  const { isRendering } = useRemotionEnvironment();
  const videoSource = isRendering ? fill.videoUrl : fill.previewVideoUrl;
  const reveal = Math.max(0, Math.min(1, fill.revealProgress ?? 1));
  const revealEdge = reveal === 0 ? 0 : (fill.revealStartFraction ?? 0) + reveal * (1 - (fill.revealStartFraction ?? 0));
  // Self-contained SVG retains the exact animated contours and nested stroke masks.
  // Keep nested server serialization outside a hook callback: the GPU caption
  // rasterizer also renders this component statically, and nested SSR resets
  // the outer memo hook cursor. The frame-derived mask is deterministic.
  const maskImage = `url("data:image/svg+xml,${encodeURIComponent(renderToStaticMarkup(
    <svg xmlns="http://www.w3.org/2000/svg" width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      {fill.revealProgress != null && reveal < 1 ? <>
        <defs><clipPath id="ink-reveal"><rect width={width * revealEdge} height={height}/></clipPath></defs>
        <g clipPath="url(#ink-reveal)">{children}</g>
      </> : children}
    </svg>,
  ))}")`;
  const phase=mediaTextImagePhase(fill.urls.length,fill.localSeconds,fill.secondsPerImage,fill.crossfadeSeconds);
  const index=phase?.currentIndex??0,nextOpacity=phase?.nextOpacity??0;
  const scale=Math.max(1,fill.scale);
  const pan=phase?mediaTextImageMotion(phase,fill.scale,fill.panPercent,'handwriting').positionX:0;
  const drawImage = (url: string, opacity: number, offset: number) => <Img src={url} style={{
    position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity,
    transform: `translateX(${offset * 100}%) scale(${scale})`,
  }} />;
  const scene = fill.scene;
  const alignFactor = scene?.align === 'right' ? 1 : scene?.align === 'center' ? 0.5 : 0;
  const videoStyle: React.CSSProperties = scene ? {
    position: 'absolute',
    left: -scene.x + scene.anchorX * scene.boxWidth - (scene.boxWidth - displayWidth) * alignFactor,
    top: -scene.y + scene.anchorY * displayHeight,
    width: scene.width, height: scene.height, maxWidth: 'none', objectFit: 'fill',
  } : { width: '100%', height: '100%', objectFit: 'cover' };
  return <span role="img" aria-label={label} data-handwriting-image-fill="true" style={{ display: 'inline-block', verticalAlign: 'middle',
    position: 'relative', width: displayWidth, height: displayHeight, overflow: 'hidden',
    WebkitTextStroke: '0 transparent',
    // Rasterize the reveal inside the glyph alpha mask. A CSS clip on the moving
    // video can leak a vertical hairline at its edge in the live WebView.
    opacity: fill.revealProgress != null && reveal === 0 ? 0 : 1,
    maskImage, WebkitMaskImage: maskImage, maskMode: 'alpha', maskSize: '100% 100%', WebkitMaskSize: '100% 100%',
    maskRepeat: 'no-repeat', WebkitMaskRepeat: 'no-repeat',
  }}>
    {fill.videoUrl && maskOnly ? <span data-video-fill-mask="true" style={{...videoStyle,display:'block',background:'#ffffff'}}/> : fill.videoUrl ? (videoSource ? <OffthreadVideo trimBefore={mediaTextVideoClock(0,fps,scene?.offsetSeconds??0,fill.videoPlaybackRate??1).trimBefore} src={videoSource} playbackRate={fill.videoPlaybackRate ?? 1} muted style={videoStyle} /> : null) : <>
      {fill.urls[index] ? drawImage(fill.urls[index]!, 1, pan) : null}
      {nextOpacity > 0 && fill.urls.length > 1 ? drawImage(fill.urls[(index + 1) % fill.urls.length]!, nextOpacity, 0) : null}
    </>}
  </span>;
}

/** Moving video inside ordinary (block) glyphs. Browser GPU draws the decoded video through the caption
 *  raster's own glyph alpha, so its raster keeps solid white glyphs plus the fill box the video covers.
 *  Standard clips the HTML video with an inline SVG text clip in the same font, which (unlike a data-URL
 *  mask image) can use the page's loaded web fonts. The clip text is centred on the word's box with the
 *  same font, size, weight, spacing and line box, so both renderers fill the same glyphs. */
export type VideoFillBlockTypography = { fontFamily?: string; fontWeight?: React.CSSProperties['fontWeight']; letterSpacing?: React.CSSProperties['letterSpacing']; lineHeight?: React.CSSProperties['lineHeight']; fontSize: number };
export function VideoFillBlockText({ text, videoUrl, previewVideoUrl, playbackRate = 1, typography }: {
  text: string; videoUrl: string; previewVideoUrl?: string; playbackRate?: number; typography: VideoFillBlockTypography;
}) {
  const maskOnly = useContext(HandwritingFillMaskContext);
  const clipId = `video-fill-text-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const { fps } = useVideoConfig();
  const { isRendering } = useRemotionEnvironment();
  const videoSource = isRendering ? videoUrl : previewVideoUrl;
  const glyphs = { fontFamily: typography.fontFamily, fontWeight: typography.fontWeight, letterSpacing: typography.letterSpacing, fontSize: typography.fontSize };
  // Inside a CSS clip on an HTML box, SVG percentages resolve to zero, so the clip text is centred on the
  // word's measured box. A layout effect measures before paint; resizes (late fonts, retyped words) re-centre.
  const boxRef = useRef<HTMLSpanElement>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const node = boxRef.current;
    if (!node || maskOnly) return;
    const measure = () => setSize(previous => previous && previous.width === node.offsetWidth && previous.height === node.offsetHeight ? previous : { width: node.offsetWidth, height: node.offsetHeight });
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [maskOnly, text, typography.fontFamily, typography.fontSize, typography.fontWeight, typography.letterSpacing, typography.lineHeight]);
  const box: React.CSSProperties = { display: 'inline-block', position: 'relative', lineHeight: typography.lineHeight, WebkitTextStroke: '0 transparent', textShadow: 'none', ...glyphs };
  if (maskOnly) return <span data-handwriting-image-fill="true" data-video-fill-text="true" style={{ ...box, color: '#ffffff' }}>
    {text}
    <span data-video-fill-mask="true" aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'block' }}/>
  </span>;
  return <span ref={boxRef} role="img" aria-label={text} data-video-fill-text="true" style={{ ...box, color: 'transparent', clipPath: size ? `url(#${clipId})` : 'inset(50%)' }}>
    {text}
    {videoSource ? <OffthreadVideo trimBefore={mediaTextVideoClock(0, fps, 0, playbackRate).trimBefore} src={videoSource} playbackRate={playbackRate} muted
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', maxWidth: 'none', objectFit: 'cover' }} /> : null}
    <svg aria-hidden="true" width="0" height="0" style={{ position: 'absolute', overflow: 'hidden' }}>
      <defs><clipPath id={clipId} clipPathUnits="userSpaceOnUse">
        <text x={(size?.width ?? 0) / 2} y={(size?.height ?? 0) / 2} textAnchor="middle" dominantBaseline="central" style={glyphs}>{text}</text>
      </clipPath></defs>
    </svg>
  </span>;
}
