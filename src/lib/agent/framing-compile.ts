import {z} from "zod";
import {readMetadata,readTimeline} from "../local-store/store";
import {withPreparedPictureSize} from "../local-store/prepared-picture-size";
import {PREPARED_PICTURE_SIZE_PROP} from "../media-analysis/visual-overlap";
import {getCompositionDimensions} from "../render/composition-adapters";
import {transformForSourceRect} from "../timeline/framing-geometry";
import {readMaskInsetProps} from "../timeline/media-transform";
import type {TimelineAspectRatio} from "@/components/studio/timeline/types";
import {toolError} from "./tool-error";

const share=z.number().min(0).max(1);
const schema=z.object({element_id:z.string().uuid(),
 regions:z.array(z.object({t:z.number().min(0).max(600).optional(),x:share,y:share,width:share.refine(value=>value>0),height:share.refine(value=>value>0),
  ease:z.enum(["linear","easeIn","easeOut","easeInOut","hold"]).optional()}).strict()).min(1).max(20),
 fit:z.enum(["fit","fill"]).optional(),
 mask_inset:z.array(z.number().min(0).max(0.95)).length(4).optional()}).strict();

/**
 * Turn regions of a picture's source (fractions of its frame) into the clip's scale and offsets:
 * one region gives a still framing, several timed regions give push-ins and pans as keyframes.
 * Measures the clip's own source and crop, so a wide screen recording in a tall half frames the
 * part asked for. Writes nothing.
 */
export function compileFraming(projectId:string,raw:unknown){
 const input=schema.parse(raw);
 const element=withPreparedPictureSize(projectId,readTimeline(projectId).elements.filter(item=>!item.removed_at)).find(item=>item.id===input.element_id);
 if(!element||!["video_clip","still"].includes(element.type))throw new Error("Choose an active video or picture clip");
 const props=(element.props??{}) as Record<string,unknown>;
 const probed=props[PREPARED_PICTURE_SIZE_PROP] as {width:number;height:number}|undefined;
 const source=typeof props.source_width==="number"&&typeof props.source_height==="number"?{width:props.source_width,height:props.source_height}:probed;
 if(!source)throw toolError("SOURCE_SIZE_UNKNOWN","The clip's picture size is not known yet; wait for its preparation to finish.",{action:"check_readiness",tool:"media_readiness"});
 const composition=getCompositionDimensions(readMetadata(projectId).output_aspect_ratio as TimelineAspectRatio);
 const mask=input.mask_inset?{top:input.mask_inset[0]!,right:input.mask_inset[1]!,bottom:input.mask_inset[2]!,left:input.mask_inset[3]!}:readMaskInsetProps(props);
 const frames=input.regions.map(region=>({region,...transformForSourceRect(source,composition,region,mask,input.fit??"fit")}));
 const clamped=frames.flatMap((frame,index)=>frame.clamped?[index]:[]);
 const base={element_id:element.id,source,canvas:composition,mask_inset:[mask.top,mask.right,mask.bottom,mask.left],...(clamped.length?{clamped_regions:clamped}:{})};
 if(frames.length===1&&input.regions[0]!.t===undefined){
  const [frame]=frames;
  return {...base,props:{media_scale:frame!.scale,media_offset_x:frame!.offsetX,media_offset_y:frame!.offsetY},
   next:"Put props on a proposal_create operation for this clip (patch props on the existing clip, or the same fields on create_visual)."};
 }
 if(input.regions.some(region=>region.t===undefined))throw new Error("Give every region a time (t, seconds into the clip) to animate between them");
 if(input.regions[0]!.t!==0||input.regions.some((region,index)=>index&&region.t!<=input.regions[index-1]!.t!))throw new Error("Region times start at 0 and increase");
 if(input.regions.at(-1)!.t!>element.duration+1e-6)throw new Error(`Region times must fit within the clip's ${element.duration.toFixed(2)} s`);
 const track=(value:(frame:typeof frames[number])=>number)=>frames.map((frame,index)=>({t:frame.region.t!,v:value(frame),...(index?{ease:frame.region.ease??"easeInOut"}:{})}));
 return {...base,props:{transition_keyframes:{media_scale:track(frame=>frame.scale),media_offset_x:track(frame=>frame.offsetX),media_offset_y:track(frame=>frame.offsetY)}},
  next:"Put props on a proposal_create operation for this clip; hold a framing by repeating a region at a later time. Its Zoom amount and timing become card dials."};
}
