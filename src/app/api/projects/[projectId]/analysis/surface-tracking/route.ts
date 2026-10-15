import { NextResponse } from "next/server";
import { assertProject } from "@/lib/local-store/store";
import { prepareSurfaceTracking,readSurfaceTrackingJob } from "@/lib/media-analysis/surface-tracking";
type Context={params:Promise<{projectId:string}>};
export async function POST(request:Request,{params}:Context){try{
  const {projectId}=await params;assertProject(projectId);
  return NextResponse.json(await prepareSurfaceTracking(projectId,await request.json()));
}catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}}
export async function GET(request:Request,{params}:Context){try{
  const {projectId}=await params;assertProject(projectId);
  return NextResponse.json(readSurfaceTrackingJob(projectId,new URL(request.url).searchParams.get("id")??""));
}catch(e){return NextResponse.json({error:e instanceof Error?e.message:String(e)},{status:400});}}
