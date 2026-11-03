import { z } from "zod";
import { blockElementId, framesToSeconds, secondsToFrames, type BlockDefinition, type BlockOperation } from "./proposal-block-kit";
const finite=z.number().finite();
const take=z.object({source_url:z.string().min(1).max(2048),source_duration_seconds:finite.positive(),source_start_seconds:finite.min(0)}).strict();
const lane=z.object({lane_key:z.string().regex(/^visual_\d+$/),lane_index:finite.int().min(0)}).strict().refine(l=>l.lane_key===`visual_${l.lane_index}`,"Visual lane key and index must match.");
export const objectLedWipeInputs=z.object({
 outgoing:take.extend({source_end_seconds:finite.positive()}).strict(), incoming:take,
 duration_seconds:finite.positive().max(600),timeline_start:finite.min(0).default(0),
 boundary:z.array(z.object({source_seconds:finite.min(0),top:finite.min(0).max(.95),angle:finite.min(-180).max(180)}).strict()).min(2).max(120)
  .describe("Measured upper boundary behind the moving object on the outgoing original source clock. Top is canvas-height fraction, angle degrees. Top zero is untreated. Include the final floor/occluder hold; do not infer these marks from a flattened result."),
 lanes:z.object({incoming:lane,outgoing:lane}).strict().default({incoming:{lane_key:"visual_0",lane_index:0},outgoing:{lane_key:"visual_1",lane_index:1}}),
 lane_order_keys:z.array(z.string().min(1)).min(2).max(64),remove_element_ids:z.array(z.string().uuid()).max(32).default([]),
}).strict().superRefine((i,ctx)=>{
 if(i.outgoing.source_end_seconds<=i.outgoing.source_start_seconds||i.outgoing.source_end_seconds>i.outgoing.source_duration_seconds+1e-6)ctx.addIssue({code:"custom",path:["outgoing"],message:"Outgoing playable window must lie inside its original."});
 if(Math.abs(i.boundary[0].source_seconds-i.outgoing.source_start_seconds)>1e-6)ctx.addIssue({code:"custom",path:["boundary"],message:"Boundary marks must start at the outgoing source in and increase."});
 if(i.boundary.some((p,n)=>p.source_seconds<i.outgoing.source_start_seconds-1e-6||p.source_seconds>i.outgoing.source_end_seconds+1e-6||n>0&&p.source_seconds<=i.boundary[n-1].source_seconds))ctx.addIssue({code:"custom",path:["boundary"],message:"Boundary marks must increase within the outgoing source window."});
 if(new Set(i.lane_order_keys).size!==i.lane_order_keys.length||i.lanes.incoming.lane_key===i.lanes.outgoing.lane_key||i.lane_order_keys.indexOf(i.lanes.outgoing.lane_key)<0||i.lane_order_keys.indexOf(i.lanes.incoming.lane_key)<0||i.lane_order_keys.indexOf(i.lanes.outgoing.lane_key)>=i.lane_order_keys.indexOf(i.lanes.incoming.lane_key))ctx.addIssue({code:"custom",path:["lane_order_keys"],message:"Outgoing must be above incoming in a complete distinct lane order."});
});
type Inputs=z.infer<typeof objectLedWipeInputs>;
export const objectLedWipeBlock:BlockDefinition<Inputs>={
 kind:"object_led_line_wipe",version:1,label:"Object-led reveal",
 description:"Two locked-camera takes joined behind a moving straight object. Editable source-bound mask position and angle, bounded incoming timing and native outgoing tail hold. Requires measured object edges; not automatic tracking or certified reconstruction.",
 inputs:objectLedWipeInputs,instances:()=>({}),settings:{
  feather:{kind:"number",label:"Edge softness",unit:"percent",min:0,max:1,step:.05,default:.2,tier:"main"},
  incoming_timing:{kind:"number",label:"Reaction timing",unit:"frames",min:-60,max:60,step:1,default:0,tier:"main",description:"Positive reads later in the incoming take; clamps to real source handles without changing the outgoing clock."},
  edge_offset:{kind:"number",label:"Edge position",unit:"percent",min:-1,max:1,step:.05,default:0,tier:"main"},
  align_x:{kind:"number",label:"Incoming horizontal",unit:"percent",min:-2,max:2,step:.1,default:0,tier:"advanced"},
  align_y:{kind:"number",label:"Incoming vertical",unit:"percent",min:-2,max:2,step:.1,default:0,tier:"advanced"},
  mode:{kind:"choice",label:"Reveal",choices:[{value:"follow",label:"Follow object"},{value:"off",label:"Original take"}],default:"follow",tier:"advanced"},
 },compile:(i,s,ctx)=>{
  const fps=ctx.fps,n=(key:string)=>s[key] as number,frame=(v:number)=>secondsToFrames(v,fps),sec=(v:number)=>framesToSeconds(v,fps);
  for(const v of [i.timeline_start,i.outgoing.source_start_seconds,i.outgoing.source_end_seconds,i.incoming.source_start_seconds,i.duration_seconds])if(Math.abs(v*fps-frame(v))>1e-5)throw Error("Authored source windows and placement must align to project frames.");
  const duration=sec(frame(i.duration_seconds)),playable=i.outgoing.source_end_seconds-i.outgoing.source_start_seconds;
  if(frame(playable)<2||playable>duration+1e-6)throw Error("Outgoing playable window must contain two frames and fit the output; any remainder holds its final playable frame.");
  if(i.incoming.source_start_seconds+duration>i.incoming.source_duration_seconds+1e-6)throw Error("Incoming take lacks continuous source coverage.");
  const low=-frame(i.incoming.source_start_seconds),high=Math.floor((i.incoming.source_duration_seconds-i.incoming.source_start_seconds-duration)*fps+1e-7);
  const slip=Math.max(low,Math.min(high,Math.round(n("incoming_timing"))));
  const incomingStart=i.incoming.source_start_seconds+sec(slip),follow=s.mode!=="off";
  const points=new Map<number,{t:number,top:number,angle:number}>();
  points.set(0,{t:0,top:i.boundary[0].top,angle:i.boundary[0].angle});
  for(const p of i.boundary){const f=frame(p.source_seconds-i.outgoing.source_start_seconds);if(f<0||f>frame(playable))throw Error("Boundary key lies outside the playable outgoing window.");points.set(f,{t:sec(f),top:p.top===0?0:Math.max(0,Math.min(.95,p.top+n("edge_offset")/100)),angle:p.angle});}
  const keys=[...points.entries()].sort((a,b)=>a[0]-b[0]).map(([,p])=>p);
  if(keys.length<2)throw Error("At least two distinct boundary frames are needed.");
  const ref=(role:string)=>({element_id:blockElementId(ctx,role),block_ref:{block_id:ctx.block_id,role,index:0}});
  const operations:BlockOperation[]=i.remove_element_ids.map((id,index)=>({element_id:id,block_ref:{block_id:ctx.block_id,role:"remove",index},remove_visual:{reason:"Replace input-only take with editable object-led reveal."}}));
  operations.push({...ref("lanes"),set_lane_order:{lane_order_keys:i.lane_order_keys}});
  for(const role of ["incoming","outgoing"] as const){const source=i[role],upper=role==="outgoing",start=upper?source.source_start_seconds:incomingStart;
   operations.push({...ref(role),create_visual:{type:"video_clip",title:upper?"Moving object":"Incoming reaction",source_url:source.source_url,source_duration_seconds:source.source_duration_seconds,source_start_seconds:start,source_end_seconds:upper?i.outgoing.source_end_seconds:start+duration,timeline_start:i.timeline_start,...i.lanes[role],volume:0,...(upper?{trailing_hold_seconds:duration-playable}:{}),
    ...(upper&&follow?{mask_inset:[keys[0].top,0,0,0],mask_line_rotation:keys[0].angle,mask_feather:n("feather")/100,mask_inset_keyframes:keys.map(p=>({t:p.t,v:[p.top,0,0,0],ease:"linear"})),transition_keyframes:{mask_line_rotation:keys.map(p=>({t:p.t,v:p.angle,ease:"linear"}))}}:{}),
    ...(!upper?{media_offset_x:n("align_x")/50,media_offset_y:n("align_y")/50}:{})}});
  }
  // A bounded native tail hold preserves the last playable original frame; never read terminal black or fabricate moving pixels.
  if(duration-playable>30+1e-6)throw Error("Native outgoing tail hold is limited to30seconds.");
  return operations;
 }
};
