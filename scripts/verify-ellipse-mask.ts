import {createServer} from 'node:http';
import sharp from 'sharp';
/** Engineering-only encoded mask proof; no project writes or visual acceptance. */
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {renderBrowserVideo} from '../src/lib/render/browser-renderer';
import {runMediaProcess} from '../src/lib/render/audio-export';
const baseUrl=process.env.TIMELINE_EDITOR_BASE_URL??'http://127.0.0.1:3123';
const out=path.resolve('testing/results/ellipse-mask');
const width=320,height=480;
let server:ReturnType<typeof createServer>|undefined;
async function main(){
 // Geometry proof needs lossless capture. In-page WebCodecs uses a bitrate, not CRF.
 process.env.DREAMCUT_EXPORT_CAPTURE='screenshot';
 fs.mkdirSync(out,{recursive:true});
 const png=await sharp({create:{width,height,channels:3,background:'white'}}).png().toBuffer();
 server=createServer((_req,res)=>{res.writeHead(200,{'Content-Type':'image/png','Access-Control-Allow-Origin':'*'});res.end(png);});
 await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
 const source=`http://127.0.0.1:${(server.address() as {port:number}).port}/source.png`;
 const cases=[{rotation:35,feather:.03},{rotation:-25,feather:0},{rotation:0,feather:.02}];
 const receipt=[];
 for(const [index,c] of cases.entries()){
  const actual:Buffer[]=[];
  for(const gpu of [false,true]){
   const file=path.join(out,`${index}-${gpu?'gpu':'standard'}.mp4`);
   await renderBrowserVideo({baseUrl,outputLocation:file,width,height,fps:30,durationInFrames:3,gpu,pictureOnly:true,crf:0,concurrency:1,inputProps:{laneOrderKeys:['visual_0'],elements:[{id:'ellipse',type:'still',source_url:source,timeline_start:0,duration:.1,lane_key:'visual_0',lane_index:0,volume:0,playback_rate:1,trim_start:0,trim_end:0,fade_in:0,fade_out:0,props:{mask_shape:'ellipse',mask_inset:[.35,.08,.45,.2],mask_line_rotation:c.rotation,mask_feather:c.feather}}]}});
   const raw=path.join(out,`${index}-${gpu?'gpu':'standard'}.rgb`);
   await runMediaProcess('ffmpeg',['-v','error','-y','-i',file,'-f','rawvideo','-pix_fmt','rgb24',raw]);
   const bytes=fs.readFileSync(raw);assert.equal(bytes.length,width*height*3*3);
   assert.deepEqual(bytes.subarray(0,width*height*3),bytes.subarray(width*height*3,width*height*6),'static mask changed between encoded frames');
   actual.push(bytes.subarray(0,width*height*3));
  }
  // Independent pixel-centre ellipse equation, including the rotated extrema.
  const cx=.56*width,cy=.45*height,rx=.36*width,ry=.10*height;
  const a=c.rotation*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a),f=c.feather*height/Math.min(rx,ry);
  let delta=0,refError=[0,0],outsideBoxOpaque=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   const dx=x+.5-cx,dy=y+.5-cy,r=Math.hypot((cos*dx+sin*dy)/rx,(-sin*dx+cos*dy)/ry);
   const expected=255*Math.max(0,Math.min(1,f>0?(1-r)/f:.5+(1-r)*Math.min(rx,ry)));
   const i=(y*width+x)*3;
   delta+=Math.abs(actual[0][i]-actual[1][i]);
   for(let backend=0;backend<2;backend++)refError[backend]+=Math.abs(actual[backend][i]-expected);
   if(expected>240&&(y<.35*height||y>.55*height)){outsideBoxOpaque++;assert.ok(actual[0][i]>230&&actual[1][i]>230,'rotated extrema clipped by old rectangle');}
  }
  const mean=delta/(width*height),referenceMean=refError.map(v=>v/(width*height));
  assert.ok(mean<2,`Standard/GPU mean delta ${mean}`);
  for(const n of referenceMean)assert.ok(n<2,`Independent ellipse equation mean delta ${n}`);
  if(c.rotation!==0)assert.ok(outsideBoxOpaque>100,'fixture does not exercise rotated extrema');
  receipt.push({...c,framesPerBackend:3,mean,referenceMean,outsideBoxOpaque});
 }
 fs.writeFileSync(path.join(out,'receipt.json'),JSON.stringify({passed:true,baseUrl,capture:'GPU and Standard screenshots encoded by FFmpeg CRF0; not in-page WebCodecs parity',scope:'synthetic encoded geometry only; not supplied-footage acceptance',cases:receipt},null,2));
 console.log(JSON.stringify(receipt));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server?.close());
