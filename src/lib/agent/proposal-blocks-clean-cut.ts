import { z } from "zod";
import { blockElementId, type BlockDefinition } from "./proposal-block-kit";
const n = z.number().finite();
const take = z.object({source_url:z.string().min(1),source_duration_seconds:n.positive(),source_start_seconds:n.nonnegative()}).strict();
export const cleanCutInputs = z.object({
 plate:take.describe("Matching empty locked-camera scene with at least three seconds of handles from its start."),
 performance:take.describe("Untreated landing performance starting at the selected first fully visible jump/landing frame."),
 performance_duration_seconds:n.positive().max(600),
 empty_seconds:n.min(.1).max(3).default(2/3),
 timeline_start:n.nonnegative().default(0),
 lane:z.object({lane_key:z.string().regex(/^visual_\d+$/),lane_index:n.int().nonnegative()}).strict().default({lane_key:"visual_0",lane_index:0}),
}).strict().superRefine((i,c)=>{
 if(i.plate.source_start_seconds+3>i.plate.source_duration_seconds+1e-6)c.addIssue({code:"custom",message:"Empty plate needs three seconds of real handles for the full hold dial"});
 if(i.performance.source_start_seconds+i.performance_duration_seconds>i.performance.source_duration_seconds+1e-6)c.addIssue({code:"custom",message:"Landing performance exceeds its real source handles"});
 if(i.lane.lane_key!==`visual_${i.lane.lane_index}`)c.addIssue({code:"custom",message:"Visual lane key and index must match"});
});
export const cleanCutBlock:BlockDefinition<z.infer<typeof cleanCutInputs>>={
 kind:"clean_plate_cut",version:1,label:"Person Appear",
 description:"A frame-aligned hard cut from matching empty scene to a selected whole-person landing, followed by continuous normal-speed performance. No fade, scale flight, segmentation or generated plate. Source registration and first visible frame require inspection.",
 inputs:cleanCutInputs,
 settings:{
  empty_seconds:{kind:"number",label:"Empty scene",unit:"seconds",min:.1,max:3,step:.01,default:i=>i.empty_seconds,tier:"main"},
  volume:{kind:"number",label:"Original sound",unit:"percent",min:0,max:200,step:1,default:100,off:0,tier:"main"},
  plate_audio:{kind:"choice",label:"Empty scene sound",tier:"advanced",default:"silent",choices:[{value:"silent",label:"Silent"},{value:"original",label:"Original"}]},
 },instances:()=>({}),
 compile(i,s,c){
  cleanCutInputs.parse(i);
  const empty=Math.max(1,Math.round(Number(s.empty_seconds)*c.fps))/c.fps;
  const start=i.timeline_start;
  for(const v of [start,i.performance_duration_seconds,i.plate.source_start_seconds,i.performance.source_start_seconds,
   i.plate.source_duration_seconds-i.plate.source_start_seconds-empty,
   i.performance.source_duration_seconds-i.performance.source_start_seconds-i.performance_duration_seconds]){
   if(Math.abs(v*c.fps-Math.round(v*c.fps))>1e-5)throw new Error("Clean plate cut source trims, performance duration and placement must align to the project frame grid");
  }
  const ref=(role:string)=>({element_id:blockElementId(c,role),block_ref:{block_id:c.block_id,role,index:0}});
  const visual=(role:string,src:z.infer<typeof take>,at:number,duration:number,volume:number)=>({...ref(role),create_visual:{
   type:"video_clip",title:role==="plate"?"Empty scene":"Normal landing performance",source_url:src.source_url,source_duration_seconds:src.source_duration_seconds,
   source_start_seconds:src.source_start_seconds,source_end_seconds:src.source_start_seconds+duration,
   timeline_start:at,playback_rate:1,...i.lane,volume,
  }});
  return [visual("plate",i.plate,start,empty,s.plate_audio==="original"?Number(s.volume)/100:0),
   visual("landing",i.performance,start+empty,i.performance_duration_seconds,Number(s.volume)/100)];
 },
};
