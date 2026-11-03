import { NextResponse } from "next/server";

// Local projects have no character system; the timeline UI only uses this to
// label audio lanes by character name.
export async function GET() {
  return NextResponse.json({ characters: [] });
}
