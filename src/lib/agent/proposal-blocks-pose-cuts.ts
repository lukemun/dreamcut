import { z } from "zod";
import { blockElementId, type BlockDefinition } from "./proposal-block-kit";
const n=z.number().finite(),source=z.object({source_url:z.string().min(1),source_duration_seconds:n.positive()}).strict();
export const poseCutInputs=z.object({
 source,
 poses:z.array(z.object({label:z.string().min(1).max(120),source_start_seconds:n.nonnegative(),frames:n.int().min(2).max(12)}).strict()).min(2).max(16),
 line:z.object({source_start_seconds:n.nonnegative(),source_end_seconds:n.positive()}).strict(),
 timeline_start:n.nonnegative().default(0),
 lane:z.object({lane_key:z.string().regex(/^visual_\d+$/),lane_index:n.int().nonnegative()}).strict().default({lane_key:"visual_0",lane_index:0}),
 click:source.extend({peak_seconds:n.nonnegative(),enabled_cuts:z.array(z.boolean()).max(16).optional(),lane_key:z.string().regex(/^sound_effect_\d+$/).default("sound_effect_0"),lane_index:n.int().nonnegative().default(0)}).strict().optional(),
}).strict().superRefine((i,c)=>{
 if(i.line.source_end_seconds<=i.line.source_start_seconds||i.line.source_end_seconds>i.source.source_duration_seconds)c.addIssue({code:"custom",message:"Spoken line must be a real ordered source window"});
 if(i.lane.lane_key!==`visual_${i.lane.lane_index}`)c.addIssue({code:"custom",message:"Visual lane key/index must match"});
 if(i.click&&(i.click.peak_seconds>=i.click.source_duration_seconds||i.click.lane_key!==`sound_effect_${i.click.lane_index}`))c.addIssue({code:"custom",message:"Click peak must lie inside sound; sound lane key/index must match"});
 if(i.click?.enabled_cuts&&i.click.enabled_cuts.length!==i.poses.length)c.addIssue({code:"custom",message:"Click selection needs one flag per change, including the line"});
});
export const poseCutBlock:BlockDefinition<z.infer<typeof poseCutInputs>>={
 kind:"pose_cut_sequence",version:1,label:"Jump Cuts",
 description:"Quick normal-speed pose windows followed by a complete normal-speed spoken line, with optional supplied clicks peaking at each change. Source marks and complete words require inspection; no speech/action detector, movement or transition is invented.",
 inputs:poseCutInputs,
 settings:{
  pose_frames:{kind:"number",label:"Time on screen",unit:"frames",min:2,max:12,step:1,default:(i,j)=>i.poses[j]!.frames,per:"pose",tier:"main",first_main:true},
  click_volume:{kind:"number",label:"Click volume",unit:"percent",min:0,max:200,step:1,default:45,off:0,tier:"main",hidden:i=>!i.click},
  voice_volume:{kind:"number",label:"Voice volume",unit:"percent",min:0,max:200,step:1,default:100,off:0,tier:"advanced"},
 },
 instances:i=>({pose:i.poses.map(p=>p.label)}),
 sections:i=>[{label:"Sound",fields:["click_volume","voice_volume"]},...i.poses.map((p,j)=>({label:p.label,fields:[`pose_frames.${j}`]}))],
 compile(i,s,c){
  poseCutInputs.parse(i);const fps=c.fps;
  for(const t of [i.timeline_start,i.line.source_start_seconds,i.line.source_end_seconds,...i.poses.map(p=>p.source_start_seconds)])if(Math.abs(t*fps-Math.round(t*fps))>1e-5)throw new Error("Pose cuts require frame-aligned source marks and timeline placement");
  if(i.poses.some(p=>p.source_start_seconds+12/fps>i.source.source_duration_seconds+1e-6))throw new Error("Every pose needs12frames of real handles for its full dial");
  if(i.click&&i.click.peak_seconds>=2/fps)throw new Error("Click peak needs to occur within the shortest two-frame cut; prepare a short leading handle");
  const ref=(role:string,index=0)=>({element_id:blockElementId(c,role,index),block_ref:{block_id:c.block_id,role,index}});
  const frames=s.pose_frames as number[];let at=i.timeline_start;
  const videos=[...i.poses.map((p,j)=>({role:"pose",index:j,title:p.label,start:p.source_start_seconds,end:p.source_start_seconds+frames[j]!/fps,volume:0})),
   {role:"line",index:0,title:"Your line to camera",start:i.line.source_start_seconds,end:i.line.source_end_seconds,volume:Number(s.voice_volume)/100}]
   .map(p=>{const op={...ref(p.role,p.index),create_visual:{type:"video_clip",title:p.title,source_url:i.source.source_url,source_duration_seconds:i.source.source_duration_seconds,source_start_seconds:p.start,source_end_seconds:p.end,timeline_start:at,playback_rate:1,volume:p.volume,...i.lane}};at+=(p.end-p.start);return op;});
  if(!i.click)return videos;
  const click=i.click,events=videos.slice(1).map((v,j)=>({v,j})).filter(({j})=>click.enabled_cuts?.[j]??true);
  return [...videos,...events.map(({v,j},index)=>{
   const start=v.create_visual.timeline_start-click.peak_seconds;
   const next=events[index+1]?.v;const duration=Math.min(click.source_duration_seconds,next?next.create_visual.timeline_start-v.create_visual.timeline_start:click.source_duration_seconds);
   return {...ref("click",j),create_audio:{type:"sound_effect",title:"Jump cut click",source_url:click.source_url,source_duration_seconds:click.source_duration_seconds,source_start_seconds:0,source_end_seconds:duration,timeline_start:start,volume:Number(s.click_volume)/100,lane_key:click.lane_key,lane_index:click.lane_index,follows_visual:{element_id:v.element_id,offset_seconds:-click.peak_seconds}}};
  })];
 },
};
