import {z} from 'zod';
import {nativeSourcePath} from '@/lib/native-preview/source-path';
import {nativeSourceDimensions} from '@/lib/native-preview/source-metadata';
import type {NativeScene} from '@/lib/native-preview/scene';
import {renderNative} from '@/lib/native-preview/worker';
import { readEnv } from '@/lib/env-name';
const finite=z.number().finite();
const schema=z.object({session:z.string().uuid(),scene:z.object({version:z.literal(1),width:z.number().int().min(1).max(540),height:z.number().int().min(1).max(960),layers:z.array(z.object({id:z.string().min(1).max(120),path:z.string().max(2000),frame:z.number().int().min(0).max(1080000),time:finite.min(0).max(36000).optional(),fit:z.enum(['contain','cover']),alpha:z.boolean(),scale:finite.positive().max(10),x:finite.min(-10).max(10),y:finite.min(-10).max(10),opacity:finite.min(0).max(1),mask:z.array(finite.min(0).max(1)).length(4)}).strict()).max(8)}).strict()}).strict();
export async function POST(request:Request,{params}:{params:Promise<{projectId:string}>}){
 if(readEnv("NATIVE_PREVIEW")!=='1')return Response.json({error:'Experimental native preview is disabled'},{status:404});
 try{
  if(Number(request.headers.get('content-length')??0)>65536)throw Error('Request too large');
  const origin=request.headers.get('origin');if(origin&&new URL(origin).host!==request.headers.get('host'))throw Error('Cross-origin preview denied');
  const {projectId}=await params;if(!/^[a-zA-Z0-9_-]+$/.test(projectId))throw Error('Invalid project');
  const text=await request.text();if(text.length>65536)throw Error('Request too large');
  const body=schema.parse(JSON.parse(text));const scene:NativeScene=body.scene;
  for(const layer of scene.layers){const source=nativeSourcePath(projectId,layer.path);layer.id+=`:${source.identity}`;layer.path=source.file;layer.codec=(await nativeSourceDimensions(source.file,source.identity)).codec;}
  const bytes=await renderNative(`${projectId}:${body.session}`,scene);
  if(bytes.length!==body.scene.width*body.scene.height*4)throw Error('Native frame dimensions disagree');
  return new Response(new Uint8Array(bytes),{headers:{'content-type':'application/octet-stream','cache-control':'no-store'}});
 }catch(e){return Response.json({error:e instanceof Error?e.message:'Native preview failed'},{status:400});}
}
