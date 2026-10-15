import { NextResponse } from "next/server";
import {recordToolEvent,toolUsage} from "@/lib/observability/tool-events";
export async function POST(request:Request){try{return NextResponse.json(recordToolEvent(await request.json()));}catch{return NextResponse.json({error:"Invalid tool event"},{status:400});}}
export async function GET(){return NextResponse.json(toolUsage());}
