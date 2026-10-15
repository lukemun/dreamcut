import {mediaTextImagePhase,mediaTextImageMotion,mediaTextVideoClock} from '../timeline/media-text-fill';
import React, { createContext, useContext, type ReactNode } from 'react';
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
