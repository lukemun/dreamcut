import { NextResponse } from "next/server";
import { readWorkspaceTabs, writeWorkspaceTabs } from "@/lib/local-store/workspace-tabs";

export async function GET() {
  try { return NextResponse.json({ open: readWorkspaceTabs() }); }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
}

export async function POST(request: Request) {
  try { return NextResponse.json({ open: writeWorkspaceTabs(await request.json()) }); }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
}
