import type {CompositionElement} from '../render/composition-adapters';
import {quantizeVisualFrameSpan} from '../timeline/frame-quantization';
/** A preparation heuristic, never render authority. Dense transparent-video
 * overlaps receive spare producer time; actual pictures still evaluate every
 * effect and source at the exact shared frame. */
export function heavyGpuPictureFrames(elements:readonly CompositionElement[],fps:number,endFrame:number){
 const changes=new Map<number,number>();
 for(const element of elements){
  if(element.type!=='video_clip'||element.props?.has_alpha!==true)continue;
  const span=quantizeVisualFrameSpan(element.timeline_start,element.duration,{fps});
  changes.set(span.startFrame,(changes.get(span.startFrame)??0)+1);
  changes.set(span.endFrame,(changes.get(span.endFrame)??0)-1);
 }
 const frames:number[]=[];let count=0,prior=0;
 for(const [frame,change]of [...changes].sort((a,b)=>a[0]-b[0])){
  if(count>=3)for(let at=Math.max(0,prior);at<Math.min(frame,endFrame);at++)frames.push(at);
  count+=change;prior=frame;
 }
 return frames;
}
