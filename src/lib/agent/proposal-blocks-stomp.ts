import { z } from "zod";
import { blockElementId, secondsToFrames, type BlockDefinition } from "./proposal-block-kit";
const finite = z.number().finite();
export const impactStepInputs = z.object({
  source_url: z.string().min(1).max(2048),
  source_duration_seconds: finite.positive(), source_start_seconds: finite.nonnegative(),
  duration_seconds: finite.positive().max(600), timeline_start: finite.nonnegative().default(0),
  panel_scale: finite.min(.1).max(3).describe("Measured scale that fits the full landscape source width inside the portrait canvas; no crop or baked text."),
  start_y_percent: finite.min(-50).max(0).default(0),
  impacts: z.array(z.object({ source_time_seconds: finite.nonnegative(), drop_percent: finite.positive().max(50) }).strict()).min(1).max(40),
  lane_index: z.number().int().nonnegative().default(1),
  lane_order_keys: z.array(z.string().regex(/^[a-z0-9_:-]{1,128}$/)).min(1).max(64),
}).strict().superRefine((i, c) => {
  if (i.impacts.reduce((sum, x) => sum + x.drop_percent, 0) > 80) c.addIssue({code:"custom",path:["impacts"],message:"Total descent must be at most 80 percent of canvas height."});
  if (new Set(i.lane_order_keys).size !== i.lane_order_keys.length || !i.lane_order_keys.includes(`visual_${i.lane_index}`)) c.addIssue({code:"custom",path:["lane_order_keys"],message:"Complete unique lane order must include the panel lane."});
});
/** Source stays continuous at 1x; only the panel's native translation changes. */
export const impactStepBlock: BlockDefinition<z.infer<typeof impactStepInputs>> = {
  kind:"impact_step", version:1, label:"Stomp Reveal",
  description:"Lower one continuous landscape panel at measured foot contacts, uncovering separately editable content beneath it. Draft native construction; source contact measurement and visual acceptance required.",
  inputs:impactStepInputs,
  settings:{
    distance:{kind:"number",label:"Drop distance",unit:"percent",min:0,max:100,step:1,default:100,off:0,tier:"main"},
    descent_frames:{kind:"number",label:"Drop duration",unit:"frames",min:1,max:12,step:1,default:2,tier:"main",description:"Each drop ends at its measured contact. Longer drops clamp to the available gap, preserving every contact."},
    volume:{kind:"number",label:"Recorded sound",unit:"percent",min:0,max:100,step:1,default:100,tier:"main"},
  },
  instances:()=>({}),
  compile:(i,s,ctx)=>{
    const frames=secondsToFrames(i.duration_seconds,ctx.fps), duration=frames/ctx.fps;
    if(frames<2) throw new Error("Panel requires at least two frames.");
    if(i.source_start_seconds+duration>i.source_duration_seconds+1e-6) throw new Error("Continuous panel exceeds source handles.");
    const contacts=i.impacts.map(x=>secondsToFrames(x.source_time_seconds-i.source_start_seconds,ctx.fps));
    if(contacts.some((f,j)=>f<1 || f>=frames || (j>0 && f<=contacts[j-1]))) throw new Error("Contacts must be strictly increasing distinct output frames inside the source window.");
    const keys=new Map<number,number>(); let y=i.start_y_percent/50, previous=0; keys.set(0,y);
    contacts.forEach((frame,j)=>{
      const begin=Math.max(previous,frame-Math.round(s.descent_frames as number));
      keys.set(begin,y); y+=i.impacts[j].drop_percent/50*(s.distance as number)/100; keys.set(frame,y); previous=frame;
    });
    keys.set(frames-1,y);
    const ref=(role:string)=>({element_id:blockElementId(ctx,role),block_ref:{block_id:ctx.block_id,role,index:0}});
    return [{...ref("lane_order"),set_lane_order:{lane_order_keys:i.lane_order_keys}},
      {...ref("panel"),create_visual:{type:"video_clip",title:"Stomp panel",source_url:i.source_url,source_duration_seconds:i.source_duration_seconds,
        source_start_seconds:i.source_start_seconds,source_end_seconds:i.source_start_seconds+duration,
        timeline_start:secondsToFrames(i.timeline_start,ctx.fps)/ctx.fps,playback_rate:1,volume:(s.volume as number)/100,
        lane_key:`visual_${i.lane_index}`,lane_index:i.lane_index,media_scale:i.panel_scale,
        transition_keyframes:{media_offset_y:[...keys].sort((a,b)=>a[0]-b[0]).map(([f,v])=>({t:f/ctx.fps,v,ease:"linear"}))}}}];
  },
};
