/** Read-only native GPU verification of an actual MCP proposal_preview receipt.
 * Writes only engineering artifacts, never a project timeline or user export.
 * --preview <receipt.json> --out <directory> --fps <composition-fps>
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { Input, ALL_FORMATS, BufferSource } from "mediabunny";
import { buildCompositionElements } from "../src/lib/render/composition-adapters";
import { buildTimelineTransitionLayout } from "../src/lib/timeline/transitions";
import { withFrameRate } from "../src/lib/timeline/frame-rate-scope";
import { renderBrowserVideo } from "../src/lib/render/browser-renderer";

async function main() {
 const args=process.argv.slice(2), flag=(key:string)=>args[args.indexOf(key)+1];
 for(const key of ["--preview","--out","--fps"]) if(!args.includes(key)) throw new Error(`${key} required`);
 const receiptPath=path.resolve(flag("--preview")), out=path.resolve(flag("--out")), fps=Number(flag("--fps"));
 const width=args.includes("--width")?Number(flag("--width")):270,height=args.includes("--height")?Number(flag("--height")):480;
 assert.ok(Number.isInteger(width)&&width>0&&Number.isInteger(height)&&height>0);
 assert.ok(Number.isFinite(fps)&&fps>0);
 const bytes=fs.readFileSync(receiptPath), receipt=JSON.parse(bytes.toString()), data=receipt.timeline?receipt:receipt.content?.map((c:{text?:string})=>{try{return JSON.parse(c.text??"")}catch{return null}}).find((v:unknown)=>v&&typeof v==="object"&&"timeline"in v);
 assert.ok(data?.timeline?.elements?.length,"Actual MCP derived timeline receipt required");
 const timeline=data.timeline, baseUrl=process.env.TIMELINE_EDITOR_BASE_URL??"http://127.0.0.1:3137";
 // The production audio mixer accepts local files or absolute HTTP URLs; a browser
 // relative media URL must retain the same authority outside the page as inside it.
 const absoluteUrls=(value:unknown):unknown=>typeof value==="string"&&value.startsWith("/api/")?baseUrl+value:Array.isArray(value)?value.map(absoluteUrls):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).map(([key,item])=>[key,absoluteUrls(item)])):value;
 const layout=withFrameRate(fps,()=>buildTimelineTransitionLayout(timeline.elements.filter((e:{removed_at?:string|null})=>e.removed_at==null),timeline.transitions??[]));
 const elements=absoluteUrls(withFrameRate(fps,()=>buildCompositionElements(layout.renderedElements,new Set(timeline.muted_lane_keys??[]),new Set(timeline.hidden_lane_keys??[])))) as ReturnType<typeof buildCompositionElements>;
 const frames=Math.max(1,Math.round(layout.effectiveDurationSeconds*fps));
 fs.mkdirSync(out,{recursive:true}); const output=path.join(out,"native-preview-result.mp4");
 await renderBrowserVideo({gpu:true,baseUrl,width,height,fps,durationInFrames:frames,inputProps:{elements,laneOrderKeys:timeline.lane_order_keys??[]},outputLocation:output,concurrency:1});
 const resultBytes=fs.readFileSync(output), media=new Input({formats:ALL_FORMATS,source:new BufferSource(resultBytes)}), video=await media.getPrimaryVideoTrack();
 assert.ok(video);const stats=await video.computePacketStats();assert.equal(stats.packetCount,frames);
 const audio=await media.getPrimaryAudioTrack(); media.dispose();
 const report={scope:"Read-only native MCP candidate engineering proof; no timeline write, Apply or user export",receipt:receiptPath,receipt_sha256:createHash("sha256").update(bytes).digest("hex"),proposal_id:data.proposal_id,frames,fps,width,height,audio_track_present:Boolean(audio),renderer:"production Browser GPU and production audio mixer",output,output_sha256:createHash("sha256").update(resultBytes).digest("hex"),unverified:["Actual listening","Full artifact QA","UI reset/Undo and human approval","Reference fidelity must be graded independently"]};
 fs.writeFileSync(path.join(out,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1});
