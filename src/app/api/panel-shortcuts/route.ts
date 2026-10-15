import { NextResponse } from "next/server";
import { readPanelShortcuts, writePanelShortcuts } from "@/lib/local-store/panel-shortcuts";

export async function GET() {
  try { return NextResponse.json(readPanelShortcuts()); }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
}

export async function POST(request: Request) {
  try { return NextResponse.json(writePanelShortcuts(await request.json())); }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
}
