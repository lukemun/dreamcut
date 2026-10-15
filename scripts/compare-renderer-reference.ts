/** Migration-only oracle. Reads an explicitly supplied legacy checkout; never vendors its code. */
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {createHash} from "node:crypto";
import sharp from "sharp";
import {readTimeline,readMetadata,activeElements,activeTransitions} from "../src/lib/local-store/store";
import {buildTimelineTransitionLayout} from "../src/lib/timeline/transitions";
import {buildCompositionElements,getCompositionDimensions} from "../src/lib/render/composition-adapters";
import {absolutizeMediaUrls} from "../src/lib/render/pipeline";
import {renderBrowserStill,renderBrowserVideo} from "../src/lib/render/browser-renderer";
import {fingerprintReviewBuild} from "../src/lib/instruments/review-build-cache";
const args=process.argv.slice(2),flag=(name:string)=>args[args.indexOf(name)+1];
async function main(){
 if(!args.includes("--reference-root")||!args.includes("--project"))throw new Error("--reference-root and --project are required");
 const root=path.resolve(flag("--reference-root")),project=flag("--project"),base=flag("--base")||"http://127.0.0.1:3125";
 const require=createRequire(path.join(root,"package.json"));
 const {bundle}=require("@remotion/bundler"),{renderStill,renderMedia,selectComposition}=require("@remotion/renderer");
 const fingerprint=fingerprintReviewBuild(root),cache=path.resolve('.cache/renderer-reference');fs.mkdirSync(cache,{recursive:true});
 const serveUrl=path.join(cache,fingerprint);
 if(!fs.existsSync(path.join(serveUrl,"index.html")))await bundle({entryPoint:path.join(root,"src/lib/remotion/index.ts"),outDir:serveUrl,webpackOverride:(config:any)=>({...config,resolve:{...config.resolve,alias:{...config.resolve?.alias,"@":path.join(root,"src")}}})});
 const timeline=readTimeline(project),metadata=readMetadata(project),layout=buildTimelineTransitionLayout(activeElements(timeline),activeTransitions(timeline));
 const scale=args.includes("--scale")?Number(flag("--scale")):.444444444;
 const canvas=getCompositionDimensions(metadata.output_aspect_ratio);
 const width=Math.round(canvas.width*scale/2)*2,height=Math.round(canvas.height*scale/2)*2,fps=30,durationInFrames=Math.round(layout.effectiveDurationSeconds*fps);
 const inputProps={elements:absolutizeMediaUrls(buildCompositionElements(layout.renderedElements,new Set(metadata.muted_lane_keys)),base),laneOrderKeys:metadata.lane_order_keys,renderScale:scale};
 const composition={...await selectComposition({serveUrl,id:"TimelineComposition",inputProps}),width,height,fps,durationInFrames};
 const output=path.resolve("testing/results/renderer-reference",project);fs.mkdirSync(output,{recursive:true});
 const frames=[...new Set([0,1,...[.1,.25,.5,.75,.9].map(t=>Math.floor(durationInFrames*t)),durationInFrames-1])];
 const measurements=[];
 for(const frame of args.includes("--candidate-only")?[]:frames){
  const reference=path.join(output,`reference-${frame}.png`),candidate=path.join(output,`candidate-${frame}.png`);
  await renderStill({serveUrl,composition,inputProps,frame,output:reference,imageFormat:"png",chromiumOptions:{gl:"angle"},timeoutInMilliseconds:120000});
  await renderBrowserStill({baseUrl:base,width,height,fps,durationInFrames,inputProps,frame,output:candidate});
  const a=await sharp(reference).removeAlpha().raw().toBuffer(),b=await sharp(candidate).removeAlpha().raw().toBuffer();
  let total=0,squared=0,changed=0;for(let i=0;i<a.length;i++){const d=Math.abs(a[i]-b[i]);total+=d;squared+=d*d;if(d>8)changed++;}
  const sample={frame,meanAbsoluteDelta:total/a.length,psnr:squared?10*Math.log10(255**2/(squared/a.length)):null,channelFractionOver8:changed/a.length};measurements.push(sample);console.log(sample);
 }
 if(args.includes("--video")){
  if(!args.includes("--candidate-only")) await renderMedia({serveUrl,composition,inputProps,outputLocation:path.join(output,"reference.mp4"),codec:"h264",imageFormat:"png",concurrency:2,chromiumOptions:{gl:"angle"},timeoutInMilliseconds:120000});
  await renderBrowserVideo({baseUrl:base,width,height,fps,durationInFrames,inputProps,outputLocation:path.join(output,"candidate.mp4"),concurrency:2});
 }
 if(args.includes("--candidate-only")){console.log("Candidate-only export completed; no parity verdict written.");return;}
 fs.writeFileSync(path.join(output,"latest.json"),JSON.stringify({project,referenceRoot:root,referenceFingerprint:fingerprint,timelineSha256:createHash('sha256').update(JSON.stringify(timeline)).digest('hex'),width,height,fps,durationInFrames,measurements,videoRendered:args.includes("--video"),passed:measurements.every(m=>m.meanAbsoluteDelta<3&&m.channelFractionOver8<.05)},null,2));
 if(measurements.some(m=>m.meanAbsoluteDelta>=3||m.channelFractionOver8>=.05))process.exitCode=1;
}
main().catch(error=>{console.error(error);process.exitCode=1});
