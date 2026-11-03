import {z} from 'zod';
import {assertProject} from '@/lib/local-store/store';
import {preparedWorker} from '@/lib/render/prepared-client';
import {streamFileResponse} from '@/lib/local-store/stream-file';
import type {PreparedPreviewInput} from '@/lib/timeline/prepared-preview';
import { readEnv } from '@/lib/env-name';
type Context={params:Promise<{projectId:string}>};
const schema=z.object({owner:z.string().uuid(),sequence:z.number().int().nonnegative(),input:z.object({backend:z.enum(['standard','rust']).optional(),width:z.number().int().min(2).max(3840).multipleOf(2),height:z.number().int().min(2).max(3840).multipleOf(2),fps:z.literal(30),durationInFrames:z.number().int().min(1).max(1800),frameRange:z.tuple([z.number().int().nonnegative(),z.number().int().nonnegative()]).optional(),inputProps:z.object({elements:z.array(z.object({id:z.string(),type:z.string(),source_url:z.string().nullable(),props:z.record(z.string(),z.unknown()).nullish(),timeline_start:z.number().nonnegative(),duration:z.number().positive(),lane_key:z.string(),lane_index:z.number(),volume:z.number(),playback_rate:z.number().positive(),trim_start:z.number().nonnegative(),trim_end:z.number().nullable(),fade_in:z.number(),fade_out:z.number()}).passthrough()).max(256),laneOrderKeys:z.array(z.string()).optional(),renderScale:z.number().positive().optional(),externalAudioPreview:z.boolean().optional()})})});
const failure=(e:unknown)=>Response.json({error:e instanceof Error?e.message:'Preview preparation failed'},{status:400});
function assertEditorOrigin(request: Request) {
 const url=new URL(request.url);
 // Next may reconstruct request.url with its internal listening hostname.
 // Host is the browser-facing authority; never trust forwarded host headers.
 const host=request.headers.get('host') ?? url.host;
 const expected=`${url.protocol}//${host}`;
 const authority=new URL(expected);
 if(authority.host!==host || !['localhost','127.0.0.1','[::1]'].includes(authority.hostname)) throw new Error('Prepared playback requires the local editor.');
 const origin=request.headers.get('origin');
 const site=request.headers.get('sec-fetch-site');
 if((origin && origin!==expected) || (site && site!=='same-origin' && site!=='none')) throw new Error('Cross-origin preview access is forbidden.');
 return expected;
}
export async function POST(request:Request,{params}:Context){try{const origin=assertEditorOrigin(request);
 const {projectId}=await params;assertProject(projectId);
 const raw=await request.text();if(raw.length>2_000_000)throw new Error('Preview configuration is too large.');
 const body=schema.parse(JSON.parse(raw));
 if(body.input.backend==='rust' && readEnv("NATIVE_PREVIEW")!=='1')throw new Error('Rust preparation is unavailable. Select Standard or enable the Rust helper.');
 if(body.input.frameRange && (body.input.frameRange[1]<body.input.frameRange[0] || body.input.frameRange[1]>=body.input.durationInFrames))throw new Error('Invalid preview frame range');
 return Response.json(await preparedWorker.start(projectId,body.owner,body.input as PreparedPreviewInput,origin,body.sequence),{status:202});
}catch(e){return failure(e);}}
export async function GET(request:Request,{params}:Context){try{assertEditorOrigin(request);
 const {projectId}=await params;assertProject(projectId);const url=new URL(request.url),id=z.string().uuid().parse(url.searchParams.get('id'));
 if(url.searchParams.has('file'))return streamFileResponse(await preparedWorker.file(projectId,id),request,{contentType:'video/mp4'});
 return Response.json(await preparedWorker.status(projectId,id),{headers:{'Cache-Control':'no-store'}});
}catch(e){return failure(e);}}
export async function DELETE(request:Request,{params}:Context){try{assertEditorOrigin(request);const {projectId}=await params;assertProject(projectId);await preparedWorker.cancel(projectId,z.string().uuid().parse(new URL(request.url).searchParams.get('id')));return Response.json({ok:true});}catch(e){return failure(e);}}
