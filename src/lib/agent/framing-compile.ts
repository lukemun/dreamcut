import {z} from "zod";
import {readMetadata,readTimeline} from "../local-store/store";
import {withPreparedPictureSize} from "../local-store/prepared-picture-size";
import {PREPARED_PICTURE_SIZE_PROP} from "../media-analysis/visual-overlap";
import {getCompositionDimensions} from "../render/composition-adapters";
import {containRect,transformForSourceRect} from "../timeline/framing-geometry";
import {readMaskInsetProps} from "../timeline/media-transform";
import type {TimelineAspectRatio} from "@/components/studio/timeline/types";
import {toolError} from "./tool-error";
import fs from "node:fs";
import path from "node:path";
import {projectMediaDir} from "../local-store/paths";
import {followCentres,simplifyTrack,trackCursor} from "../media-analysis/cursor-track";
import {resolveNumberKeyframe} from "../timeline/keyframes";
import {sourceTimeToTimelineTime,timelineTimeToSourceTime} from "../timeline/speed-steps";

const share=z.number().min(0).max(1);
const schema=z.object({element_id:z.string().uuid(),
 regions:z.array(z.object({t:z.number().min(0).max(600).optional(),x:share,y:share,width:share.refine(value=>value>0),height:share.refine(value=>value>0),
  ease:z.enum(["linear","easeIn","easeOut","easeInOut","hold"]).optional()}).strict()).min(1).max(20),
 fit:z.enum(["fit","fill"]).optional(),
 mask_inset:z.array(z.number().min(0).max(0.95)).length(4).optional(),
 follow_cursor:z.object({follow:share.optional(),smoothing:z.number().min(0.1).max(5).optional(),dead_zone:z.number().min(0).max(0.9).optional()}).strict().optional()}).strict();

const FOLLOW_FPS=10,MAX_KEYS=120;

/**
 * Turn regions of a picture's source (fractions of its frame) into the clip's scale and offsets:
 * one region gives a still framing, several timed regions give push-ins and pans as keyframes.
 * Measures the clip's own source and crop, so a wide screen recording in a tall half frames the
 * part asked for. Writes nothing.
 */
export async function compileFraming(projectId:string,raw:unknown){
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
 if(input.follow_cursor&&(input.follow_cursor.follow??0.6)>0){
  if(input.regions.length>1)validateTimes(input.regions,element.duration);
  return {...base,...await followCursor(projectId,element,source,composition,mask,input)};
 }
 if(frames.length===1&&input.regions[0]!.t===undefined){
  const [frame]=frames;
  return {...base,props:{media_scale:frame!.scale,media_offset_x:frame!.offsetX,media_offset_y:frame!.offsetY},
   next:"Put props on a proposal_create operation for this clip (patch props on the existing clip, or the same fields on create_visual)."};
 }
 validateTimes(input.regions,element.duration);
 // A keyframe's ease shapes the move to the next keyframe, so each region's ease ("how the camera moves
 // into this framing") belongs on the keyframe before it; putting it on its own key made holds snap.
 const track=(value:(frame:typeof frames[number])=>number)=>frames.map((frame,index)=>{
  const next=frames[index+1];
  return {t:frame.region.t!,v:value(frame),...(next?{ease:next.region.ease??"easeInOut"}:{})};
 });
 return {...base,props:{transition_keyframes:{media_scale:track(frame=>frame.scale),media_offset_x:track(frame=>frame.offsetX),media_offset_y:track(frame=>frame.offsetY)}},
  next:"Put props on a proposal_create operation for this clip; hold a framing by repeating a region at a later time. Its Zoom amount and timing become card dials."};
}

type Input=z.infer<typeof schema>;
type Region=Input["regions"][number];

function validateTimes(regions:Region[],duration:number){
 if(regions.some(region=>region.t===undefined))throw new Error("Give every region a time (t, seconds into the clip) to animate between them");
 if(regions[0]!.t!==0||regions.some((region,index)=>index&&region.t!<=regions[index-1]!.t!))throw new Error("Region times start at 0 and increase");
 if(regions.at(-1)!.t!>duration+1e-6)throw new Error(`Region times must fit within the clip's ${duration.toFixed(2)} s`);
}

/** The region the regions ask for at clip time t, eased the way their keyframes would move. */
function regionAt(regions:Region[]){
 if(regions.length===1){const [only]=regions;return ()=>({x:only!.x,y:only!.y,width:only!.width,height:only!.height});}
 const track=(value:(region:Region)=>number)=>regions.map((region,index)=>({t:region.t!,v:value(region),...(regions[index+1]?{ease:regions[index+1]!.ease??"easeInOut"}:{})}));
 const props={keyframes:{x:track(r=>r.x),y:track(r=>r.y),width:track(r=>r.width),height:track(r=>r.height)}};
 return (t:number)=>({x:resolveNumberKeyframe(props,"x",t,0),y:resolveNumberKeyframe(props,"y",t,0),width:resolveNumberKeyframe(props,"width",t,1),height:resolveNumberKeyframe(props,"height",t,1)});
}

/**
 * Screen recordings: track the pointer through the clip and let each framing lean toward it with a
 * spring, so the camera drifts after the mouse instead of holding still. follow 0 is the plain framing.
 */
async function followCursor(projectId:string,element:{id:string;type:string;source_url?:string|null;duration:number}&Parameters<typeof timelineTimeToSourceTime>[0],
 source:{width:number;height:number},composition:{width:number;height:number},mask:{top:number;right:number;bottom:number;left:number},input:Input){
 if(element.type!=="video_clip")throw new Error("Following the pointer needs a video clip");
 const prefix=`/api/projects/${encodeURIComponent(projectId)}/media/`,root=path.resolve(projectMediaDir(projectId));
 if(!element.source_url?.startsWith(prefix))throw new Error("Following the pointer needs the clip's recording in this project's media");
 const file=path.resolve(root,decodeURIComponent(element.source_url.slice(prefix.length).split("?")[0]!));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file))throw new Error("The clip's recording is missing");
 const from=timelineTimeToSourceTime(element,0),to=timelineTimeToSourceTime(element,element.duration);
 const start=Math.min(from,to),seen=await trackCursor(file,start,Math.abs(to-from),FOLLOW_FPS);
 const found=seen.filter(sample=>sample.seen).length;
 const samples=seen.map(sample=>({...sample,t:Math.min(element.duration,sourceTimeToTimelineTime(element,start+sample.t))})).sort((a,b)=>a.t-b.t);
 if(!samples.length||samples[0]!.t>0)samples.unshift({...(samples[0]??{x:0.5,y:0.5,seen:false}),t:0});
 if(samples.at(-1)!.t<element.duration)samples.push({...samples.at(-1)!,t:element.duration});
 const follow=input.follow_cursor!,options={follow:follow.follow??0.6,smoothing:follow.smoothing??0.8,dead_zone:follow.dead_zone??0.4};
 // Lean in only as far as the framing has pushed in: the widest region (often the whole app window) stays
 // still and bounds the view, so the drift never shows what that framing leaves out.
 const widest=input.regions.reduce((wide,region)=>region.width*region.height>wide.width*wide.height?region:wide);
 const tightest=Math.min(...input.regions.map(region=>region.width/widest.width));
 const anchor=regionAt(input.regions),bounds=input.regions.length>1?widest:undefined;
 const pulled=(t:number)=>{const region=anchor(t);return {...region,pull:bounds?(tightest>=1?0:Math.min(1,Math.max(0,(1-region.width/widest.width)/(1-tightest)))):1};};
 const views=followCentres(samples.filter((sample,index)=>!index||sample.t>samples[index-1]!.t+1e-6),pulled,options,bounds);
 // The zoom keeps the regions' own few eased keys (so the card's zoom and timing dials read them); only
 // the position follows. Each view is resized to exactly the zoom at its moment before placing it.
 const fit=input.fit??"fit",regionScale=input.regions.map(region=>transformForSourceRect(source,composition,region,mask,fit).scale);
 const scaleTrack=input.regions.length>1?input.regions.map((region,index)=>({t:region.t!,v:regionScale[index]!,...(input.regions[index+1]?{ease:input.regions[index+1]!.ease??"easeInOut"}:{})})):[{t:0,v:regionScale[0]!},{t:element.duration,v:regionScale[0]!}];
 const base=containRect(source,composition),visibleWidth=(1-mask.left-mask.right)*composition.width,visibleHeight=(1-mask.top-mask.bottom)*composition.height;
 const frames=views.map(view=>{
  const zoom=resolveNumberKeyframe({keyframes:{media_scale:scaleTrack}},"media_scale",view.t,1);
  const width=visibleWidth/(zoom*base.width),height=visibleHeight/(zoom*base.height);
  return {t:view.t,...transformForSourceRect(source,composition,{x:view.x+view.width/2-width/2,y:view.y+view.height/2-height/2,width,height},mask,fit)};
 });
 // Dense samples become a few linear keys: loosen the tolerance until every track fits the key limit.
 let tolerance=0.002,tracks:Record<"media_scale"|"media_offset_x"|"media_offset_y",{t:number;v:number}[]>;
 do{
  tracks={media_scale:scaleTrack,
   media_offset_x:simplifyTrack(frames.map(frame=>({t:frame.t,v:frame.offsetX})),tolerance),
   media_offset_y:simplifyTrack(frames.map(frame=>({t:frame.t,v:frame.offsetY})),tolerance)};
  tolerance*=1.5;
 }while(Object.values(tracks).some(track=>track.length>MAX_KEYS));
 // Round times to the millisecond without stepping past the clip's end, which the proposal refuses.
 const last=Math.floor(element.duration*1000)/1000;
 const keys=(track:{t:number;v:number}[])=>track.map((key,index)=>({t:Math.min(last,Math.round(key.t*1000)/1000),v:key.v,...(index<track.length-1?{ease:"linear" as const}:{})}));
 return {follow_cursor:{...options,pointer_found_share:seen.length?Math.round(found/seen.length*100)/100:0,
   ...(found?{}:{warning:"The pointer was never found in this clip, so the framing holds still."})},
  props:{transition_keyframes:{media_scale:scaleTrack.map(key=>({...key,t:Math.min(last,key.t)})),media_offset_x:keys(tracks.media_offset_x),media_offset_y:keys(tracks.media_offset_y)}},
  next:"Put props on a proposal_create operation for this clip. The camera drifts after the pointer; recompile with a lower follow or longer smoothing for a calmer move, or follow 0 for a still framing."};
}
