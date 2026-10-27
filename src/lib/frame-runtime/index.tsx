"use client";
import React, { createContext, useContext, useLayoutEffect, useMemo, useRef, type CSSProperties, type ReactNode } from "react";
import { FrameSession } from "./session";
export { interpolate, Easing } from "./math";
export { FrameSession, settleFrame, settleFrameResources, type AudioSample } from "./session";
export { Video, Video as OffthreadVideo, Audio } from "./media";
export type FrameState = {
  /** Settled scenes draw effects only through their session's frame barrier. */
  effectDrawMode?: "live" | "settled";
  seekVersion?: number;
  transportPlaying?: boolean;
  absoluteFrame?: number;
  frame: number; fps: number; width: number; height: number; durationInFrames: number;
  rendering: boolean; playing: boolean; muted: boolean; volume: number; playbackRate: number; frozen?: boolean;
  premounted?: boolean;
  session: FrameSession;
};
export const FrameContext = createContext<FrameState | null>(null);
export function useFrameState(): FrameState { const state = useContext(FrameContext); if (!state) throw new Error("A composition must be inside a DreamCut frame session"); return state; }
export const useCurrentFrame = () => useFrameState().frame;
export const useVideoConfig = () => useFrameState();
export const useRemotionEnvironment = () => { const { rendering } = useFrameState(); return { isRendering: rendering, isPlayer: !rendering, isStudio: false }; };
export function AbsoluteFill({ style, ...props }: React.ComponentPropsWithRef<"div">) { return <div {...props} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", ...style }} />; }
export function Sequence({ from = 0, durationInFrames = Infinity, children, layout, style, premountFor = 0 }: { from?: number; durationInFrames?: number; children: ReactNode; layout?: "none" | "absolute-fill"; style?: CSSProperties; premountFor?: number; name?: string }) {
  const parent = useFrameState(), local = parent.frame - from;
  const premount = !parent.rendering && local < 0 && local >= -premountFor;
  if ((!premount && local < 0) || local >= durationInFrames) return null;
  const content = <FrameContext.Provider value={{ ...parent, frame: Math.max(0, local), playing: parent.playing && !premount, frozen: parent.frozen || premount, premounted: parent.premounted || premount }}>{children}</FrameContext.Provider>;
  if (premount) return <AbsoluteFill style={{ ...style, visibility: "hidden" }}>{content}</AbsoluteFill>;
  return layout === "none" ? content : <AbsoluteFill style={style}>{content}</AbsoluteFill>;
}
export function Freeze({ frame, children }: { frame: number; children: ReactNode }) { const parent = useFrameState(); return <FrameContext.Provider value={{ ...parent, frame, playing: false, frozen: true }}>{children}</FrameContext.Provider>; }
export function Img(props: React.ImgHTMLAttributes<HTMLImageElement>) {
  const { session, premounted } = useFrameState();
  const ref = useRef<HTMLImageElement>(null);
  useLayoutEffect(() => {
    const image = ref.current!;
    const key = Symbol("image decode");
    let cancelled = false;
    if (!premounted) session.visualResources.set(key, typeof props.src === "string" ? props.src : "image");
    // A completed network request is not enough: the browser must decode the
    // actual mounted image before the timeline can advance past its entrance.
    void image.decode().then(() => {
      if (!cancelled) session.visualResources.delete(key);
    }, error => {
      if (!cancelled) {
        session.visualResources.delete(key);
        session.fail(new Error(`Image failed: ${props.src ?? "image"}`, { cause: error }));
      }
    });
    return () => { cancelled = true; session.visualResources.delete(key); };
  }, [session, props.src, props.srcSet, props.sizes, premounted]);
  return <img {...props} ref={ref} alt={props.alt ?? ""} />;
}
/** Register after commit, release on completion or unmount. Strict Mode never leaks discarded render handles. */
export function useRenderResource(label: string) {
  const { session } = useFrameState();
  const resource = useMemo(() => {
    const key = Symbol(label);
    const handle = { key, settled: false, done: () => { handle.settled = true; session.resources.delete(key); }, fail: (error: unknown) => { handle.done(); session.fail(error); } };
    return handle;
  }, [session, label]);
  useLayoutEffect(() => { if (!resource.settled) session.resources.set(resource.key, label); return () => { session.resources.delete(resource.key); }; }, [session, resource, label]);
  return resource;
}
