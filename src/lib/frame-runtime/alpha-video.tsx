"use client";
import { useEffect, useId, useRef } from "react";
import {SMPTE_C_SVG_MATRIX} from "./source-primaries";
import { useFrameState } from ".";
import { Video, type MediaProps } from "./media";

/** Keep decoded alpha in the scene's canvas compositor, including during seeks.
 * The decoder remains mounted; an in-flight seek retains the last complete image.
 * Export uses the same drawing callback after its exact source seek has settled.
 */
export function AlphaVideo({style, outlineWidth = 0, outlineColor = "#ffffff", ...props}: MediaProps & {outlineWidth?: number; outlineColor?: string}) {
  const state = useFrameState(), id = useId();
  const liveEffects = !state.rendering && state.effectDrawMode !== "settled";
  const colorFilterId = `source-primary-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const filterId = `alpha-outline-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const surface = canvas.current!;
    const context = surface.getContext('2d', {alpha:true});
    if (!context) { state.session.fail(new Error('Transparent video canvas unavailable')); return; }
    let handle = 0, videoHandle = 0, seekPaint = 0, lastPresentation = -Infinity;
    const source = root.current?.querySelector('video');
    let colorSource: string|undefined;
    const outlineFilter=outlineWidth > 0 ? `url(#${filterId})` : '';
    const updateColor = (video:HTMLVideoElement) => {
      if(colorSource===video.currentSrc)return;
      colorSource=video.currentSrc;
      // Canvas drawImage on Chromium preserves SMPTE-C channel values whereas
      // its video display converts those primaries to sRGB. Match display without
      // a per-frame CPU readback. Inspect metadata once per decoded source.
      let convert=false;
      if(typeof VideoFrame!=='undefined'){
        const frame=new VideoFrame(video);
        try{convert=frame.colorSpace.primaries==='smpte170m';}finally{frame.close();}
      }
      surface.style.filter=[convert?`url(#${colorFilterId})`:'',outlineFilter].filter(Boolean).join(' ');
    };
    const draw = (presentedTime?: number) => {
      const source = root.current?.querySelector('canvas[data-native-source],video') as HTMLCanvasElement|HTMLVideoElement|null;
      if (!source || (source instanceof HTMLVideoElement && (source.readyState < 2 || source.seeking))) return;
      const width=source instanceof HTMLVideoElement?source.videoWidth:source.width,height=source instanceof HTMLVideoElement?source.videoHeight:source.height;
      if (surface.width !== width || surface.height !== height) {
        surface.width = width; surface.height = height;
      }
      if(source instanceof HTMLVideoElement)updateColor(source);
      else surface.style.filter=outlineFilter; // Native frames already use display primaries.
      context.clearRect(0,0,surface.width,surface.height);
      context.drawImage(source,0,0);
      if (!state.rendering && props.title && presentedTime != null) {
        surface.dataset.presentedSourceTime=String(presentedTime);
        state.session.presentedFrames.publish(props.title, presentedTime);
      }
    };
    state.session.draws.set(id,()=>draw());
    // A paused seek is a decode-completion event, not a guarantee of another
    // video-frame callback. Refresh the canvas after decoded pixels settle so
    // overlapping layers cannot retain pictures from different playhead positions.
    const cancelSeekPaint = () => cancelAnimationFrame(seekPaint);
    const seeked = () => {
      cancelSeekPaint();
      seekPaint = requestAnimationFrame(() => {
        seekPaint = requestAnimationFrame(() => {
          if (source?.paused && !source.seeking) draw(source.currentTime);
        });
      });
    };
    if (liveEffects) {
      source?.addEventListener('seeking',cancelSeekPaint);
      source?.addEventListener('seeked',seeked);
      source?.addEventListener('loadeddata',seeked);
    }
    const tick = () => { try { draw(); } catch(e) { state.session.fail(e); return; } handle = requestAnimationFrame(tick); };
    if (liveEffects && source?.requestVideoFrameCallback) {
      const presented = (_now: number, metadata: VideoFrameCallbackMetadata) => {
        lastPresentation = performance.now();
        try { draw(metadata.mediaTime); } catch(e) { state.session.fail(e); return; }
        videoHandle = source.requestVideoFrameCallback(presented);
      };
      videoHandle = source.requestVideoFrameCallback(presented);
      // A decoder premounted under visibility:hidden can keep advancing while
      // Chromium withholds presentation callbacks after it becomes visible.
      // Keep its canvas alive during that gap; normal callbacks remain primary.
      const refreshIfStarved = (now: number) => {
        if (!source.paused && now - lastPresentation > 2 * 1000 / state.fps) {
          try { draw(source.currentTime); } catch(e) { state.session.fail(e); return; }
        }
        handle = requestAnimationFrame(refreshIfStarved);
      };
      handle = requestAnimationFrame(refreshIfStarved);
      // Preserve first-paint readiness while waiting for the first presentation callback.
      draw();
    } else if (liveEffects) handle = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(handle); source?.cancelVideoFrameCallback?.(videoHandle);
      cancelSeekPaint();
      source?.removeEventListener('seeking',cancelSeekPaint);
      source?.removeEventListener('seeked',seeked);
      source?.removeEventListener('loadeddata',seeked);
      state.session.draws.delete(id);
      if (props.title) state.session.presentedFrames.remove(props.title);
    };
  },[id,state.session,state.rendering,state.fps,props.title,liveEffects,outlineWidth,filterId,colorFilterId]);
  return <div ref={root} style={{...style,position:style?.position??'relative'}}>
    <Video {...props} crossOrigin={props.crossOrigin??'anonymous'} style={{position:'absolute',width:'100%',height:'100%',opacity:0,pointerEvents:'none'}} />
    <svg width="0" height="0" aria-hidden="true" style={{position:'absolute'}}><defs>
      <filter id={colorFilterId} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="linearRGB">
        <feColorMatrix type="matrix" values={SMPTE_C_SVG_MATRIX} />
      </filter>
    </defs></svg>
    {outlineWidth > 0 && <svg width="0" height="0" aria-hidden="true" style={{position:'absolute'}}><defs><filter id={filterId} x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
      <feMorphology in="SourceAlpha" operator="dilate" radius={outlineWidth} result="edge" />
      <feGaussianBlur in="edge" stdDeviation="0.6" result="soft-edge" />
      <feFlood floodColor={outlineColor} result="color" />
      <feComposite in="color" in2="soft-edge" operator="in" result="outline" />
      <feMerge><feMergeNode in="outline"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter></defs></svg>}
    <canvas ref={canvas} data-dreamcut-effect-output="alpha-video" style={{width:'100%',height:'100%',objectFit:style?.objectFit??'contain',display:'block',filter:outlineWidth > 0 ? `url(#${filterId})` : undefined}} />
  </div>;
}
