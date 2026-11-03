"use client";
import { useEffect, useId, useRef, type ImgHTMLAttributes } from "react";
import { Img, useFrameState } from ".";
import { buildColorKeyParams, resolveChromaKeyAtTime } from "../timeline/chroma-key";
import { createKeyer, type ColorKey } from "./chroma";

/** Still and video keying share the source-pixel shader and frame draw barrier. */
export function ChromaImage({ effects = [], style, ...props }: ImgHTMLAttributes<HTMLImageElement> & { effects?: ColorKey[] }) {
  const state = useFrameState(), id = useId();
  const root = useRef<HTMLDivElement>(null), canvas = useRef<HTMLCanvasElement>(null), current = useRef(effects);
  current.current = effects;
  useEffect(() => {
    const keyer = createKeyer(canvas.current!); let handle = 0;
    const draw = () => {
      const image = root.current?.querySelector("img");
      if (!image || !image.complete || !image.naturalWidth) {
        if (state.rendering) throw new Error("Chroma image source not decoded");
        return;
      }
      if (current.current.length !== 1) throw new Error("Chroma image requires exactly one key effect");
      keyer.draw(image, current.current[0]!);
    };
    state.session.draws.set(id, draw);
    const preview = () => { try { draw(); } catch (error) { state.session.fail(error); return; } handle = requestAnimationFrame(preview); };
    if (!state.rendering && state.effectDrawMode !== "settled") handle = requestAnimationFrame(preview);
    return () => { cancelAnimationFrame(handle); state.session.draws.delete(id); keyer.dispose(); };
  }, [state.session, state.rendering, state.effectDrawMode, id]);
  return <div ref={root} style={{ ...style, position: style?.position ?? "relative" }}>
    <Img {...props} crossOrigin={props.crossOrigin ?? "anonymous"} style={{ position: "absolute", width: "100%", height: "100%", opacity: 0 }} />
    <canvas ref={canvas} data-dreamcut-effect-output="chroma" style={{ width: "100%", height: "100%", objectFit: style?.objectFit ?? "contain", display: "block" }} />
  </div>;
}

/** Timeline still entry point, sharing native amount clocks in Standard and GPU. */
export function KeyedStillImage({ chromaProps, timeSeconds, ...props }: ImgHTMLAttributes<HTMLImageElement> & { chromaProps?: Record<string, unknown> | null; timeSeconds?: number }) {
  const state = useFrameState();
  const chroma = resolveChromaKeyAtTime(chromaProps, timeSeconds ?? state.frame / state.fps);
  return chroma ? <ChromaImage {...props} effects={[buildColorKeyParams(chroma)]} /> : <Img {...props} />;
}
