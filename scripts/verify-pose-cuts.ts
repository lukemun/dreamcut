/** Supplied-footage native pose_cut_sequence picture+sound proof; no existing timeline writes.
 * --source <supplied-video> --click <supplied-wav> --out <directory>
 * --case <JSON: {fps, poses:[{label,source_start_seconds,frames}],line:{source_start_seconds,source_end_seconds},click_peak_seconds}>
 */
import fs from "node:fs";import os from "node:os";import path from "node:path";import http from "node:http";
import {createHash}from"node:crypto";import assert from"node:assert/strict";
import {Input,ALL_FORMATS,BufferSource}from"mediabunny";
import {editorAgentOptionSchema,deriveProposalTimeline}from"../src/lib/agent/timeline-editor-agent-apply";
import {projectMediaDir}from"../src/lib/local-store/paths";import{writePreparation}from"../src/lib/local-store/media-preparation";
import{buildCompositionElements}from"../src/lib/render/composition-adapters";import{renderBrowserVideo}from"../src/lib/render/browser-renderer";
async function main(){
 const args=process.argv.slice(2),flag=(n:string)=>args[args.indexOf(n)+1];for(const n of["--source","--click","--case","--out"])if(!args.includes(n))throw new Error(`${n} required`);
 const source=path.resolve(flag("--source")),click=path.resolve(flag("--click")),out=path.resolve(flag("--out")),selection=JSON.parse(fs.readFileSync(flag("--case"),"utf8")),fps=selection.fps;
 fs.mkdirSync(out,{recursive:true});const bytes=fs.readFileSync(source),clickBytes=fs.readFileSync(click);
 const probe=new Input({formats:ALL_FORMATS,source:new BufferSource(bytes)}),track=(await probe.getPrimaryVideoTrack())!,stats=await track.computePacketStats(),duration=stats.packetCount/fps;
 assert.ok(Math.abs(stats.averagePacketRate-fps)<.001,"Use the source CFR clock; do not assume another rate");probe.dispose();
 const cp=new Input({formats:ALL_FORMATS,source:new BufferSource(clickBytes)}),clickDuration=await cp.computeDuration();cp.dispose();
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"pose-cuts-proof-"));process.env.TIMELINE_PROJECTS_DIR=scratch;
 const project="supplied-pose-cuts",media=projectMediaDir(project);fs.mkdirSync(media,{recursive:true});fs.copyFileSync(source,path.join(media,"source.mp4"));fs.copyFileSync(click,path.join(media,"click.wav"));
 const st=fs.statSync(path.join(media,"source.mp4"));
 // Disposable encoded-media verification fixture, not a substitute for media_import.
 writePreparation(project,{recipe:"editor-media-v1",source:"source.mp4",size:st.size,mtime:st.mtimeMs,state:"ready",preview:"source.mp4",render:"source.mp4",duration,alpha:false});
 fs.writeFileSync(path.join(scratch,project,"timeline.json"),JSON.stringify({elements:[],transitions:[]}));fs.writeFileSync(path.join(scratch,project,"metadata.json"),JSON.stringify({frame_rate:fps,delivery_target:"web",hidden_lane_keys:[],output_aspect_ratio:"9:16"}));
 const option=editorAgentOptionSchema.parse({id:"jump-cuts",label:"Jump Cuts",summary:"Four quick poses, then your line",recommended:true,operations:[],blocks:[{block_id:"jump-cuts",kind:"pose_cut_sequence",version:1,seed:"supplied-jump-cuts",frame_rate:fps,settings:{},inputs:{source:{source_url:`/api/projects/${project}/media/source.mp4`,source_duration_seconds:duration},poses:selection.poses,line:selection.line,click:{source_url:`/api/projects/${project}/media/click.wav`,source_duration_seconds:clickDuration,peak_seconds:selection.click_peak_seconds}}}]});
 fs.writeFileSync(path.join(out,"option.json"),JSON.stringify(option,null,2));
 const derived=deriveProposalTimeline({elements:[],transitions:[]},option.operations,project),files:Record<string,string>={"/source.mp4":source,"/click.wav":click};
 const server=http.createServer((req,res)=>{const file=files[req.url??""];res.setHeader("Access-Control-Allow-Origin","*");res.setHeader("Accept-Ranges","bytes");if(!file){res.writeHead(404);res.end();return;}const size=fs.statSync(file).size,m=/bytes=(\d+)-(\d*)/.exec(req.headers.range??""),start=m?Number(m[1]):0,end=m&&m[2]?Math.min(size-1,Number(m[2])):size-1;res.setHeader("Content-Type",file.endsWith("wav")?"audio/wav":"video/mp4");res.setHeader("Content-Length",end-start+1);if(m){res.setHeader("Content-Range",`bytes ${start}-${end}/${size}`);res.writeHead(206);}else res.writeHead(200);fs.createReadStream(file,{start,end}).pipe(res);});
 await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const origin=`http://127.0.0.1:${(server.address()as{port:number}).port}`;
 try{
  const elements=buildCompositionElements(derived.timeline.elements,new Set()).map(e=>{const url=`${origin}/${e.source_url!.endsWith("click.wav")?"click.wav":"source.mp4"}`;return{...e,source_url:url,props:{...e.props,...(e.type==="video_clip"?{preview_source_url:url,archival_source_url:url}:{})}};});
  const frames=Math.round(Math.max(...derived.timeline.elements.map(e=>e.timeline_start+e.duration))*fps),output=path.join(out,"jump-cuts-supplied-result.mp4");
  await renderBrowserVideo({gpu:true,baseUrl:process.env.TIMELINE_EDITOR_BASE_URL??"http://127.0.0.1:3137",width:270,height:480,fps,durationInFrames:frames,inputProps:{elements,laneOrderKeys:["visual_0"]},outputLocation:output,concurrency:1,onProgress:p=>{if(p===1)console.log("Native picture/audio render complete");}});
  const done=new Input({formats:ALL_FORMATS,source:new BufferSource(fs.readFileSync(output))}),v=(await done.getPrimaryVideoTrack())!,a=await done.getPrimaryAudioTrack(),encodedStats=await v.computePacketStats();assert.equal(encodedStats.packetCount,frames);assert.ok(a,"Native audio mix must survive encoding");done.dispose();
  const report={source,source_sha256:createHash("sha256").update(bytes).digest("hex"),source_frames:stats.packetCount,source_fps:fps,click,click_sha256:createHash("sha256").update(clickBytes).digest("hex"),click_peak_source_seconds:selection.click_peak_seconds,source_selection:selection,renderer:"production Browser GPU plus production source-clock audio mix",frames,audio_track_present:true,result:output,result_sha256:createHash("sha256").update(fs.readFileSync(output)).digest("hex"),limits:["Reference main-line timing and complete-word boundaries require listening review","No synthetic or tutorial-crop inputs; not a fresh take","UI Apply/Undo and fresh-session rebuild pending"]};fs.writeFileSync(path.join(out,"report.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{server.close();fs.rmSync(scratch,{recursive:true,force:true});}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
