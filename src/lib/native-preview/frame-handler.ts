import {z} from 'zod';
import {nativeSourceClock,nativeClockPosition,nativeSourceDuration} from '@/lib/native-preview/source-clock';
import {nativeLoopTime} from '@/lib/native-preview/source-time';
import {nativeSourcePath} from '@/lib/native-preview/source-path';
import {nativeSourceDimensions} from '@/lib/native-preview/source-metadata';
import {renderNative,releaseNative} from '@/lib/native-preview/worker';
import {encodeFramePacket,type DecodedFrame} from '@/lib/native-preview/frame-packet';
import { readEnv } from '@/lib/env-name';
const schema=z.object({warmSources:z.array(z.string().max(2000)).max(2).optional(),session:z.string().uuid(),rendering:z.boolean().optional(),maxDimension:z.number().int().min(16).max(4096),frames:z.array(z.object({decoderId:z.string().max(2000).optional(),id:z.string().min(1).max(120),source:z.string().max(2000),time:z.number().finite().min(0).max(36000),alpha:z.boolean(),loop:z.object({start:z.number().finite().min(0),end:z.number().finite().positive().optional()}).strict().optional()}).strict()).max(8)}).strict();
export async function handleNativeFrames(request:Request,{params}:{params:Promise<{projectId:string}>}){
 if(readEnv("NATIVE_PREVIEW")!=='1')return Response.json({error:'Experimental native preview is disabled'},{status:404});
 try{
  const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host'))throw Error('Cross-origin preview denied');
  if(Number(request.headers.get('content-length')??0)>65536)throw Error('Request too large');
  const text=await request.text();if(text.length>65536)throw Error('Request too large');
  const body=schema.parse(JSON.parse(text)),{projectId}=await params;
  if(body.warmSources){
   if(body.frames.length)throw Error('Warmup must be separate from active frame decoding');
   const warm=body.warmSources.map(source=>nativeSourcePath(projectId,source));
   for(const source of warm){await nativeSourceDimensions(source.file,source.identity);await nativeSourceClock(source.file,source.identity);}
   return new Response(null,{status:204});
  }
  if(new Set(body.frames.map(f=>f.id)).size!==body.frames.length)throw Error('Duplicate native frame id');
  // Resolve every source before starting any decoding. A failure publishes no partial batch.
  const sources=body.frames.map(frame=>({...frame,...nativeSourcePath(projectId,frame.source)}));
  const output:DecodedFrame[]=[];
  for(const source of sources){
   const dimensions=await nativeSourceDimensions(source.file,source.identity),scale=Math.min(1,body.maxDimension/Math.max(dimensions.width,dimensions.height));
   const width=Math.max(1,Math.round(dimensions.width*scale)),height=Math.max(1,Math.round(dimensions.height*scale));
   const clock=await nativeSourceClock(source.file,source.identity);
   const time=nativeLoopTime(source.time,nativeSourceDuration(clock,dimensions.duration),source.loop),position=nativeClockPosition(clock,time);
   const pixels=await renderNative(`${projectId}:frames:${body.session}`,{version:1,width,height,transparent:true,retain_decoders:true,retain_ids:sources.map(s=>`${s.decoderId??s.id}:${s.file}:${s.identity}`),layers:[{id:`${source.decoderId??source.id}:${source.file}:${source.identity}`,path:source.file,...position,color:dimensions.color,codec:dimensions.codec,time,frame:0,fit:'contain',alpha:source.alpha,scale:1,x:0,y:0,opacity:1,mask:[0,0,0,0]}]},body.rendering?60000:8000);
   if(pixels.length!==width*height*4)throw Error('Incomplete native decoded frame');output.push({id:source.id,width,height,pixels});
  }
  return new Response(encodeFramePacket(output) as Uint8Array<ArrayBuffer>,{headers:{'content-type':'application/octet-stream','cache-control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Native source batch failed'},{status:400});}
}

export async function releaseNativeFrames(request:Request,{params}:{params:Promise<{projectId:string}>}){
 if(readEnv("NATIVE_PREVIEW")!=='1')return Response.json({error:'Experimental native preview is disabled'},{status:404});
 try{
  const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host'))throw Error('Cross-origin preview denied');
  const text=await request.text();if(text.length>256)throw Error('Request too large');
  const {session}=z.object({session:z.string().uuid()}).strict().parse(JSON.parse(text));
  const {projectId}=await params;
  releaseNative(`${projectId}:frames:${session}`);
  return new Response(null,{status:204});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Native release failed'},{status:400});}
}
