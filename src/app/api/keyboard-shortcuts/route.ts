import { NextResponse } from "next/server";
import { readKeyboardShortcuts, writeKeyboardShortcuts } from "@/lib/local-store/keyboard-shortcuts";

export async function GET() {
  try { return NextResponse.json(readKeyboardShortcuts()); }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
}

export async function POST(request: Request) {
  try { return NextResponse.json(writeKeyboardShortcuts(await request.json())); }
  catch (error) { return NextResponse.json({ error: String(error) }, { status: 400 }); }
}
