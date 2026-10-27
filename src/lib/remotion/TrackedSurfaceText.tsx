import { useMemo, useLayoutEffect, useRef } from "react";
import { useCurrentFrame, useVideoConfig } from "@/lib/frame-runtime";
import type { CompositionElement } from "../render/composition-adapters";
import { readSurfaceTrack, trackedQuadAtFrame, quadMatrix, sampleSurface, surfacePresentationParent } from "../timeline/surface-track";
import { resolveCaptionProps } from "../timeline/captions";

import {surfaceTextLayout} from "../timeline/surface-text-layout";

export function TrackedSurfaceText({element, parent, presentationParents}: {element:CompositionElement;parent?:CompositionElement;presentationParents?:CompositionElement[]}) {
  const frame=useCurrentFrame(), {width,height,fps,session,rendering}=useVideoConfig();
  const surface = useRef<HTMLDivElement>(null);
  const track=useMemo(()=>readSurfaceTrack(element.props?.surface_track),[element.props?.surface_track]);
  const absoluteFrame=frame+Math.round(element.timeline_start*fps);
  const visibleParent=track && presentationParents ? surfacePresentationParent(track,presentationParents,absoluteFrame,fps) ?? parent : parent;
  const ref=track && (sampleSurface(track,track.referenceTime)??track.samples.find(s=>s.visible)?.quad);
  const distance=(a:number[],b:number[])=>Math.hypot((a[0]-b[0])*(track?.width??1),(a[1]-b[1])*(track?.height??1));
  const planeWidth=ref ? Math.max(1,distance(ref[0],ref[1])) : 1,planeHeight=ref ? Math.max(1,distance(ref[0],ref[3])) : 1;
  useLayoutEffect(()=>{
    if(rendering || !track || !visibleParent) return;
    const key=`timeline-video:${visibleParent.id}:0`;
    const apply=(time?:number)=>{
      const quad=trackedQuadAtFrame(track,visibleParent,absoluteFrame,{width,height},fps,time);
      const matrix=quad && quadMatrix(quad,[planeWidth,planeHeight]);
      if(surface.current){
        // Respect hidden prepared/staging scenes; explicit visible escapes them.
        surface.current.style.visibility=matrix?'inherit':'hidden';
        if(matrix) surface.current.style.transform=matrix;
        if(time != null) surface.current.dataset.presentedSourceTime=String(time);
        else delete surface.current.dataset.presentedSourceTime;
      }
    };
    apply(session.presentedFrames.get(key));
    return session.presentedFrames.subscribe(key,apply);
  },[rendering,track,visibleParent,absoluteFrame,width,height,fps,planeWidth,planeHeight,session]);
  if(!track) return null;
  const quad=trackedQuadAtFrame(track,visibleParent,absoluteFrame,{width,height},fps);
  if(!ref) return null;
  const matrix=quad && quadMatrix(quad,[planeWidth,planeHeight]);
  const text=resolveCaptionProps(element.props);
  const layout=surfaceTextLayout(planeWidth,planeHeight,text);
  return <div ref={surface} data-tracked-surface={track.id} style={{...layout.plane,
    transform:matrix??undefined,visibility:matrix?'inherit':'hidden'}}>
    <div style={layout.text}>{text.text}</div>
  </div>;
}
