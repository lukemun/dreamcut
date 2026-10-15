"use client";
import { setEditorFrameRate } from "@/lib/timeline/frame-rate-scope";
import { useEffect, useState, useRef } from "react";
import { flushSync } from "react-dom";
import { NativeSourceProvider } from "@/lib/native-preview/NativeSourceProvider";
import { TimelineComposition } from "@/lib/remotion/TimelineComposition";
import { FrameContext, FrameSession, settleFrame, type AudioSample } from "@/lib/frame-runtime";
import "@/lib/remotion/RendererContractFixture";
import "@/lib/remotion/SurfaceTrackFixture";
import "@/lib/remotion/PreparedPlaybackFixture";
import "@/lib/native-preview/NativeComparisonFixture";
import { fixtureDefinitions, getFixture } from "@/lib/frame-runtime/fixtures";
import "@/lib/remotion/EffectPrimitiveFixture";
import "@/lib/remotion/ColorGradeFixture";
import "@/lib/remotion/SpatialSceneFixture";
import "@/lib/remotion/RecolorFixture";
import "@/lib/remotion/ColinEffectProofFixture";
import {createGpuExportSession} from "@/lib/gpu-preview/export-session";
import {createCanvasEncoder,type CanvasEncoder,type CanvasEncoderConfig} from "@/lib/render/canvas-encoder";
type Config = { gpu?: boolean; /** Sound only: read each frame's audio without waiting for its pictures. */ audioOnly?: boolean; pixelScale?: number; width: number; height: number; fps: number; durationInFrames: number; rendering?: boolean; fixtureId?: string; nativeProjectId?: string; transparent?: boolean; inputProps: Record<string, any> };
declare global { interface Window { __dreamcutRender?: {
  fixtures(): ReturnType<typeof fixtureDefinitions>; load(config: Config): Promise<void>; frame(frame: number): Promise<AudioSample[]>;
  /** GPU export without screenshots: each drawn frame goes from the canvas straight into the browser's video encoder. */
  startEncode(config: CanvasEncoderConfig): Promise<void>; encodeFrame(frame: number): Promise<void>; takeEncoded(): string; finishEncode(): Promise<string>;
  /** Summed per-frame milliseconds for this page's encode: source resources, GPU drawing, encoder hand-off. */
  encodeStats(): Record<string, number>;
  /** Draw and encode an inclusive run of frames in order; returns what the encoder produced. */
  encodeFrames(first: number, last: number): Promise<string>;
}; } }
export default function RenderFrame() {
  const [config, setConfig] = useState<Config | null>(null), [frame, setFrame] = useState(0);
  const session = useRef(new FrameSession());
  const configRef = useRef<Config | null>(null); configRef.current = config;
  const gpu = useRef<Awaited<ReturnType<typeof createGpuExportSession>>|null>(null);
  const encoder = useRef<CanvasEncoder|null>(null);
  const stats = useRef<Record<string, number>>({});
  const settle = () => settleFrame(session.current, document.getElementById("dreamcut-render-surface")!);
  useEffect(() => {
    window.__dreamcutRender = {
      fixtures: fixtureDefinitions,
      load: async value => { configRef.current = value; setEditorFrameRate(value.fps); gpu.current?.close();gpu.current=null; flushSync(() => setConfig(null)); session.current.dispose(); session.current = new FrameSession(); flushSync(() => { setConfig(value); setFrame(0); }); if(value.gpu){if(value.fixtureId||value.nativeProjectId)throw Error("GPU export cannot combine renderers or use a Standard-only fixture");gpu.current=await createGpuExportSession(document.getElementById("dreamcut-gpu-export") as HTMLCanvasElement,{...value,inputProps:value.inputProps as any});await gpu.current.frame(0);}else await settle(); },
      frame: async value => {
        if(gpu.current){await gpu.current.frame(value);return [];}
        flushSync(() => setFrame(value));
        // Each media clip records its sound for the frame while rendering; it never depends on
        // decoded pictures, seeks or effects, so an audio-only pass skips waiting for them.
        if(configRef.current?.audioOnly){ if(session.current.error)throw session.current.error; return [...session.current.media.values()].flatMap(entry=>entry.sample?[entry.sample]:[]); }
        return settle();
      },
      startEncode: async value => { if(!gpu.current)throw Error("Encoding needs a GPU export session"); encoder.current?.close(); encoder.current=await createCanvasEncoder(document.getElementById("dreamcut-gpu-export") as HTMLCanvasElement,value); },
      encodeFrame: async value => {
        if(!gpu.current||!encoder.current)throw Error("Encoding has not started");
        const began=performance.now(); await gpu.current.frame(value); const drawn=performance.now(); await encoder.current.encode(value);
        const timing=gpu.current.lastPresentation, add=(key:string,ms:number)=>{stats.current[key]=(stats.current[key]??0)+ms;};
        add("frames",1); add("presentMs",drawn-began); add("encodeMs",performance.now()-drawn);
        if(timing){ add("resourceMs",timing.resourceMs); add("submitMs",timing.submitMs); add("evaluationMs",timing.evaluationMs); add("videoDecodes",timing.videoDecodes.length); }
      },
      encodeStats: () => ({...stats.current}),
      encodeFrames: async (first, last) => {
        // One round trip per run instead of two per frame; the page stays busy drawing.
        for(let frame=first; frame<=last; frame+=1) await window.__dreamcutRender!.encodeFrame(frame);
        return encoder.current!.take();
      },
      takeEncoded: () => { if(!encoder.current)throw Error("Encoding has not started"); return encoder.current.take(); },
      finishEncode: async () => { if(!encoder.current)throw Error("Encoding has not started"); const rest=await encoder.current.finish(); encoder.current=null; return rest; },
    };
    return () => { encoder.current?.close();encoder.current=null;gpu.current?.close();gpu.current=null;delete window.__dreamcutRender; };
  }, []);
  const selected = config?.fixtureId ? getFixture(config.fixtureId) : null;
  const Component = selected?.component ?? TimelineComposition;
  const scene = config ? <Component {...selected?.defaultProps} {...config.inputProps as any} /> : null;
  return config ? <div id="dreamcut-render-surface" style={{ position: "fixed", left: 0, top: 0, width: config.width, height: config.height, overflow: "hidden", background: config.transparent ? "transparent" : "black" }}>
    {config.gpu?<canvas id="dreamcut-gpu-export" width={config.width*(config.pixelScale??1)} height={config.height*(config.pixelScale??1)} style={config.pixelScale&&config.pixelScale!==1?{width:config.width,height:config.height}:undefined}/>:<FrameContext.Provider value={{ ...config, frame, effectDrawMode: "settled", rendering: config.rendering ?? true, playing: false, muted: true, volume: 1, playbackRate: 1, session: session.current }}>{config.nativeProjectId ? <NativeSourceProvider projectId={config.nativeProjectId}>{scene}</NativeSourceProvider> : scene}</FrameContext.Provider>}
  </div> : null;
}
