"use client";
import { Canvas, useThree, type CanvasProps } from "@react-three/fiber";
import { Suspense, useId, useLayoutEffect } from "react";
import { FrameContext, useFrameState, useRenderResource } from ".";
function ReadyScene({id,ready,onFrameReady}:{id:string;ready:ReturnType<typeof useRenderResource>;onFrameReady?:(canvas:HTMLCanvasElement)=>void}) {
  const {gl,scene,camera}=useThree(),state=useFrameState();
  useLayoutEffect(()=>{
    const draw=()=>{gl.render(scene,camera);gl.getContext().finish();};
    state.session.draws.set(id,draw);
    draw();ready.done();onFrameReady?.(gl.domElement);
    return()=>{state.session.draws.delete(id);};
  },[state,id,ready,gl,scene,camera,onFrameReady]);
  return null;
}
export function ThreeCanvas({width,height,children,onFrameReady,...props}:CanvasProps & {width:number;height:number;onFrameReady?:(canvas:HTMLCanvasElement)=>void}) {
  const state=useFrameState(),id=useId();
  const ready=useRenderResource(`3D scene ${id} frame ${state.frame}`);
  return <Canvas {...props} frameloop="demand" style={{width,height,...props.style}}>
    <FrameContext.Provider value={state}>
      <Suspense fallback={null}>{children}<ReadyScene id={id} ready={ready} onFrameReady={onFrameReady}/></Suspense>
    </FrameContext.Provider>
  </Canvas>;
}
