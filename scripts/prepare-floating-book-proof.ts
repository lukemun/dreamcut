/** Prepares original synthetic fixtures for VISIBLE in-app-browser verification.
 * Does not launch a browser, export user media, or alter a user timeline.
 * Open the printed URL and press a proof button. All runtime work is visible there.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { editorAgentOptionSchema, deriveProposalTimeline } from "../src/lib/agent/timeline-editor-agent-apply";
import { buildCompositionElements } from "../src/lib/render/composition-adapters";
import { projectMediaDir } from "../src/lib/local-store/paths";
import { writePreparation } from "../src/lib/local-store/media-preparation";
import { createProject, readMetadata, writeMetadata } from "../src/lib/local-store/store";

async function main() {
process.env.TIMELINE_PROJECTS_DIR = "/tmp/dreamcut-floating-book-projects";
const project = "floating-pole-engineering-proof";
createProject(project, "web");
const base = process.env.TIMELINE_EDITOR_BASE_URL ?? "http://127.0.0.1:3138";
const out = path.resolve("public/__floating-book-proof");
fs.mkdirSync(out, {recursive:true});
// Preparation is a contract stub only: the visible browser supplies the actual
// original recorded source before any render. This is not ingestion validation.
for (const name of ["base.webm","replacement.webm"]) {
 const file=path.join(projectMediaDir(project),name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,"contract stub; browser records actual original media");const stat=fs.statSync(file);
 writePreparation(project,{recipe:"editor-media-v1",source:name,size:stat.size,mtime:stat.mtimeMs,state:"ready",preview:name,render:name,duration:7,alpha:false});
}
const configs: Record<string, unknown> = {};
for (const [width,height] of [[320,180],[180,320]]) {
  const name = `${width}x${height}`;
  await sharp(Buffer.from(`<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#00ff00"/><rect x="${width*.35}" y="${height*.2}" width="${width*.3}" height="${height*.6}" rx="2" fill="#3388dd"/><path d="M${width*.4} ${height*.3}H${width*.6}" stroke="white" stroke-width="${height*.025}"/><rect x="${width*.4}" y="${height*.5}" width="${width*.06}" height="${height*.15}" fill="#69c1e7"/></svg>`)).png().toFile(path.join(out,`book-${name}.png`));
  writeMetadata(project,{...readMetadata(project),frame_rate:30,output_aspect_ratio:width>height?"16:9":"9:16"},"fixture");
  for (const effect of ["book","pole"]) {
    const inputs = effect==="book" ? {
      background:{source_url:`/api/projects/${project}/media/base.webm`,source_duration_seconds:7,source_start_seconds:1},
      photograph:{source_url:`${base}/__floating-book-proof/book-${name}.png`,key_color:"#00ff00",mask_inset:[.1,.15,.1,.15]},
      canvas:{width,height},duration_seconds:2,from:{x:35,y:75},to:{x:65,y:15},lane_order_keys:["visual_2","visual_1","visual_0"],
    } : {
      base:{source_url:`/api/projects/${project}/media/base.webm`,source_duration_seconds:7,source_start_seconds:1},
      replacement:{source_url:`/api/projects/${project}/media/replacement.webm`,source_duration_seconds:7,source_start_seconds:2},
      duration_seconds:4,seam_percent:50,lane_order_keys:["visual_1","visual_0"],
    };
    const block = {block_id:`${effect}-${name}`,kind:effect==="book"?"keyed_still_motion":"static_scene_split",version:1,frame_rate:30,seed:"original-proof",inputs,settings:effect==="book"?{travel:100,turn:12,size:40,growth:30}:{}};
    const option = editorAgentOptionSchema.parse({id:"proof",label:"Engineering proof",summary:"Original synthetic inputs only",recommended:true,operations:[],blocks:[block]});
    const timeline=deriveProposalTimeline({elements:[],transitions:[]},option.operations,project).timeline;
    configs[`${effect}-${name}`]={gpu:true,width,height,fps:30,durationInFrames:effect==="book"?60:120,inputProps:{elements:buildCompositionElements(timeline.elements,new Set()),laneOrderKeys:inputs.lane_order_keys}};
  }
}
fs.writeFileSync(path.join(out,"configs.json"),JSON.stringify(configs));
fs.writeFileSync(path.join(out,"index.html"),`<!doctype html><html><head><meta charset="utf-8"><title>Floating Book and Magic Pole — synthetic GPU proof</title><style>body{font:16px system-ui;background:#20242b;color:white;padding:24px}button,a{padding:12px;margin:5px;display:inline-block}iframe{border:2px solid #667;display:block;background:black}pre{white-space:pre-wrap}</style></head><body><h1>Native effect engineering proof</h1><p>Original synthetic inputs. This cannot certify real course footage, hand contact or fresh-input reuse.</p><div id="buttons"></div><pre id="status">Ready. Each run records seven seconds of original fixture media, then draws every output frame in the production Browser GPU renderer.</pre><iframe id="renderer" src="/render-frame" width="340" height="340"></iframe><a id="frame-save" download="native-effect-proof.png">Save displayed proof frame</a><a id="encode-save" download="native-effect-proof.h264">Save encoded result</a><a id="report-save" download="native-effect-proof.json">Save proof report</a><script>
const status=document.getElementById('status'), frame=document.getElementById('renderer'), buttons=document.getElementById('buttons');
let configs; const ready=fetch('./configs.json').then(r=>r.json()).then(c=>{configs=c;for(const key of Object.keys(c)){const b=document.createElement('button');b.textContent='Run '+key;b.onclick=()=>run(key).catch(e=>status.textContent='FAIL '+e.stack);buttons.append(b)}});
async function record(w,h){
 const clips=['base','replacement'].map(role=>{const c=document.createElement('canvas');c.width=w;c.height=h;const x=c.getContext('2d',{alpha:false});const draw=f=>{x.fillStyle='#273e50';x.fillRect(0,0,w,h);x.strokeStyle='#456078';for(let y=0;y<h;y+=20){x.beginPath();x.moveTo(0,y);x.lineTo(w,y);x.stroke()}const t=(f/30-(role==='base'?1:2))/4;const at=Math.max(.15,Math.min(.85,.2+.6*t));x.fillStyle=role==='base'?'#ed3030':'#205bef';x.fillRect(w*(at-.04),h*.42,w*.08,h*.2);x.fillStyle='#bdc6ca';x.fillRect(w*.48,0,w*.04,h);};draw(0);const stream=c.captureStream(30),chunks=[];const r=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:3000000});r.ondataavailable=e=>chunks.push(e.data);const done=new Promise(resolve=>r.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());for(let i=0;i<bytes.length-4;i++)if(bytes[i]===0x53&&bytes[i+1]===0xc0&&bytes[i+2]===0x81&&bytes[i+3]===1){bytes[i+3]=0;break}resolve(URL.createObjectURL(new Blob([bytes],{type:'video/webm'})))});r.start();return{draw,r,done}});
 for(let f=1;f<=210;f++){clips.forEach(c=>c.draw(f));await new Promise(r=>setTimeout(r,1000/30))}clips.forEach(c=>c.r.stop());return Promise.all(clips.map(c=>c.done));
}
async function run(key){
 [...buttons.children].forEach(b=>b.disabled=true);status.textContent='Recording original synthetic inputs for '+key;const config=structuredClone(configs[key]),{width:w,height:h}=config;const media=config.inputProps.elements.some(e=>e.type==='video_clip')?await record(w,h):[];const win=frame.contentWindow;
 for(const e of config.inputProps.elements){if(e.type==='video_clip'){const u=media[e.props.title==='Second outfit'?1:0];e.source_url=u;e.props={...e.props,source_width:w,source_height:h,preview_source_url:u,archival_source_url:u}}}
 frame.width=w+8;frame.height=h+8;status.textContent='Loading production Browser GPU scene '+key;while(!win.__dreamcutRender)await new Promise(r=>setTimeout(r,50));await win.__dreamcutRender.load(config);
 await win.__dreamcutRender.startEncode({fps:config.fps,firstFrame:0,bitrate:3000000,keyFrameSeconds:1});const captures=new Map(),results=[];let saved;for(let f=0;f<config.durationInFrames;f++){
 await win.__dreamcutRender.encodeFrame(f);const c=win.document.getElementById('dreamcut-gpu-export');const png=c.toDataURL('image/png');if([0,Math.floor(config.durationInFrames/2),config.durationInFrames-1].includes(f)){captures.set(f,png);saved=png}if(f%15===0)status.textContent='Drawing '+key+' frame '+f+'/'+config.durationInFrames;
 }
 const encoded=await win.__dreamcutRender.finishEncode();document.getElementById('encode-save').href=URL.createObjectURL(new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'application/octet-stream'}));for(const f of [config.durationInFrames-1,0,Math.floor(config.durationInFrames/2)]){await win.__dreamcutRender.frame(f);const png=win.document.getElementById('dreamcut-gpu-export').toDataURL('image/png');if(png!==captures.get(f))throw Error('Repeated seek changed frame '+f);results.push({frame:f,repeatSeekIdentical:true})}
 document.getElementById('frame-save').href=win.document.getElementById('dreamcut-gpu-export').toDataURL('image/png');
 const report={effect:key,provenance:config.provenance||'Original synthetic fixtures; no course pixels',renderer:'production Browser GPU, visible Codex in-app browser',frames:config.durationInFrames,width:w,height:h,repeatSeeks:results,limitations:[config.provenance?'Tutorial-derived inputs; held room plate; not original raw or fresh inputs':'Original synthetic fixtures only','MediaRecorder clock is not a frame-exact performance source','No real hand/contact/shadow or listening acceptance','No human fresh-input certification']};status.textContent='PASS '+JSON.stringify(report,null,2);document.getElementById('report-save').href=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'}));[...buttons.children].forEach(b=>b.disabled=false);
}
</script></body></html>`);
console.log(`${base}/__floating-book-proof/index.html`);

}
main().catch(error => { console.error(error); process.exitCode=1; });
